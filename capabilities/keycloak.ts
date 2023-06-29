import { Capability, Log, a } from "pepr";
import { KcAPI } from "./lib/kc-api";
import { K8sAPI } from "./lib/kubernetes-api";
import { OidcClientK8sSecretData } from "./lib/types";

export const Keycloak = new Capability({
  name: "Keycloak",
  description: "Simple example to configure keycloak realm and clientid",
  namespaces: [],
});

const { When } = Keycloak;

function getKeyclockBaseURL(domain: string) {
  return `https://keycloak.${domain}/auth`;
}

// Create a realm from a generic secret:
/* 
Demo steps
    kubectl create secret generic configrealm -n keycloak --from-literal=realm=demo --from-literal=domain=bigbang.dev
    kubectl label secret configrealm -n keycloak  pepr.dev/keycloak=createrealm
*/
When(a.Secret)
  .IsCreatedOrUpdated()
  .InNamespace("keycloak")
  .WithLabel("pepr.dev/keycloak", "createrealm")
  .Then(async request => {
    try {
      const kcAPI = new KcAPI(getKeyclockBaseURL(request.Raw.data.domain));
      await kcAPI.GetOrCreateRealm(request.Raw.data.realm);
      request.SetLabel("pepr.dev/keycloak", "done");
    } catch (e) {
      Log.error(`error ${e}`);
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
  .Then(async request => {
    try {
      const kcAPI = new KcAPI(getKeyclockBaseURL(request.Raw.data.domain));
      await kcAPI.ImportRealm(request.Raw.data.realmJson);
      request.SetLabel("pepr.dev/keycloak", "done");
    } catch (e) {
      Log.error(`error ${e}`);
    }
  });

// Create a client secret
/* 
Example steps:
    kubectl create secret generic configclient -n podinfo --from-literal=realm=cocowow --from-literal=id=podinfo --from-literal=name=podinfo --from-literal=domain=bigbang.dev
    kubectl label secret configclient -n podinfo  pepr.dev/keycloak=createclient
*/
When(a.Secret)
  .IsCreatedOrUpdated()
  .WithLabel("pepr.dev/keycloak", "createclient")
  .Then(async request => {
    try {
      const redirectUri =
        request.Raw.data.redirectUri ||
        `https://${request.Raw.data.name}.${request.Raw.data.domain}/login`;

      // have keycloak generate the new client and return the secret
      const kcAPI = new KcAPI(getKeyclockBaseURL(request.Raw.data.domain));
      const clientSecret = await kcAPI.GetOrCreateClient(
        request.Raw.data.realm,
        request.Raw.data.name,
        request.Raw.data.id,
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

      // TODO: add ownerReferences into this secret
      const k8sApi = new K8sAPI();
      await k8sApi.upsertSecret(
        `${newSecret.name}-client`,
        request.Raw.metadata.namespace,
        newSecret as unknown as Record<string, string>,
        { "pepr.dev/keycloak": "oidcconfig" }
      );
    } catch (e) {
      Log.error(`error ${e.stack}`);
    }
  });

// TODO: this does not work yet due to functionality in pepr, will be added back in later
/*
When(a.Secret)
  .IsDeleted()
  .WithLabel("pepr.dev/keycloak", "createclient")
  .Then(async request => {
    try {
      const kcAPI = new KcAPI(
        getKeyclockBaseURL(request.OldResource.data.domain)
      );
      kcAPI.DeleteClient(
        request.OldResource.data.id,
        request.OldResource.data.realm
      );
    } catch (e) {
      Log.error(`error ${e.stack}`);
    }
  });
*/
