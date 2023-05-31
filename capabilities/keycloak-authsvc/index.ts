import { Capability, Log, PeprRequest, a } from "pepr";

import { AuthServiceSecretBuilder } from "./lib/authservice/secretBuilder";
import { KcAPI } from "./lib/kc-api";
import { K8sAPI } from "./lib/kubernetes-api";

export const KeycloakAuthSvc = new Capability({
  name: "keycloak-authsvc",
  description: "Simple example to configure keycloak realm and clientid",
  namespaces: [],
});

// TODO: add a workflow for deleting a client

const { When } = KeycloakAuthSvc;

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
    const realm = getVal(request, "realm");
    const domain = getVal(request, "domain");

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
      const realm = getVal(request, "realm");
      const id = getVal(request, "id");
      const name = getVal(request, "name");
      const domain = getVal(request, "domain");

      const keycloakBaseUrl = `https://keycloak.${domain}/auth`;

      // have keycloak generate the new client and return the secret
      const kcAPI = new KcAPI(keycloakBaseUrl);
      const redirectUri = `https://${id}.${domain}/login`;
      const clientSecret = await kcAPI.GetOrCreateClient(
        realm,
        name,
        id,
        redirectUri
      );

      const newSecret = {
        realm: realm,
        id: id,
        name: name,
        domain: domain,
        secret: clientSecret,
        redirect_uri: redirectUri,
      };

      const k8sApi = new K8sAPI();
      await k8sApi.createOrUpdateSecret(
        `mission-${name}`,
        "authservice",
        newSecret
      );
      request.RemoveLabel("todo");
      request.SetLabel("done", "createclient");
    } catch (e) {
      Log.error(`error ${e.stack}`);
    }
  });

// temporary unitl we can have a post persisted builder
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
// Update the authservice secret (triggers from previous capability)
When(a.Secret)
  .IsCreatedOrUpdated()
  .InNamespace("authservice")
  .Then(async request => {
    if (request.Raw.metadata.name === "authservice") {
      return;
    }
    try {
      const k8sApi = new K8sAPI();
      const authserviceSecretBuilder = new AuthServiceSecretBuilder(k8sApi);
      // XXX: BDW: TODO: remove once we have a post persisted builder
      setImmediate(async () => {
        // waiting 5 seconds for the previous objects to be created.
        await delay(5000);
        await authserviceSecretBuilder.buildAuthserviceSecret();
        await k8sApi.restartDeployment("authservice", "authservice");
      });
    } catch (e) {
      Log.error(`error ${e}`);
    }
  });

// Obsolete soon
function getVal(request: PeprRequest<a.Secret>, p: string): string {
  if (request.Raw.data && request.Raw.data[p]) {
    return Buffer.from(request.Raw.data[p], "base64").toString("utf-8");
  }
  throw new Error(`${p} not in the secret`);
}
