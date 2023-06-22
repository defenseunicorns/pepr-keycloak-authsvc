import { K8sAPI } from "../kubernetes-api";
import { AuthserviceConfig } from "./secretConfig";
import { V1Secret } from "@kubernetes/client-node";
import { createHash } from "crypto";

export class AuthServiceSecretBuilder {
  k8sApi: K8sAPI;

  authServiceNamespace = "authservice";
  authServiceSecretName = "authservice";
  authServiceConfigFileName = "config.json";

  constructor(k8sApi: K8sAPI) {
    this.k8sApi = k8sApi;
  }

  private decodeBase64(secret: V1Secret, key: string): string {
    if (!secret.data) {
      throw new Error("Data is missing in secret");
    }
    if (!secret.data[key]) {
      throw new Error(`Key ${key} is missing in secret`);
    }
    return Buffer.from(secret.data[key], "base64").toString("utf-8");
  }

  async getAuthServiceSecret(): Promise<AuthserviceConfig> {
    const secretData = await this.k8sApi.getSecretValues(
      this.authServiceSecretName,
      this.authServiceNamespace,
      [this.authServiceConfigFileName]
    );
    return new AuthserviceConfig(
      JSON.parse(secretData[this.authServiceConfigFileName])
    );
  }

  async buildAuthserviceSecret(labelSelector: string): Promise<string> {
    const missionSecrets = await this.k8sApi.getSecretsByLabeSelector(
      labelSelector
    );

    if (missionSecrets.length == 0) {
      return;
    }
    const authserviceConfig = await this.getAuthServiceSecret();

    authserviceConfig.chains = missionSecrets.map(secret => {
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

    const config = JSON.stringify(authserviceConfig);
    const configHash = createHash("sha256").update(config).digest("hex");

    await this.k8sApi.createOrUpdateSecret(
      this.authServiceNamespace,
      this.authServiceSecretName,
      { [this.authServiceConfigFileName]: config }
    );

    return configHash;
  }
}
