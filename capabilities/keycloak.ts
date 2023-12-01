import { Capability, Log, a } from "pepr";
import { KcAPI } from "./lib/kc-api";
import { K8sAPI } from "./lib/kubernetes-api";
import { CustomSecret } from "./lib/authservice/customSecret";
import { KeycloakClient } from "./crds/keycloakclient-v1";
import { KeycloakUser } from "./crds/keycloakuser-v1";

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

// Create a client from CRD
/* 
  Example steps:
    Debug steps:
      npm run debug
      kubectl apply -f tests/e2e/debug/keycloak-client-cr.yaml

    E2E Test:
      npm run test:e2e
*/
When(KeycloakClient)
  .IsCreatedOrUpdated()
  .Validate(async request => {
    try {
      const keycloakBaseUrl =
        request.Raw.spec?.keycloakBaseUrl ||
        getKeyclockBaseURL(request.Raw.spec.domain);

      // have keycloak generate the new client and return the secret
      Log.info(
        `Keycloak - Attempting to connect to keycloak at ${keycloakBaseUrl}`,
      );

      const kcAPI = new KcAPI(keycloakBaseUrl);
      const clientSecret = await kcAPI.UpdateOrCreateClient(
        request.Raw.spec.realm,
        request.Raw.spec.client,
      );

      // Create secret data
      const newSecret = {
        realm: request.Raw.spec.realm,
        name: request.Raw.spec.client.name,
        clientSecret: clientSecret,
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

// Delete the Client CRD from keycloak
/*
Example steps:
  Debug steps:
    npm run debug
    kubectl apply -f tests/e2e/debug/keycloak-client-cr.yaml
    kubectl delete keycloakclient client2

  E2E Test:
    npm run test:e2e
*/
When(KeycloakClient)
  .IsDeleted()
  .Mutate(async request => {
    try {
      const kcAPI = new KcAPI(
        request.Raw.spec?.keycloakBaseUrl ||
          getKeyclockBaseURL(request.Raw.spec.domain),
      );
      kcAPI.DeleteClient(
        request.Raw.spec.client.clientId,
        request.Raw.spec.realm,
      );

      await K8sAPI.deleteSecret(
        `${request.Raw.spec.client.name}-client`,
        request.Raw.metadata.namespace,
      );
    } catch (e) {
      Log.error(`error ${e}`, "Keycloak.Client.Secret.IsDeleted()");
    }
  });

// Create Keycloak Users from CRD
/*
  Example steps:
    Debug steps:
      npm run debug
      kubectl apply -f tests/e2e/debug/keycloak-user-cr.yaml

    E2E Test:
      npm run test:e2e
*/
When(KeycloakUser)
  .IsCreatedOrUpdated()
  .Mutate(async request => {
    try {
      const kcAPI = new KcAPI(
        request.Raw.spec?.keycloakBaseUrl ||
          getKeyclockBaseURL(request.Raw.spec.domain),
      );

      kcAPI.UpdateOrCreateUser(request.Raw.spec.realm, request.Raw.spec.user);
    } catch (e) {
      Log.error(`error ${e}`, "Keycloak Create Users");
    }
  });

// Delete Keycloak Users from CRD
/*
  Example steps:
    Debug steps:
      npm run debug
      kubectl apply -f tests/e2e/debug/keycloak-user-cr.yaml
      kubectl delete keycloakuser user1

    E2E Test:
      npm run test:e2e
*/
When(KeycloakUser)
  .IsDeleted()
  .Mutate(async request => {
    try {
      const kcAPI = new KcAPI(
        request.Raw.spec?.keycloakBaseUrl ||
          getKeyclockBaseURL(request.Raw.spec.domain),
      );

      kcAPI.DeleteUser(request.Raw.spec.realm, request.Raw.spec.user);
    } catch (e) {
      Log.error(`error ${e}`, "Keycloak Create Users");
    }
  });
