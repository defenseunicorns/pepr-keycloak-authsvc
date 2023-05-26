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

  async getSecretValue(
    name: string,
    namespace: string,
    key: string
  ): Promise<string> {
    const response = await this.k8sApi.readNamespacedSecret(name, namespace);
    const secret = response.body.data;

    if (secret && secret[key]) {
      // Decode the base64 encoded secret value
      const decodedValue = Buffer.from(secret[key], "base64").toString("utf-8");
      return decodedValue;
    }
    throw new Error(`Could not find key '${key}' in the secret ${name}`);
  }

  async restartDeployment(name: string, namespace: string) {
    const patch = [
      {
        op: "add",
        path: "/spec/template/metadata/annotations/kubectl.kubernetes.io~1restartedAt",
        value: new Date().toISOString(),
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

  async restartStatefulset(name: string, namespace: string) {
    const patch = [
      {
        op: "add",
        path: "/spec/template/metadata/annotations/kubectl.kubernetes.io~1restartedAt",
        value: new Date().toISOString(),
      },
    ];
    await this.k8sAppsV1Api.patchNamespacedStatefulSet(
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

  // the module does own this.
  async patchDeploymentForKeycloak(name: string, namespace: string) {
    const patch = [
      {
        op: "add",
        path: "/spec/template/metadata/labels/protect",
        value: "keycloak",
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

  async getSecretsByPattern(pattern: string, namespace: string) {
    // Get all secrets in the namespace
    const secrets = await this.k8sApi.listNamespacedSecret(namespace);
    if (!secrets || !secrets.body || !secrets.body.items) {
      return [];
    }

    // Filter the secrets by the provided pattern
    const matchingSecrets = secrets.body.items.filter(
      secret =>
        secret.metadata &&
        secret.metadata.name &&
        secret.metadata.name.startsWith(pattern)
    );

    return matchingSecrets;
  }

  async createOrUpdateSecret(
    name: string,
    namespace: string,
    secretData: Record<string, string>
  ) {
    // Prepare the Secret object
    const secret: V1Secret = {
      apiVersion: "v1",
      kind: "Secret",
      metadata: {
        name: name,
        namespace: namespace,
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
