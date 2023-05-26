import { Capability, Log, PeprRequest, a } from "pepr";
import { KcAPI } from "./lib/kc-api";
import { AuthServiceSecretBuilder } from "./lib/authservice/secretBuilder";
import { K8sAPI } from "./lib/kubernetes-api";

export const KeycloakAuthSvc = new Capability({
  name: "keycloak-authsvc",
  description: "Simple example to configure keycloak realm and clientid",
  namespaces: [],
});

// TODO:
// 1. find a better way to dervive the keycloak base url
// 2. add a workflow for deleting a client

const keycloakBaseUrl = "https://keycloak.bigbang.dev/auth";

const { When } = KeycloakAuthSvc;

//
/* Demo steps
kubectl create secret generic configrealm -n keycloak --from-literal=realm=demo --from-literal=domain=bigbang.dev
kubectl label secret configrealm -n keycloak  todo=createrealm
*/
// CreateRealm from a secret,
When(a.Secret)
  .IsCreatedOrUpdated()
  .InNamespace("keycloak")
  .WithName("configrealm")
  .WithLabel("todo", "createrealm")
  .Then(async request => {
    const realm = getVal(request, "realm");
    const kcAPI = new KcAPI(keycloakBaseUrl);
    await kcAPI.GetOrCreateRealm(realm);
    request.RemoveLabel("todo");
    request.SetLabel("done", "created");
  });

// import a realm from a configmap,
/* Demo steps
kubectl create cm configrealm -n podinfo --from-file=realmJson
kubectl label cm configrealm -n podinfo  todo=createrealm
*/
When(a.ConfigMap)
  .IsCreatedOrUpdated()
  .InNamespace("keycloak")
  .WithName("configrealm")
  .WithLabel("todo", "createrealm")
  .Then(async request => {
    try {
      const kcAPI = new KcAPI(keycloakBaseUrl);
      await kcAPI.ImportRealm(request.Raw.data.realmJson);
      request.RemoveLabel("todo");
      request.SetLabel("done", "created");
    } catch (e) {
      Log.error(`error ${e}`);
      request.SetLabel("error", e.message);
    }
  });

/* demo to create the client secret
kubectl create secret generic configclient -n podinfo --from-literal=realm=cocowow --from-literal=id=podinfo --from-literal=name=podinfo --from-literal=domain=bigbang.dev
kubectl label secret configclient -n podinfo  todo=createclient

*/
// CreateClient
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
      await authserviceSecretBuilder.buildAuthserviceSecret();
      await k8sApi.restartDeployment("authservice", "authservice");
    } catch (e) {
      Log.error(`error ${e}`);
    }
  });

function getVal(request: PeprRequest<a.Secret>, p: string): string {
  if (request.Raw.data && request.Raw.data[p]) {
    return Buffer.from(request.Raw.data[p], "base64").toString("utf-8");
  }
  throw new Error(`${p} not in the secret`);
}
