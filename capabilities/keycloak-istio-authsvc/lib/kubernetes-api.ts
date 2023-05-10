// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2023-Present The Pepr Authors

import {
  CoreV1Api,
  CustomObjectsApi,
  KubeConfig,
} from "@kubernetes/client-node";

export class K8sAPI {
  k8sApi: CoreV1Api;

  constructor() {
    const kc = new KubeConfig();
    kc.loadFromDefault();
    this.k8sApi = kc.makeApiClient(CoreV1Api);
  }

  async getSecretValue(
    namespace: string,
    secretName: string,
    key: string
  ): Promise<string> {
    const response = await this.k8sApi.readNamespacedSecret(
      secretName,
      namespace
    );
    const secret = response.body.data;

    if (secret && secret[key]) {
      // Decode the base64 encoded secret value
      const decodedValue = Buffer.from(secret[key], "base64").toString("utf-8");
      return decodedValue;
    }
    throw new Error(`Could not find key '${key}' in the secret ${secretName}`);
  }

  // XXX: TODO:
  async createResources() {
    const kc = new KubeConfig();
    kc.loadFromDefault();

    // Create a customObjectsApi client to interact with the Istio resources
    const customObjectsApi = kc.makeApiClient(CustomObjectsApi);

    // Namespace where the resources will be created
    const namespace = "your-namespace";

    // Define the RequestAuthentication resource
    const requestAuthentication = {
      apiVersion: "security.istio.io/v1",
      kind: "RequestAuthentication",
      metadata: {
        name: "your-request-authentication",
        namespace: namespace,
      },
      spec: {
        selector: {
          matchLabels: {
            app: "your-app-label",
          },
        },
        jwtRules: [
          {
            issuer: "your-issuer",
            jwksUri: "https://your-jwks-uri.example.com/.well-known/jwks.json",
          },
        ],
      },
    };

    // Define the AuthorizationPolicy resource
    const authorizationPolicy = {
      apiVersion: "security.istio.io/v1b",
      kind: "AuthorizationPolicy",
      metadata: {
        name: "your-authorization-policy",
        namespace: namespace,
      },
      spec: {
        selector: {
          matchLabels: {
            app: "your-app-label",
          },
        },
        action: "ALLOW",
        rules: [
          {
            from: [
              {
                source: {
                  requestPrincipals: ["*"],
                },
              },
            ],
            to: [
              {
                operation: {
                  methods: ["GET", "POST", "PUT", "DELETE"],
                  paths: ["/your/api/path/*"],
                },
              },
            ],
          },
        ],
      },
    };

    kc.makeApiClient(CoreV1Api);

    // Create the RequestAuthentication resource
    const reqAuthResult = await customObjectsApi.createNamespacedCustomObject(
      "security.istio.io",
      "v1",
      requestAuthentication.kind.toLowerCase() + "s",
      namespace,
      requestAuthentication
    );
    console.log("RequestAuthentication created:", reqAuthResult.body);

    // Create the AuthorizationPolicy resource

    await customObjectsApi.createNamespacedCustomObject(
      "security.istio.io",
      "v1beta1",
      authorizationPolicy.kind.toLowerCase() + "s",
      namespace,
      authorizationPolicy
    );
  }

  async createSecret(secretName, namespace, location, text) {
    // Create the Secret object
    const secret = {
      apiVersion: "v1",
      kind: "Secret",
      metadata: {
        name: secretName,
        namespace: namespace,
      },
      data: {
        [location]: Buffer.from(text).toString("base64"),
      },
    };

    await this.k8sApi.createNamespacedSecret(namespace, secret);
  }
}
