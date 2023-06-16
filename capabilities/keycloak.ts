import { Capability, Log, a } from "pepr";

import { KcAPI } from "./lib/kc-api";

export const Keycloak = new Capability({
  name: "keycloak-authsvc",
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
  .WithName("configrealm")
  .WithLabel("todo", "createrealm")
  .Then(async request => {
    const realm = request.Raw.data.realm;
    const domain = request.Raw.data.domain;

    const keycloakBaseUrl = `https://keycloak.${domain}/auth`;
    const kcAPI = new KcAPI(keycloakBaseUrl);
    await kcAPI.GetOrCreateRealm(realm);
    request.RemoveLabel("todo");
    request.SetLabel("done", "created");
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
  .WithName("configrealm")
  .WithLabel("todo", "createrealm")
  .Then(async request => {
    try {
      const domain = request.Raw.data.domain;
      const keycloakBaseUrl = `https://keycloak.${domain}/auth`;

      const kcAPI = new KcAPI(keycloakBaseUrl);
      await kcAPI.ImportRealm(request.Raw.data.realmJson);
      request.RemoveLabel("todo");
      request.SetLabel("done", "created");
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
  .WithName("configclient")
  .WithLabel("todo", "createclient")
  .Then(async request => {
    try {
      const realm = request.Raw.data.realm;
      const id = request.Raw.data.id;
      const name = request.Raw.data.name;
      const domain = request.Raw.data.domain;

      const keycloakBaseUrl = `https://keycloak.${domain}/auth`;

      // have keycloak generate the new client and return the secret
      const kcAPI = new KcAPI(keycloakBaseUrl);
      const redirectUri = `https://${name}.${domain}/login`;
      const clientSecret = await kcAPI.GetOrCreateClient(
        realm,
        name,
        id,
        redirectUri
      );

      request.Raw.data.clientSecret = clientSecret
      request.Raw.data.redirectUri = redirectUri
      request.RemoveLabel("todo");
      request.SetLabel("done", "createclient");
    } catch (e) {
      Log.error(`error ${e.stack}`);
    }
  });
