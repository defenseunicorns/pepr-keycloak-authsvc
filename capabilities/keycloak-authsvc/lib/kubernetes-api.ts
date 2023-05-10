import {
  CoreV1Api,
  CustomObjectsApi,
  KubeConfig,
} from "@kubernetes/client-node";

export class K8sAPI {
  k8sApi: CoreV1Api;
  customObjectsApi: CustomObjectsApi;

  constructor() {
    const kc = new KubeConfig();
    kc.loadFromDefault();
    this.k8sApi = kc.makeApiClient(CoreV1Api);
    this.customObjectsApi = kc.makeApiClient(CustomObjectsApi);
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

  // authn can be in the namespace with the app
  async CreateRequestAuthentication(
    namespace: string,
    name: string,
    issuer: string,
    jwksUri: string
  ) {
    // Define the RequestAuthentication resource
    const requestAuthentication = {
      apiVersion: "security.istio.io/v1",
      kind: "RequestAuthentication",
      metadata: {
        name: name,
        namespace: namespace,
      },
      spec: {
        selector: {
          matchLabels: {
            protect: "keycloak", // XXX: BDW: TODO, this doesn't have to be this
          },
        },
        jwtRules: [
          {
            issuer: issuer,
            jwksUri: jwksUri,
          },
        ],
      },
    };

    // Create the RequestAuthentication resource
    await this.customObjectsApi.createNamespacedCustomObject(
      "security.istio.io",
      "v1",
      namespace,
      requestAuthentication.kind.toLowerCase() + "s",
      requestAuthentication
    );
  }

  async createResources(namespace: string, name: string) {
    // Define the AuthorizationPolicy resource
    const authorizationPolicy = {
      apiVersion: "security.istio.io/v1b",
      kind: "AuthorizationPolicy",
      metadata: {
        name: name,
        namespace: namespace,
      },
      spec: {
        selector: {
          matchLabels: {
            protect: "keycloak", // XXX: BDW: TODO
          },
        },
        rules: [
          {
            from: [
              {
                source: {
                  requestPrincipals: [
                    "https://keycloak.bigbang.dev/auth/realms/cocowow/*",
                  ],
                },
              },
            ],
          },
        ],
      },
    };

    // Create the AuthorizationPolicy resource
    const authPolicyResult =
      await this.customObjectsApi.createNamespacedCustomObject(
        "security.istio.io",
        "v1beta1",
        namespace,
        authorizationPolicy.kind.toLowerCase() + "s",
        authorizationPolicy
      );
  }

  async createOrUpdateSecret(secretName, namespace, location, text) {
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

    try {
      // Check if the Secret exists
      await this.k8sApi.readNamespacedSecret(secretName, namespace);

      // If the Secret exists, update it
      await this.k8sApi.replaceNamespacedSecret(secretName, namespace, secret);
    } catch (e) {
      if (e.response && e.response.statusCode === 404) {
        await this.k8sApi.createNamespacedSecret(namespace, secret);
      } else {
        throw e;
      }
    }
  }
}
