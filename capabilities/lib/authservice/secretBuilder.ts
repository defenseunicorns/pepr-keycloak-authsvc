import { Log } from "pepr";
import { K8sAPI } from "../kubernetes-api";
import { AuthserviceConfig } from "./secretConfig";
import { createHash } from "crypto";
import { ascend, path, reject, sortWith } from "ramda";
import { CustomSecret } from "./customSecret";

interface UpdateEvent {
  secret: CustomSecret;
  isDelete: boolean;
}

export class AuthServiceSecretBuilder {
  authServiceNamespace = "authservice";
  authServiceSecretName = "authservice";
  authServiceConfigFileName = "config.json";

  constructor() {}

  private sortSecrets(secrets: CustomSecret[]): CustomSecret[] {
    return sortWith([
      ascend(path(["metadata", "name"])),
      ascend(path(["metadata", "namespace"])),
    ])(secrets);
  }

  secretToAuthServiceConfig(secret: CustomSecret): AuthserviceConfig {
    return new AuthserviceConfig(
      JSON.parse(secret.getStringData(this.authServiceConfigFileName)),
    );
  }

  async update(e: UpdateEvent) {
    await this.buildSecretList(e.secret, e.isDelete)
      .then(this.buildAuthServiceConfig)
      .then(this.updateAuthServiceSecret);
  }

  async buildSecretList(
    updatedSecret: CustomSecret,
    isDelete: boolean,
    labelSelector = { "pepr.dev/keycloak": "oidcconfig" },
  ) {
    let missionSecrets = await K8sAPI.getSecretsByLabelSelector(labelSelector);

    function isEqual(s: CustomSecret) {
      return (secret: CustomSecret) =>
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
    const response = await K8sAPI.getSecret(
      this.authServiceSecretName,
      this.authServiceNamespace,
    );

    return this.secretToAuthServiceConfig(response);
  }

  async buildAuthServiceConfig(
    secrets: CustomSecret[],
  ): Promise<AuthserviceConfig> {
    const authServiceConfig = await this.getAuthServiceConfig();

    authServiceConfig.chains = secrets.map(secret => {
      const name = secret.getStringData("name");
      const domain = secret.getStringData("domain");
      const id = secret.getStringData("id");
      return AuthserviceConfig.createSingleChain({
        id,
        name,
        hostname: `${name}.${domain}`,
        redirect_uri: secret.getStringData("redirectUri"),
        secret: secret.getStringData("clientSecret"),
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

    const updatedSecret = await K8sAPI.applySecret(
      new CustomSecret({
        metadata: {
          name: this.authServiceSecretName,
          namespace: this.authServiceNamespace,
        },
        data: {
          [this.authServiceConfigFileName]: config,
        },
      }),
    );

    if (updatedSecret) {
      Log.info("Updated secret succesfully", "updateAuthServiceSecret");

      K8sAPI.checksumDeployment("authservice", "authservice", configHash);
    } else {
      Log.error(
        "Patching AuthService Secret failed (out of sync)",
        "updateAuthServiceSecret",
      );
    }
  }
}
