import { Capability, Log, a } from "pepr";

import { KcAPI } from "./lib/kc-api";
import { K8sAPI } from "./lib/kubernetes-api";
import { OidcClientK8sSecretData } from "./lib/types";

export const Keycloak = new Capability({
  name: "Keycloak",
  description: "Simple example to configure keycloak realm and clientid",
  namespaces: [],
});

// TODO: add a workflow for deleting a client

const { When } = Keycloak;

// Create a realm from a generic secret:
/* 
Demo steps
    kubectl create secret generic configrealm -n keycloak --from-literal=realm=demo --from-literal=domain=bigbang.dev
    kubectl label secret configrealm -n keycloak  todo=createrealm
*/
When(a.Secret)
  .IsCreatedOrUpdated()
  .InNamespace("keycloak")
  .WithLabel("pepr.dev/keycloak", "createrealm")
  .Then(async request => {
    const realm = request.Raw.data.realm;
    const domain = request.Raw.data.domain;

    const keycloakBaseUrl = `https://keycloak.${domain}/auth`;
    const kcAPI = new KcAPI(keycloakBaseUrl);
    await kcAPI.GetOrCreateRealm(realm);
    request.SetLabel("pepr.dev/keycloak", "done");
  });

// Import a realm from a configmap
/* 
Example steps:
    kubectl create cm configrealm -n podinfo --from-file=realmJson --from-literal=domain=bigbang.dev
    kubectl label cm configrealm -n podinfo  todo=createrealm
*/
When(a.ConfigMap)
  .IsCreatedOrUpdated()
  .InNamespace("keycloak")
  .WithLabel("pepr.dev/keycloak", "createrealm")
  .Then(async request => {
    try {
      const domain = request.Raw.data.domain;
      const keycloakBaseUrl = `https://keycloak.${domain}/auth`;

      const kcAPI = new KcAPI(keycloakBaseUrl);
      await kcAPI.ImportRealm(request.Raw.data.realmJson);
      request.SetLabel("pepr.dev/keycloak", "done");
    } catch (e) {
      Log.error(`error ${e}`);
      request.SetLabel("error", e.message);
    }
  });

// Create a client secret
/* 
Example steps:
    kubectl create secret generic configclient -n podinfo --from-literal=realm=cocowow --from-literal=id=podinfo --from-literal=name=podinfo --from-literal=domain=bigbang.dev
    kubectl label secret configclient -n podinfo  todo=createclient
*/
When(a.Secret)
  .IsCreatedOrUpdated()
  .WithLabel("pepr.dev/keycloak", "createclient")
  .Then(async request => {
    try {
      const realm = request.Raw.data.realm;
      const id = request.Raw.data.id;
      const name = request.Raw.data.name;
      const domain = request.Raw.data.domain;
      const redirectUri =
        request.Raw.data.redirectUri || `https://${name}.${domain}`;

      const keycloakBaseUrl = `https://keycloak.${domain}/auth`;

      // have keycloak generate the new client and return the secret
      const kcAPI = new KcAPI(keycloakBaseUrl);
      const clientSecret = await kcAPI.GetOrCreateClient(
        realm,
        name,
        id,
        redirectUri
      );

      request.SetLabel("pepr.dev/keycloak", "done");

      const newSecret: OidcClientK8sSecretData = {
        realm: request.Raw.data.realm,
        id: request.Raw.data.id,
        name: request.Raw.data.name,
        domain: request.Raw.data.domain,
        clientSecret: clientSecret,
        redirectUri: redirectUri,
      };

      const k8sApi = new K8sAPI();
      await k8sApi.createOrUpdateSecret(
        `${newSecret.name}-client`,
        request.Raw.metadata.namespace,
        newSecret as unknown as Record<string, string>,
        { "pepr.dev/keycloak": "oidcconfig" }
      );
    } catch (e) {
      Log.error(`error ${e.stack}`);
    }
  });
