import { Capability, Log, a } from "pepr";
import { KcAPI } from "./lib/kc-api";
import { K8sAPI } from "./lib/kubernetes-api";
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

// Create a client from CRD
/* 
Example steps:
    Start the pepr dev cluster with:
      npm run test:e2e:deps

    Running pepr debugger:
      npm run debug
      kubectl apply -f tests/e2e/debug/keycloak-client-cr.yaml
*/
When(a.GenericKind, {
  group: "pepr.dev",
  version: "v1",
  kind: "KeycloakClient",
})
  // todo: if not supporting updates, this should only be IsCreated()
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
      const clientSecret = await kcAPI.GetOrCreateClient(
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
  Remove Client CRD:
    kubectl delete keycloakclient client2 -n default
*/
When(a.GenericKind, {
  group: "pepr.dev",
  version: "v1",
  kind: "KeycloakClient",
})
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
When(a.GenericKind, {
  group: "pepr.dev",
  version: "v1",
  kind: "KeycloakUser",
})
  .IsCreatedOrUpdated()
  .Mutate(async request => {
    try {
      const kcAPI = new KcAPI(
        request.Raw.spec?.keycloakBaseUrl ||
          getKeyclockBaseURL(request.Raw.spec.domain),
      );

      // create basic user
      kcAPI.CreateUser(request.Raw.spec.realm, request.Raw.spec.user);

      // todo: need to add additional logic for creating a users roles,
      // todo: probably need to call the update user endpoint or fetch
      // todo: the roles to get the role id and then update the user roles endpoint
    } catch (e) {
      Log.error(`error ${e}`, "Keycloak Create Users");
    }
  });
