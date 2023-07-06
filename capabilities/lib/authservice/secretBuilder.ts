import { Log } from "pepr";
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

  getAuthServiceSecret(inputSecret: V1Secret): AuthserviceConfig {
    const secretData = this.k8sApi.getSecretValues(inputSecret, [
      this.authServiceConfigFileName,
    ]);
    return new AuthserviceConfig(
      JSON.parse(secretData[this.authServiceConfigFileName])
    );
  }

  private removeSecret(removeMe: V1Secret, secrets: V1Secret[]): V1Secret[] {
    if (removeMe === undefined) {
      return secrets;
    }
    return secrets.filter(
      secret =>
        secret.metadata?.name !== removeMe.metadata?.name ||
        secret.metadata?.namespace !== removeMe.metadata?.namespace
    );
  }

  private async getSecrets(
    labelSelector: string,
    deleteSecret?: V1Secret,
    addSecret?: V1Secret
  ): Promise<V1Secret[]> {
    let missionSecrets = await this.k8sApi.getSecretsByLabelSelector(
      labelSelector
    );

    missionSecrets = this.removeSecret(deleteSecret, missionSecrets);
    missionSecrets = this.removeSecret(addSecret, missionSecrets);
    if (addSecret) {
      missionSecrets = [...missionSecrets, addSecret];
    }

    missionSecrets.sort((a, b) => {
      const nameCompare = a.metadata?.name?.localeCompare(
        b.metadata?.name || ""
      );
      if (nameCompare !== 0) return nameCompare;
      return (a.metadata?.namespace || "").localeCompare(
        b.metadata?.namespace || ""
      );
    });
    return missionSecrets;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async updateAuthServiceSecret(
    labelSelector: string,
    addSecret?: V1Secret,
    deleteSecret?: V1Secret,
    retryMax: number = 10
  ): Promise<string> {
    for (let retries = 0; retries < retryMax; retries++) {
      const missionSecrets = await this.getSecrets(
        labelSelector,
        deleteSecret,
        addSecret
      );

      const response = await this.k8sApi.k8sApi.readNamespacedSecret(
        this.authServiceSecretName,
        this.authServiceNamespace
      );
      const existingSecret = response.body;
      const authserviceConfig = this.getAuthServiceSecret(existingSecret);

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

      // In the event that we've deleted the chain, create a placeholder to keep authservice from crashing
      if (authserviceConfig.chains.length === 0) {
        authserviceConfig.chains.push(AuthserviceConfig.createSingleChain({
          id: "placeholderId",
          name: "placeholderName",
          hostname: "localhost.localhost",
          redirect_uri: "https://localhost.localhost",
          secret: "placeholderSecret",
        }))
      }

      const config = JSON.stringify(authserviceConfig);
      const configHash = createHash("sha256").update(config).digest("hex");
      const didItWork = await this.k8sApi.patchSecret(existingSecret, {
        [this.authServiceConfigFileName]: config,
      });
      if (didItWork) {
        Log.info("Updated secret", "updateAuthServiceSecret");
        return configHash;
      }
      Log.info("Patching AuthService Secret failed (out of sync), will retry", "updateAuthServiceSecret");
      this.delay(1000);
    }
    Log.error(`Patching AuthService Secret failed after ${retryMax} attempts`, "updateAuthServiceSecret");
    return undefined;
  }
}
