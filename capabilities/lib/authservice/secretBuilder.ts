import { Log, k8s } from "pepr";
import { K8sAPI } from "../kubernetes-api";
import { AuthserviceConfig } from "./secretConfig";
import { createHash } from "crypto";
import { ascend, path, reject, sortWith } from "ramda";

interface UpdateEvent {
  secret: k8s.V1Secret;
  isDelete: boolean;
}

export class AuthServiceSecretBuilder {
  k8sApi: K8sAPI;

  authServiceNamespace = "authservice";
  authServiceSecretName = "authservice";
  authServiceConfigFileName = "config.json";

  constructor(k8sApi: K8sAPI) {
    this.k8sApi = k8sApi;
  }

  private decodeBase64(secret: k8s.V1Secret, key: string): string {
    if (!secret.data) {
      throw new Error("Data is missing in secret");
    }
    if (!secret.data[key]) {
      throw new Error(`Key ${key} is missing in secret`);
    }
    return Buffer.from(secret.data[key], "base64").toString("utf-8");
  }

  private sortSecrets(secrets: k8s.V1Secret[]): k8s.V1Secret[] {
    return sortWith([
      ascend(path(["metadata", "name"])),
      ascend(path(["metadata", "namespace"])),
    ])(secrets);
  }

  secretToAuthServiceConfig(secret: k8s.V1Secret): AuthserviceConfig {
    const secretData = this.k8sApi.getSecretValues(secret, [
      this.authServiceConfigFileName,
    ]);
    return new AuthserviceConfig(
      JSON.parse(secretData[this.authServiceConfigFileName]),
    );
  }

  async update(e: UpdateEvent) {
    await this.buildSecretList(e.secret, e.isDelete)
      .then(this.buildAuthServiceConfig)
      .then(this.updateAuthServiceSecret);
  }

  async buildSecretList(
    updatedSecret: k8s.V1Secret,
    isDelete: boolean,
    labelSelector = "pepr.dev/keycloak=oidcconfig",
  ): Promise<k8s.V1Secret[]> {
    let missionSecrets =
      await this.k8sApi.getSecretsByLabelSelector(labelSelector);

    function isEqual(s: k8s.V1Secret) {
      return (secret: k8s.V1Secret) =>
        secret.metadata.name === s?.metadata?.name &&
        secret.metadata.namespace === s?.metadata?.namespace;
    }

    // remove incoming secret if it exists
    missionSecrets = reject(isEqual(updatedSecret), missionSecrets);

    // if its an add/update op, add back to list
    if (!isDelete) {
      missionSecrets = [...missionSecrets, updatedSecret];
    }

    // sort by name, namespace
    return this.sortSecrets(missionSecrets);
  }

  async getAuthServiceConfig(): Promise<AuthserviceConfig> {
    const response = await this.k8sApi.k8sApi.readNamespacedSecret(
      this.authServiceSecretName,
      this.authServiceNamespace,
    );

    return this.secretToAuthServiceConfig(response.body);
  }

  async buildAuthServiceConfig(
    secrets: k8s.V1Secret[],
  ): Promise<AuthserviceConfig> {
    const authServiceConfig = await this.getAuthServiceConfig();

    authServiceConfig.chains = secrets.map(secret => {
      const name = this.decodeBase64(secret, "name");
      const domain = this.decodeBase64(secret, "domain");
      const id = this.decodeBase64(secret, "id");
      return AuthserviceConfig.createSingleChain({
        id,
        name,
        hostname: `${name}.${domain}`,
        redirect_uri: this.decodeBase64(secret, "redirectUri"),
        secret: this.decodeBase64(secret, "clientSecret"),
      });
    });

    // In the event that we've deleted the chain, create a placeholder to keep authservice from crashing
    if (authServiceConfig.chains.length === 0) {
      authServiceConfig.chains.push(
        AuthserviceConfig.createSingleChain({
          id: "placeholderId",
          name: "placeholderName",
          hostname: "localhost.localhost",
          redirect_uri: "https://localhost.localhost",
          secret: "placeholderSecret",
        }),
      );
    }

    return authServiceConfig;
  }

  async updateAuthServiceSecret(authserviceConfig: AuthserviceConfig) {
    const config = JSON.stringify(authserviceConfig);
    const configHash = createHash("sha256").update(config).digest("hex");

    const didItWork = await this.k8sApi.patchSecret(
      this.authServiceSecretName,
      this.authServiceNamespace,
      {
        [this.authServiceConfigFileName]: config,
      },
    );

    if (didItWork) {
      Log.info("Updated secret succesfully", "updateAuthServiceSecret");
      await this.k8sApi.checksumDeployment(
        "authservice",
        "authservice",
        configHash,
      );
    } else {
      Log.error(
        "Patching AuthService Secret failed (out of sync)",
        "updateAuthServiceSecret",
      );
    }
  }
}
