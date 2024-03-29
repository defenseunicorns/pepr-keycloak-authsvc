import { Capability, Log, a } from "pepr";
import { KcAPI } from "./lib/kc-api";
import { K8sAPI } from "./lib/kubernetes-api";
import { OidcClientK8sSecretData } from "./lib/types";
import { CustomSecret } from "./lib/authservice/customSecret";

export const Keycloak = new Capability({
  name: "Keycloak",
  description: "Configures keycloak realm (two ways) and clientids",
  namespaces: [],
});

const { When } = Keycloak;

function getKeyclockBaseURL(domain: string) {
  return `https://keycloak.${domain}/auth`;
}

// Create a realm from a generic secret:
/* 
Demo steps
    kubectl create secret generic configrealm -n keycloak --from-literal=realm=baby-yoda --from-literal=domain=bigbang.dev
    kubectl label secret configrealm -n keycloak  pepr.dev/keycloak=createrealm
*/
When(a.Secret)
  .IsCreatedOrUpdated()
  .InNamespace("keycloak")
  .WithLabel("pepr.dev/keycloak", "createrealm")
  .Mutate(async request => {
    try {
      const kcAPI = new KcAPI(
        request.Raw.data?.keycloakBaseUrl ||
          getKeyclockBaseURL(request.Raw.data.domain),
      );
      await kcAPI.GetOrCreateRealm(request.Raw.data.realm);
    } catch (e) {
      Log.error(`error ${e}`, "Keycloak.Secret.Realm.IsCreatedOrUpdated()");
    }
  });

// Import a realm from a configmap
/* 
Example steps:
    kubectl create cm configrealm -n keycloak --from-file=realmJson --from-literal=domain=bigbang.dev
    kubectl label cm configrealm -n keycloak  pepr.dev/keycloak=createrealm
*/
When(a.ConfigMap)
  .IsCreatedOrUpdated()
  .InNamespace("keycloak")
  .WithLabel("pepr.dev/keycloak", "createrealm")
  .Mutate(async request => {
    try {
      const kcAPI = new KcAPI(
        request.Raw.data?.keycloakBaseUrl ||
          getKeyclockBaseURL(request.Raw.data.domain),
      );
      await kcAPI.ImportRealm(request.Raw.data.realmJson);
    } catch (e) {
      Log.error(`error ${e}`, "Keycloak.ConfigMap.Realm.IsCreatedOrUpdated()");
    }
  });

// Create a client secret
/* 
Example steps:
    kubectl create secret generic client1 --from-literal=realm=baby-yoda --from-literal=id=podinfo --from-literal=name=podinfo --from-literal=domain=bigbang.dev
    kubectl label secret client1 pepr.dev/keycloak=createclient
*/
When(a.Secret)
  .IsCreatedOrUpdated()
  .WithLabel("pepr.dev/keycloak", "createclient")
  .Validate(async request => {
    try {
      const redirectUri =
        request.Raw.data?.redirectUri ||
        `https://${request.Raw.data.name}.${request.Raw.data.domain}/login`;

      const keycloakBaseUrl =
        request.Raw.data?.keycloakBaseUrl ||
        getKeyclockBaseURL(request.Raw.data.domain);

      // have keycloak generate the new client and return the secret
      Log.info(
        `Keycloak - Attempting to connect to keycloak at ${keycloakBaseUrl}`,
      );

      const kcAPI = new KcAPI(keycloakBaseUrl);
      const clientSecret = await kcAPI.GetOrCreateClient(
        request.Raw.data.realm,
        request.Raw.data.name,
        request.Raw.data.id,
        redirectUri,
      );

      const newSecret: OidcClientK8sSecretData = {
        realm: request.Raw.data.realm,
        id: request.Raw.data.id,
        name: request.Raw.data.name,
        domain: request.Raw.data.domain,
        clientSecret: clientSecret,
        redirectUri: redirectUri,
      };

      await K8sAPI.applySecret(
        new CustomSecret({
          metadata: {
            name: `${newSecret.name}-client`,
            namespace: request.Raw.metadata.namespace,
            labels: { "pepr.dev/keycloak": "oidcconfig" },
          },
          data: newSecret as unknown as Record<string, string>,
        }),
      );
    } catch (e) {
      Log.error(`error ${e}`, "Keycloak.Client.Secret.IsCreatedOrUpdated()");
      return request.Deny(`error ${e}`);
    }
    return request.Approve();
  });

// Delete the secret from keycloak
When(a.Secret)
  .IsDeleted()
  .WithLabel("pepr.dev/keycloak", "createclient")
  .Mutate(async request => {
    try {
      const kcAPI = new KcAPI(
        request.Raw.data?.keycloakBaseUrl ||
          getKeyclockBaseURL(request.Raw.data.domain),
      );
      kcAPI.DeleteClient(request.Raw.data.id, request.Raw.data.realm);

      await K8sAPI.deleteSecret(
        `${request.Raw.data.name}-client`,
        request.Raw.metadata.namespace,
      );
    } catch (e) {
      Log.error(`error ${e}`, "Keycloak.Client.Secret.IsDeleted()");
    }
  });
