import { Capability, PeprRequest, a } from "pepr";
import { Config, CreateChainInput } from "./lib/authservice/secretConfig";
import { KcAPI } from "./lib/kc-api";
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

    const realm = getVal(request, "realm");
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
      const realm = getVal(request, "realm");
      const clientId = getVal(request, "clientId");
      const clientName = getVal(request, "clientName");
      const domain = getVal(request, "domain");

      // have keycloak generate the new client and return the secret
      const kcAPI = new KcAPI(keycloakBaseUrl);
      const redirectUri = `https://${clientId}.${domain}/login`;
      const clientSecret = await kcAPI.GetOrCreateClient(
        realm,
        clientName,
        clientId,
        redirectUri
      );

      // update the the client secret
      request.Raw.data["clientSecret"] =
        Buffer.from(clientSecret).toString("base64");
      request.Raw.data["redirect_uri"] =
        Buffer.from(redirectUri).toString("base64");

      // get the existing config.json secret
      await doAuthServiceSecretStuff(
        clientName,
        redirectUri,
        clientSecret,
        request.Raw.metadata.namespace,
        domain
      );
    } catch (e) {
      console.log(`error ${e.stack}`);
    }
    request.RemoveLabel("todo");
    request.SetLabel("done", "createclient");
  });

async function doAuthServiceSecretStuff(
  clientName: string,
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
  const oldConfig = new Config(JSON.parse(configRaw));

  // create the new config.json secret
  const chainInput: CreateChainInput = {
    name: clientName,
    fqdn: `${clientName}.${domain}`,
    redirect_uri: redirectUri,
    clientSecret: clientSecret,
  };

  // TODO: backup the original secret, we will know if the filter reduces the size of the chain.
  // TODO: could also populate the CHANGE_ME in the authservice config.json with keycloak right here.

  // remove the default chain necessary to keep authservice running
  oldConfig.chains = oldConfig.chains.filter(
    obj => obj.name !== clientName && obj.name !== "local"
  );
  //const chains = oldConfig.chains.push(Config.CreateSingleChain(chainInput));

  // XXX: BDW: TODO: build all the chains from these secret files.
  const chains = [Config.CreateSingleChain(chainInput)];

  const newConfig = new Config({
    chains: [chains],
    listen_address: oldConfig.listen_address,
    listen_port: oldConfig.listen_port,
    log_level: oldConfig.log_level,
    threads: oldConfig.threads,
    default_oidc_config: oldConfig.default_oidc_config,
  });

  // TODO: backup the old secret
  await k8sApi.createOrUpdateSecret(
    "authservice",
    "authservice",
    "config.json",
    JSON.stringify(newConfig)
  );

  await k8sApi.restartDeployment("authservice", "authservice");
}

function getVal(request: PeprRequest<a.Secret>, p: string): string {
  if (request.Raw.data && request.Raw.data[p]) {
    return Buffer.from(request.Raw.data[p], "base64").toString("utf-8");
  }
  throw new Error(`${p} not in the secret`);
}
