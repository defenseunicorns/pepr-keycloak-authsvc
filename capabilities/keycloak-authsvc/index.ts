import { Capability, a } from "pepr";
import { Config, CreateChainInput } from "./lib/authservice/secretConfig";
import { KcAPI, OpenIdData } from "./lib/kc-api";
import { K8sAPI } from "./lib/kubernetes-api";

export const KeycloakAuthSvc = new Capability({
  name: "keycloak-authsvc",
  description: "Simple example to configure keycloak realm and clientid",
  namespaces: [],
});

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
  .WithName("configrealm")
  .WithLabel("todo", "createrealm")
  .Then(async request => {
    // only allow creating these objects in the keycloak namespace
    const namespaceName = request.Raw.metadata.namespace;
    if (namespaceName !== "keycloak") {
      return;
    }

    const realm = getVal(request.Raw.data, "realm");
    const kcAPI = new KcAPI(keycloakBaseUrl);
    await kcAPI.GetOrCreateRealm(realm);
    request.RemoveLabel("todo");
    request.SetLabel("done", "created");
  });

// import a realm from a configmap,
When(a.ConfigMap)
  .IsCreatedOrUpdated()
  .WithName("configrealm")
  .WithLabel("todo", "createrealm")
  .Then(async request => {
    // only allow creating these objects in the keycloak namespace
    const namespaceName = request.Raw.metadata.namespace;
    if (namespaceName !== "keycloak") {
      return;
    }

    try {
      const kcAPI = new KcAPI(keycloakBaseUrl);
      await kcAPI.ImportRealm(request.Raw.data.realmJson);
    } catch (e) {
      console.log(`error ${e}`);
    }

    request.RemoveLabel("todo");
    request.SetLabel("done", "created");
  });

/* demo to create the client secret
kubectl create secret generic configclient -n podinfo --from-literal=realm=cocowow --from-literal=clientId=podinfo --from-literal=clientName=podinfo --from-literal=domain=bigbang.dev
kubectl label secret configclient -n podinfo  todo=createclient
*/
// CreateClient
When(a.Secret)
  .IsCreatedOrUpdated()
  .WithName("configclient")
  .WithLabel("todo", "createclient")
  .Then(async request => {
    try {
      const realm = getVal(request.Raw.data, "realm");
      const clientId = getVal(request.Raw.data, "clientId");
      const clientName = getVal(request.Raw.data, "clientName");
      const domain = getVal(request.Raw.data, "domain");

      // have keycloak generate the new client and return the secret
      const kcAPI = new KcAPI(keycloakBaseUrl);
      const redirectUri = `https://${clientId}.${domain}/login`;
      const clientSecret = await kcAPI.GetOrCreateClient(
        realm,
        clientName,
        clientId,
        redirectUri
      );

      // get the openid data from keycloak
      const openIdData = await kcAPI.GetOpenIdData(realm);

      request.Raw.data["clientSecret"] =
        Buffer.from(clientSecret).toString("base64");
      request.Raw.data["authorization_uri"] = Buffer.from(
        openIdData.authorization_endpoint
      ).toString("base64");
      request.Raw.data["token_uri"] = Buffer.from(
        openIdData.token_endpoint
      ).toString("base64");
      request.Raw.data["jwks_uri"] = Buffer.from(openIdData.jwks_uri).toString(
        "base64"
      );
      request.Raw.data["redirect_uri"] =
        Buffer.from(redirectUri).toString("base64");
      request.Raw.data["logout_uri"] = Buffer.from(
        openIdData.end_session_endpoint
      ).toString("base64");

      // get the existing config.json secret
      await doAuthServiceSecretStuff(
        clientName,
        openIdData,
        redirectUri,
        clientSecret,
        request.Raw.metadata.namespace,
        domain
      );
    } catch (e) {
      console.log(`error ${e}`);
    }
    request.RemoveLabel("todo");
    request.SetLabel("done", "createclient");
  });

async function doAuthServiceSecretStuff(
  clientName: string,
  openIdData: OpenIdData,
  redirectUri: string,
  clientSecret: string,
  namespace: string,
  domain: string
) {
  const k8sApi = new K8sAPI();
  const configRaw = await k8sApi.getSecretValue(
    "authservice",
    "authservice",
    "config.json"
  );
  // this will parse what is in there and make sure it's valid
  const oldConfig = new Config(JSON.parse(configRaw));

  // create the new config.json secret
  const chainInput: CreateChainInput = {
    name: clientName,
    fqdn: `${clientName}.${domain}`,
    authorization_uri: openIdData.authorization_endpoint,
    token_uri: openIdData.token_endpoint,
    jwks_uri: openIdData.jwks_uri,
    redirect_uri: redirectUri,
    clientSecret: clientSecret,
    logout_uri: openIdData.end_session_endpoint,
  };

  // remove it if it exists, and replace it (also remove local)
  oldConfig.chains = oldConfig.chains.filter(
    obj => obj.name !== clientName && obj.name !== "local"
  );
  oldConfig.chains.push(Config.CreateSingleChain(chainInput));

  // XXX: make sure we're not just appending.
  // XXX: BDW add a second chain
  const newConfig = new Config({
    chains: oldConfig.chains,
    listen_address: oldConfig.listen_address,
    listen_port: oldConfig.listen_port,
    log_level: oldConfig.log_level,
    threads: oldConfig.threads,
  });

  // XXX: BDW: TODO: save the old secret data to either another place in the secret or a new secret
  await k8sApi.createOrUpdateSecret(
    "authservice",
    "authservice",
    "config.json",
    JSON.stringify(newConfig)
  );

  await k8sApi.restartDeployment("authservice", "authservice");
}

function getVal(data: { [key: string]: string }, p: string): string {
  if (data && data[p]) {
    return Buffer.from(data[p], "base64").toString("utf-8");
  }
  throw new Error(`${p} not in the secret`);
}
