import { Capability, a, fetch } from "pepr";
import { Config, CreateChainInput } from "./lib/authservice/secretConfig";
import { KcAPI, OpenIdData } from "./lib/kc-api";
import { K8sAPI } from "./lib/kubernetes-api";

export const KeycloakAuthSvc = new Capability({
  name: "keycloak-authsvc",
  description: "Simple example to configure keycloak realm and clientid",
  namespaces: [],
});

const keycloakBaseUrl = "https://keycloak.bigbang.dev/auth";
const domain = "bigbang.dev";

const { When } = KeycloakAuthSvc;

// Validate the authservice secret.
When(a.Secret)
  .IsCreatedOrUpdated()
  .WithName("authservice")
  .Then(async request => {
    const namespaceName = request.Raw.metadata.namespace;
    if (namespaceName !== "authservice") {
      return;
    }
    const config = getVal(request.Raw.data, "config.json");

    const j = JSON.parse(config);
    new Config(j);
    request.SetLabel("done", "validated-syntax");
  });

// CreateRealm
When(a.Secret)
  .IsCreatedOrUpdated()
  .WithLabel("todo", "createrealm")
  .Then(async request => {
    const namespaceName = request.Raw.metadata.namespace;
    if (namespaceName !== "keycloak") {
      return;
    }
    const realmName = request.Raw.metadata.name;
    const kcAPI = new KcAPI(keycloakBaseUrl);
    await kcAPI.GetOrCreateRealm(realmName);
    request.RemoveLabel("todo");
    request.SetLabel("done", "created");
  });

// CreateClient
When(a.Secret)
  .IsCreatedOrUpdated()
  .WithName("config")
  .WithLabel("todo", "createclient")
  .Then(async request => {
    // read the content from the secret
    const realmName = getVal(request.Raw.data, "realmName");
    const clientId = getVal(request.Raw.data, "clientId");
    const clientName = getVal(request.Raw.data, "clientName");

    // have keycloak generate the new client and return the secret
    const kcAPI = new KcAPI(keycloakBaseUrl);
    const redirectUri = `https://${clientId}.${domain}/login`;
    const clientSecret = await kcAPI.GetOrCreateClient(
      realmName,
      clientName,
      clientId,
      redirectUri
    );

    // get the openid data from keycloak
    const openIdData = await kcAPI.GetOpenIdData(realmName);

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

    request.RemoveLabel("todo");
    request.SetLabel("done", "clientcreated");

    // get the existing config.json secret
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

    // XXX: make sure we're not just appending.
    oldConfig.chains.push(Config.CreateSingleChain(chainInput));
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

    // XXX: BDW: we only need one Authn per realm.
    await k8sApi.CreateRequestAuthentication(
      request.Raw.metadata.namespace,
      clientName,
      openIdData.issuer,
      openIdData.jwks_uri
    );

    // XXX: BDW: we need to know which gateway to use (including the namespace it's in), and we need to patch it to add ${clientName}.${domain} to the hosts
    // XXX: BDW: we also need to know which service to expose? that might need to go into the `config` secret...

    // XXX: BDW the gateway should not require updating because it should be like "*.bigbang.dev"
    await k8sApi.CreateOrUpdateVirtualService(
      request.Raw.metadata.namespace,
      clientName,
      "default/bigbang",
      domain,
      clientName,
      9898
    );

    await k8sApi.patchNamespaceForIstio(request.Raw.metadata.namespace);

    // XXX: BDW: we also need to know if we're securing a statefulset too, in which case, we might need to manually restart the
    // pods for it...
    await k8sApi.patchDeploymentForKeycloak(
      request.Raw.metadata.namespace,
      clientName
    );

    request.SetLabel("todo", "setupauthservice");
  });

/*

// SetupAuthService (will write to the authservice namespace, so it can be managed properly)
When(a.Secret)
  .IsCreatedOrUpdated()
  .WithName("config")
  .WithLabel("todo", "setupauthservice")
  .Then(async request => {    

  // XXX: BDW: TODO:
  // create the authservice config.json secret, but it should be fully recreated everytime, not just patched.
  // can we get rid of the default_oidc_config? and just have chains? Can we make the deployment of not create or own this file, we might need
  //    different versions of this logic.
  // 
  // we should assume that authservice base is setup?
  // setup:
  //    1. AuthorizationPolicy (authz)
  //    2. RequestAuthentication (authn)
  //    3. peerauthentications (mtls config) (only need 1)
  //    4. deployment/sts needs to be tagged to be secured, the protect:keycloak label isn't clear enough, we'll add a better one.
  })
*/

// keycloak: create a user (example only)
When(a.Secret)
  .IsCreated()
  .WithLabel("todo", "createuser")
  .Then(async request => {
    const newUser = {
      username: getVal(request.Raw.data, "user"),
      firstName: getVal(request.Raw.data, "firstname"),
      lastName: getVal(request.Raw.data, "lastname"),
      email: getVal(request.Raw.data, "email"),
      realm: getVal(request.Raw.data, "realmName"),
      enabled: true,
    };
    const kcAPI = new KcAPI(keycloakBaseUrl);
    const userPassword = await kcAPI.GetOrCreateUser(newUser);
    request.Raw.data["password"] = Buffer.from(userPassword).toString("base64");
    request.RemoveLabel("todo");
    request.SetLabel("done", "created");
  });

function getVal(data: { [key: string]: string }, p: string): string {
  if (data && data[p]) {
    return Buffer.from(data[p], "base64").toString("utf-8");
  }
  throw new Error(`${p} not in the secret`);
}
