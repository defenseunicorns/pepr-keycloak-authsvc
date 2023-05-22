import { Capability, PeprRequest, a } from "pepr";

import { Config, CreateChainInput } from "./lib/authservice/secretConfig";
import { KcAPI, OpenIdData } from "./lib/kc-api";
import { K8sAPI } from "./lib/kubernetes-api";

export const KeycloakAuthSvc = new Capability({
  name: "keycloak-authsvc",
  description: "Simple example to configure keycloak realm and clientid",
  namespaces: [],
});

const keycloakBaseUrl = "https://keycloak.bigbang.dev/auth";
const hardCodedGateway = { namespace: "istio-system", name: "bigbang" };
const { When } = KeycloakAuthSvc;

// Validate the authservice secret.
When(a.Secret)
  .IsCreatedOrUpdated()
  .WithName("authservice")
  .Then(async request => {
    const namespaceName = request.Raw.metadata?.namespace;
    if (namespaceName !== "authservice") {
      return;
    }
    const config = getVal(request, "config.json");

    const j = JSON.parse(config);
    new Config(j);
    request.SetLabel("done", "validated-syntax");
  });

/*
  kubectl create secret generic setup -n keycloak --from-literal=domain=bigbang.dev
  kubectl label secret setup -n keycloak todo=setupkeycloak
*/
// SetupKeyCloak networking (istio)
When(a.Secret)
  .IsCreatedOrUpdated()
  .WithName("setup")
  .WithLabel("todo", "setupkeycloak")
  .Then(async request => {
    // only allow creating these objects in the keycloak namespace
    const namespaceName = request.Raw.metadata?.namespace;
    if (namespaceName !== "keycloak") {
      return;
    }
    const domain = getVal(request, "domain");

    const k8sApi = new K8sAPI();
    await k8sApi.patchNamespaceForIstio("keycloak");
    await k8sApi.restartStatefulset("keycloak", "keycloak");

    await k8sApi.patchNamespaceForIstio("authservice");
    await k8sApi.restartDeployment("authservice", "authservice");

    // XXX: BDW: restart the keycloak statefulset
    await k8sApi.createOrUpdateIstioGateway(
      hardCodedGateway.name,
      hardCodedGateway.namespace,
      domain
    );
    await k8sApi.CreateOrUpdateVirtualService(
      namespaceName,
      "keycloak",
      `${hardCodedGateway.namespace}/${hardCodedGateway.name}`,
      domain,
      "keycloak",
      80
    );
    request.RemoveLabel("todo");
    request.SetLabel("done", "setupkeycloak");

    // TODO: patch istio configmap to enable authservice (istio operator can do it)
  });

// TODO: we can derive the realm name and domain from the authn/authz secrets
/* Demo steps
kubectl create secret generic configrealm -n keycloak --from-literal=realm=demo --from-literal=domain=bigbang.dev
kubectl label secret configrealm -n keycloak  todo=createrealm
*/
// CreateRealm
When(a.Secret)
  .IsCreatedOrUpdated()
  .WithName("configrealm")
  .WithLabel("todo", "createrealm")
  .Then(async request => {
    // only allow creating these objects in the keycloak namespace
    const namespaceName = request.Raw.metadata?.namespace;
    if (namespaceName !== "keycloak") {
      return;
    }

    const realm = getVal(request, "realm");
    const domain = getVal(request, "domain");

    // TODO: we need an async way to make keycloak accessible.
    const k8sApi = new K8sAPI();
    const kcAPI = new KcAPI(keycloakBaseUrl);
    await kcAPI.GetOrCreateRealm(realm);

    // TODO: Validate the state of the UpdateAuthorizationPolicy, since there will be only one per realm, we can do it here.
    //await k8sApi.createOrUpdateAuthorizationPolicy(namespaceName, domain, [`https://keycloak.${domain}/auth/realms/${realm}/*`])

    request.RemoveLabel("todo");
    request.SetLabel("done", "created");
  });

/* demo to create the client secret
kubectl create secret generic configclient -n podinfo --from-literal=realm=demo --from-literal=clientId=podinfo --from-literal=clientName=podinfo --from-literal=domain=bigbang.dev
kubectl label secret configclient -n podinfo  todo=createclient
*/
// CreateClient
When(a.Secret)
  .IsCreatedOrUpdated()
  .WithName("configclient")
  .WithLabel("todo", "createclient")
  .Then(async request => {
    // XXX: BDW: TODO: check keycloak to see if the realm exists already, it's an error if it doesn't exist.

    request.Raw.data = request.Raw.data || {};

    const realm = getVal(request, "realm");

    const clientId = getVal(request, "clientId");
    // XXX: BDW: client name isn't completely necessary and we can punt on it.
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

    // get the openid data from keycloak
    const openIdData = await kcAPI.GetOpenIdData(realm);

    request.Raw.data = request.Raw.data || {};

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
      request.Raw.metadata?.namespace ?? "",
      domain
    );

    request.RemoveLabel("todo");
    request.SetLabel("done", "createclient");
  });

// XXX: BDW: untested.
// keycloak: create a user (example only)
When(a.Secret)
  .IsCreated()
  .WithLabel("todo", "createuser")
  .Then(async request => {
    request.Raw.data = request.Raw.data || {};

    const newUser = {
      username: getVal(request, "user"),
      firstName: getVal(request, "firstname"),
      lastName: getVal(request, "lastname"),
      email: getVal(request, "email"),
      realm: getVal(request, "realm"),
      domain: getVal(request, "domain"),
      enabled: true,
    };

    const kcAPI = new KcAPI(keycloakBaseUrl);
    const userPassword = await kcAPI.GetOrCreateUser(newUser);

    request.Raw.data["password"] = Buffer.from(userPassword).toString("base64");
    request.RemoveLabel("todo");
    request.SetLabel("done", "created");
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

  // TODO: validate if this is necessary
  /*
  await k8sApi.CreateRequestAuthentication(
    namespace,
    clientName,
    openIdData.issuer,
    openIdData.jwks_uri
  );
  */

  // XXX: BDW hardcoded gateway, but in theory we can create a gateway for each app
  await k8sApi.CreateOrUpdateVirtualService(
    namespace,
    clientName,
    `${hardCodedGateway.namespace}/${hardCodedGateway.name}`,
    domain,
    clientName,
    9898
  );

  await k8sApi.patchNamespaceForIstio(namespace);

  await k8sApi.patchDeploymentForKeycloak(namespace, clientName);
  await k8sApi.restartDeployment("authservice", "authservice");
}

function getVal(request: PeprRequest<a.ConfigMap>, p: string): string {
  if (request.Raw.data && request.Raw.data[p]) {
    return Buffer.from(request.Raw.data[p], "base64").toString("utf-8");
  }
  throw new Error(`${p} not in the secret`);
}
