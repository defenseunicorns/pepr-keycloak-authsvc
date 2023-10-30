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

const { When, Store } = Keycloak;

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

// Create a Keycloak Client with a CRD
/* 
Example steps:
    kubectl apply -f tests/e2e/local/debug-crd.yaml
    kubectl apply -f tests/e2e/local/debug-client-crd.yaml
    kubectl label unicorn client2 pepr.dev/keycloak=createclient

    Alternatively: running npm run debug-local && npx pepr dev --confirm
    and run label secret manually: kubectl label unicorn client2 pepr.dev/keycloak=createclient
*/
When(a.GenericKind, {
  group: "pepr.dev",
  version: "v1",
  kind: "Unicorn",
})
  .IsCreatedOrUpdated()
  .WithLabel("pepr.dev/keycloak", "createclient")
  .Validate(async request => {
    try {
      const crdClientData: OidcClientK8sSecretData = {
        attributes: request.Raw.spec?.attributes,
        alwaysDisplayInConsole: request.Raw.spec?.alwaysDisplayInConsole,
        clientId: request.Raw.spec?.clientId,
        defaultClientScopes: request.Raw.spec?.defaultClientScopes,
        description: request.Raw.spec?.description,
        directAccessGrantsEnabled: request.Raw.spec?.directAccessGrantsEnabled,
        name: request.Raw.spec?.name,
        optionalClientScopes: request.Raw.spec?.optionalClientScopes,
        redirectUris: request.Raw.spec?.redirectUris,
        webOrigins: request.Raw.spec?.webOrigins,
        access: request.Raw.spec?.access,
        adminUrl: request.Raw.spec?.adminUrl,
        authenticationFlowBindingOverrides:
          request.Raw.spec?.authenticationFlowBindingOverrides,
        authorizationServicesEnabled:
          request.Raw.spec?.authorizationServicesEnabled,
        baseUrl: request.Raw.spec?.baseUrl,
        bearerOnly: request.Raw.spec?.bearerOnly,
        clientAuthenticatorType: request.Raw.spec?.clientAuthenticatorType,
        consentRequired: request.Raw.spec?.consentRequired,
        enabled: request.Raw.spec?.enabled,
        frontchannelLogout: request.Raw.spec?.frontchannelLogout,
        fullScopeAllowed: request.Raw.spec?.fullScopeAllowed,
        id: request.Raw.spec?.id,
        implicitFlowEnabled: request.Raw.spec?.implicitFlowEnabled,
        nodeReRegistrationTimeout: request.Raw.spec?.nodeReRegistrationTimeout,
        notBefore: request.Raw.spec?.notBefore,
        oauth2DeviceAuthorizationGrantEnabled:
          request.Raw.spec?.oauth2DeviceAuthorizationGrantEnabled,
        origin: request.Raw.spec?.origin,
        protocol: request.Raw.spec?.protocol,
        publicClient: request.Raw.spec?.publicClient,
        registeredNodes: request.Raw.spec?.registeredNodes,
        registrationAccessToken: request.Raw.spec?.registrationAccessToken,
        rootUrl: request.Raw.spec?.rootUrl,
        secret: request.Raw.spec?.secret,
        serviceAccountsEnabled: request.Raw.spec?.serviceAccountsEnabled,
        standardFlowEnabled: request.Raw.spec?.standardFlowEnabled,
        surrogateAuthRequired: request.Raw.spec?.surrogateAuthRequired,
      };

      const kcAPI = new KcAPI(
        request.Raw.spec?.keycloakBaseUrl ||
          getKeyclockBaseURL(request.Raw.spec.domain),
      );

      crdClientData.clientSecret = await kcAPI.GetOrCreateClient(
        request.Raw.spec.realm,
        crdClientData,
      );

      // Manage undefined fields and convert to JSON string for K8's secret
      const secretData = Object.keys(crdClientData).reduce((acc, key) => {
        if (crdClientData[key] !== undefined) {
          acc[key] = JSON.stringify(crdClientData[key]);
        }
        return acc;
      }, {});

      await K8sAPI.applySecret(
        new CustomSecret({
          metadata: {
            name: `${crdClientData.name}-client`,
            namespace: request.Raw.metadata.namespace,
            labels: { "pepr.dev/keycloak": "oidcconfig" },
          },
          stringData: secretData,
        }),
      );
    } catch (e) {
      Log.error(`error ${e}`, "Keycloak.Client.Secret.IsCreatedOrUpdated()");
      return request.Deny(`error ${e}`);
    }
    return request.Approve();
  });

// Delete the CRD and the client from keycloak
When(a.GenericKind, {
  group: "pepr.dev",
  version: "v1",
  kind: "Unicorn",
})
  .IsDeleted()
  .WithLabel("pepr.dev/keycloak", "createclient")
  .Mutate(async request => {
    try {
      const kcAPI = new KcAPI(
        request.Raw.spec?.keycloakBaseUrl ||
          getKeyclockBaseURL(request.Raw.spec.domain),
      );
      kcAPI.DeleteClient(request.Raw.spec.clientId, request.Raw.spec.realm);

      await K8sAPI.deleteSecret(
        `${request.Raw.spec.name}-client`,
        request.Raw.metadata.namespace,
      );
    } catch (e) {
      Log.error(`error ${e}`, "Keycloak.Client.Secret.IsDeleted()");
    }
  });

/**
 * A callback function that is called once the Pepr Store is fully loaded.
 */
Store.onReady(data => {
  Log.info(data, "Pepr Store Ready");
});
