import {
  AppsV1Api,
  CoreV1Api,
  CustomObjectsApi,
  KubeConfig,
} from "@kubernetes/client-node";

export class K8sAPI {
  k8sApi: CoreV1Api;
  customObjectsApi: CustomObjectsApi;
  k8sAppsV1Api: AppsV1Api;

  constructor() {
    const kc = new KubeConfig();
    kc.loadFromDefault();
    this.k8sApi = kc.makeApiClient(CoreV1Api);
    this.customObjectsApi = kc.makeApiClient(CustomObjectsApi);
    this.k8sAppsV1Api = kc.makeApiClient(AppsV1Api);
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

  // only need one per realm (not per client)
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

  async patchNamespaceForIstio(namespace: string) {
    const patch = [
      {
        op: "add",
        path: "/metadata/labels/istio-injection",
        value: "enabled",
      },
    ];
    await this.k8sApi.patchNamespace(
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

  async restartDeployment(namespace: string, deployment: string) {
    const res = await this.k8sAppsV1Api.readNamespacedDeployment(
      deployment,
      namespace
    );
    if (!res.body.metadata.annotations) {
      res.body.metadata.annotations = {};
    }
    res.body.spec.template.metadata.annotations[
      "kubectl.kubernetes.io/restartedAt"
    ] = new Date().toISOString();
    await this.k8sAppsV1Api.replaceNamespacedDeployment(
      deployment,
      namespace,
      res.body
    );
  }

  async patchDeploymentForKeycloak(namespace: string, deployment: string) {
    const patch = [
      {
        op: "add",
        path: "/spec/template/metadata/labels/protect",
        value: "keycloak",
      },
    ];
    await this.k8sAppsV1Api.patchNamespacedDeployment(
      deployment,
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

  // only need one per realm (not per client)
  async CreateOrUpdateVirtualService(
    namespace: string,
    name: string,
    gateway: string,
    domain: string,
    serviceHost: string,
    servicePort: number
  ) {
    const api = "networking.istio.io";
    const version = "v1beta1";

    try {
      await this.customObjectsApi.getNamespacedCustomObject(
        api,
        version,
        namespace,
        "virtualservices",
        name
      );
      return;
    } catch (err) {
      if (err.statusCode !== 404) {
        throw err;
      }
    }

    // Define the RequestAuthentication resource
    const object = {
      apiVersion: `${api}/${version}`,
      kind: "VirtualService",
      metadata: {
        name: name,
        namespace: namespace,
      },
      spec: {
        gateways: [gateway],
        hosts: [`${namespace}.${domain}`],
        http: [
          {
            match: [
              {
                uri: {
                  prefix: "/",
                },
              },
            ],
            route: [
              {
                destination: {
                  host: serviceHost,
                  port: {
                    number: servicePort,
                  },
                },
              },
            ],
          },
        ],
      },
    };

    await this.customObjectsApi.createNamespacedCustomObject(
      api,
      version,
      namespace,
      object.kind.toLowerCase() + "s",
      object
    );
  }

  // XXX: BDW: not actually using this one yet, requirements around authz likely will change.
  async createAuthorizationPolicy(namespace: string, name: string) {
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
