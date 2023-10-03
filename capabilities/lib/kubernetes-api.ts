import { fetchStatus, k8s } from "pepr";

export class K8sAPI {
  k8sApi: k8s.CoreV1Api;
  k8sAppsV1Api: k8s.AppsV1Api;

  constructor() {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    this.k8sApi = kc.makeApiClient(k8s.CoreV1Api);
    this.k8sAppsV1Api = kc.makeApiClient(k8s.AppsV1Api);
  }

  getSecretValues(
    inputSecret: k8s.V1Secret,
    keys: string[],
  ): { [key: string]: string } {
    const secret = inputSecret.data;
    const secretValues: { [key: string]: string } = {};

    if (secret) {
      keys.forEach(key => {
        if (secret[key]) {
          // Decode the base64 encoded secret value
          const decodedValue = Buffer.from(secret[key], "base64").toString(
            "utf-8",
          );
          secretValues[key] = decodedValue;
        } else {
          throw new Error(
            `Could not find key '${key}' in the secret ${inputSecret.metadata?.name}`,
          );
        }
      });
      return secretValues;
    }
    throw new Error(
      `Could not retrieve the secret ${inputSecret.metadata?.name}`,
    );
  }

  async checksumDeployment(name: string, namespace: string, checksum: string) {
    const patch = [
      {
        op: "add",
        path: "/spec/template/metadata/annotations/pepr.dev~1checksum",
        value: checksum,
      },
    ];

    await this.k8sAppsV1Api.patchNamespacedDeployment(
      name,
      namespace,
      patch,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { headers: { "content-type": "application/json-patch+json" } },
    );
  }

  async getSecretsByLabelSelector(
    labelSelector: string,
  ): Promise<k8s.V1Secret[]> {
    const secrets = await this.k8sApi.listSecretForAllNamespaces(
      null,
      null,
      null,
      labelSelector,
    );
    return secrets?.body?.items || [];
  }

  async upsertSecret(
    name: string,
    namespace: string,
    secretData: Record<string, string>,
    labels?: { [key: string]: string },
  ) {
    // Prepare the Secret object
    const secret: k8s.V1Secret = {
      apiVersion: "v1",
      kind: "Secret",
      metadata: {
        name: name,
        namespace: namespace,
        labels,
      },
      data: {},
    };

    // Convert all the secretData values to base64 and add them to the Secret object
    for (const key in secretData) {
      secret.data[key] = Buffer.from(secretData[key]).toString("base64");
    }

    try {
      // Check if the Secret exists
      await this.k8sApi.readNamespacedSecret(name, namespace);

      // If the Secret exists, update it
      await this.k8sApi.replaceNamespacedSecret(name, namespace, secret);
    } catch (e) {
      if (e.response && e.response.statusCode === fetchStatus.NOT_FOUND) {
        // If the Secret doesn't exist, create it
        await this.k8sApi.createNamespacedSecret(namespace, secret);
      } else {
        throw e;
      }
    }
  }

  async patchSecret(
    name: string,
    namespace: string,
    secretData: Record<string, string>,
  ): Promise<boolean> {
    const data = {};

    for (const key in secretData) {
      data[key] = Buffer.from(secretData[key]).toString("base64");
    }
    try {
      // If the Secret exists, update it
      await this.k8sApi.patchNamespacedSecret(
        name,
        namespace,
        { data },
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { headers: { "content-type": "application/merge-patch+json" } },
      );
      return true;
    } catch (e) {
      // Check to see if we're out of sync.
      if (e.response && e.response.statusCode === 409) {
        // Conflict due to version mismatch
        return false;
      } else {
        throw e;
      }
    }
  }

  async deleteSecret(name: string, namespace: string) {
    try {
      await this.k8sApi.deleteNamespacedSecret(name, namespace);
    } catch (e) {
      if (e.response?.statusCode === fetchStatus.NOT_FOUND) {
        return;
      } else {
        throw e;
      }
    }
  }
}
