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

  async buildAuthserviceSecret(
    labelSelector: string,
    deleteSecret?: V1Secret,
    addSecret?: V1Secret
  ): Promise<string> {
    let configHash = "";

    for (let didItWork = false; !didItWork; ) {
      const missionSecrets = await this.getSecrets(
        labelSelector,
        deleteSecret,
        addSecret
      );

      if (missionSecrets.length == 0) {
        return;
      }

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

      const config = JSON.stringify(authserviceConfig);
      configHash = createHash("sha256").update(config).digest("hex");
      didItWork = await this.k8sApi.patchSecret(existingSecret, {
        [this.authServiceConfigFileName]: config,
      });
      if (!didItWork) {
        Log.info("Failed to update secret, retrying");
      }
    }

    return configHash;
  }
}
