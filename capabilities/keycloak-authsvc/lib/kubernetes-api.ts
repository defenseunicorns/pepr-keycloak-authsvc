import {
  AppsV1Api,
  CoreV1Api,
  CustomObjectsApi,
  KubeConfig,
  V1HostAlias,
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

    try {
      // Try to get the existing RequestAuthentication resource
      await this.customObjectsApi.getNamespacedCustomObject(
        "security.istio.io",
        "v1",
        namespace,
        requestAuthentication.kind.toLowerCase() + "s",
        name
      );
      return
    } catch (error) {
      if (error.response && error.response.statusCode === 404) {
        // object doesn't exist, go ahead and create it
      } else {
        throw error;
      }
    }

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

  // XXX: BDW: test me
  async restartDeployment(namespace: string, deployment: string) {
    const patch = [
      {
        op: 'add',
        path: '/spec/template/metadata/annotations/kubectl.kubernetes.io~1restartedAt',
        value: new Date().toISOString(),
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

    // XXX: BDW: test me
    async restartStatefulset(namespace: string, statefulSet: string) {
      const patch = [
        {
          op: 'add',
          path: '/spec/template/metadata/annotations/kubectl.kubernetes.io~1restartedAt',
          value: new Date().toISOString(),
        },
      ];
    
      await this.k8sAppsV1Api.patchNamespacedStatefulSet(
        statefulSet,
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

  /*
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
  */

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


  async createIstioGateway(name: string, namespace: string, domain: string) {
    // Define the Gateway resource
    const istioGateway = {
        apiVersion: "networking.istio.io/v1alpha3",
        kind: "Gateway",
        metadata: {
            name: name,
            namespace: namespace,
        },
        spec: {
            selector: {
                app: "istio-gateway",
            },
            servers: [
                {
                    port: {
                        number: 80,
                        name: "http",
                        protocol: "HTTP",
                    },
                    hosts: [
                        `*.${domain}`,
                    ],
                },
                {
                    port: {
                        number: 443,
                        name: "https",
                        protocol: "HTTPS",
                    },
                    tls: {
                        mode: "SIMPLE",
                        credentialName: "creds",
                    },
                    hosts: [
                        `*.${domain}`,
                    ],
                },
            ],
        },
    };

    try {
        // Try to create the Gateway resource
        const result = await this.customObjectsApi.createNamespacedCustomObject(
            "networking.istio.io",
            "v1alpha3",
            namespace,
            "gateways",
            istioGateway
        );
        console.log(`Gateway ${name} created in namespace ${namespace}`);
        return result;
    } catch (error) {
        console.error(`Failed to create Gateway ${name} in namespace ${namespace}: ${error}`);
        throw error;
    }
}



async createOrUpdateAuthorizationPolicy(namespace: string, name: string, requestPrincipals: string[]) {
  // Define the AuthorizationPolicy resource
  const authorizationPolicy = {
      apiVersion: "security.istio.io/v1beta1",
      kind: "AuthorizationPolicy",
      metadata: {
          name: name,
          namespace: namespace,
      },
      spec: {
          selector: {
              matchLabels: {
                  protect: "keycloak",
              },
          },
          rules: [
              {
                  from: [
                      {
                          source: {
                              requestPrincipals: requestPrincipals,
                          },
                      },
                  ],
              },
          ],
      },
  };

  try {
      // Attempt to replace the AuthorizationPolicy resource
      await this.customObjectsApi.replaceNamespacedCustomObject(
          "security.istio.io",
          "v1beta1",
          namespace,
          "authorizationpolicies",
          name,
          authorizationPolicy
      );
      console.log(`AuthorizationPolicy ${name} replaced in namespace ${namespace}`);
  } catch (error) {
      if (error.statusCode === 404) {
          // If it does not exist, create it
          await this.customObjectsApi.createNamespacedCustomObject(
              "security.istio.io",
              "v1beta1",
              namespace,
              "authorizationpolicies",
              authorizationPolicy
          );
          console.log(`AuthorizationPolicy ${name} created in namespace ${namespace}`);
      } else {
          // If any other error, throw it
          console.error(`Failed to create or replace AuthorizationPolicy ${name} in namespace ${namespace}: ${error}`);
          throw error;
      }
  }
}



  async createOrUpdateIstioGateway(name: string, namespace: string, domain: string) {
    // Define the Gateway resource
    const istioGateway = {
        apiVersion: "networking.istio.io/v1alpha3",
        kind: "Gateway",
        metadata: {
            name: name,
            namespace: namespace,
        },
        spec: {
            selector: {
                app: "istio-gateway",
            },
            servers: [
                {
                    port: {
                        number: 80,
                        name: "http",
                        protocol: "HTTP",
                    },
                    hosts: [
                        `*.${domain}`,
                    ],
                },
                {
                    port: {
                        number: 443,
                        name: "https",
                        protocol: "HTTPS",
                    },
                    tls: {
                        mode: "SIMPLE",
                        credentialName: "creds",
                    },
                    hosts: [
                        `*.${domain}`,
                    ],
                },
            ],
        },
    };

    try {
        // Check if the Gateway exists
        await this.customObjectsApi.getNamespacedCustomObject(
            "networking.istio.io",
            "v1alpha3",
            namespace,
            "gateways",
            name
        );

        // If it exists, replace it
        // XXX: BDW: todo: this doesn't work.
        /*
        const result = await this.customObjectsApi.replaceNamespacedCustomObject(
            "networking.istio.io",
            "v1alpha3",
            namespace,
            "gateways",
            name,
            istioGateway
        );
        */

        console.log(`Gateway ${name} replaced in namespace ${namespace}`);
        return

    } catch (error) {
        if (error.statusCode === 404) {
            // If it does not exist, create it
            const result = await this.customObjectsApi.createNamespacedCustomObject(
                "networking.istio.io",
                "v1alpha3",
                namespace,
                "gateways",
                istioGateway
            );

            console.log(`Gateway ${name} created in namespace ${namespace}`);
            return
        }

        // If any other error, log and throw it
        console.error(`Failed to create or replace Gateway ${name} in namespace ${namespace}: ${error}`);
        throw error;
    }
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

  async  getExternalIp(namespace: string, serviceName: string): Promise<string | null> {
      const res = await this.k8sApi.readNamespacedService(serviceName, namespace);
      const service = res.body;
    
      if (service.status && service.status.loadBalancer && service.status.loadBalancer.ingress) {
          const ingress = service.status.loadBalancer.ingress[0];
          if (ingress.ip) {
              return ingress.ip;
          } else if (ingress.hostname) {
              // If there's no IP, the load balancer may be using a hostname
              return ingress.hostname;
          }
      }
      return null;
  }
  


}
