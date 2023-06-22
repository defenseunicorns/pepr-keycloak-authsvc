import {
  AppsV1Api,
  CoreV1Api,
  KubeConfig,
  V1Secret,
} from "@kubernetes/client-node";

import { fetchStatus } from "pepr";

export class K8sAPI {
  k8sApi: CoreV1Api;
  k8sAppsV1Api: AppsV1Api;

  constructor() {
    const kc = new KubeConfig();
    kc.loadFromDefault();
    this.k8sApi = kc.makeApiClient(CoreV1Api);
    this.k8sAppsV1Api = kc.makeApiClient(AppsV1Api);
  }

  async getSecretValues(
    name: string,
    namespace: string,
    keys: string[]
  ): Promise<{ [key: string]: string }> {
    const response = await this.k8sApi.readNamespacedSecret(name, namespace);
    const secret = response.body.data;
    const secretValues: { [key: string]: string } = {};

    if (secret) {
      keys.forEach(key => {
        if (secret[key]) {
          // Decode the base64 encoded secret value
          const decodedValue = Buffer.from(secret[key], "base64").toString(
            "utf-8"
          );
          secretValues[key] = decodedValue;
        } else {
          throw new Error(`Could not find key '${key}' in the secret ${name}`);
        }
      });
      return secretValues;
    }
    throw new Error(`Could not retrieve the secret ${name}`);
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
      { headers: { "content-type": "application/json-patch+json" } }
    );
  }

  async getSecretsByLabeSelector(labelSelector: string): Promise<V1Secret[]> {
    // Get all secrets in the namespace
    const secrets = await this.k8sApi.listSecretForAllNamespaces(
      null,
      null,
      null,
      labelSelector
    );
    if (!secrets || !secrets.body || !secrets.body.items) {
      return [];
    }

    return secrets.body.items;
  }

  async createOrUpdateSecret(
    name: string,
    namespace: string,
    secretData: Record<string, string>,
    labels?: { [key: string]: string }
  ) {
    // Prepare the Secret object
    const secret: V1Secret = {
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
}
