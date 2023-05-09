import { fetch, Capability, a } from "pepr";
import { KCAPI } from "./lib/kc-api";
import { Config, CreateChainInput } from "./lib/authservice/secretConfig";
import { K8sAPI } from "./lib/kubernetes-api"


export const KeycloakIstioAuthSvc = new Capability({
  name: "keycloak-authservice-pepr",
  description: "Simple example to configure keycloak realm and clientid",
  namespaces: [],
});

const keycloakBaseUrl = "https://keycloak.bigbang.dev/auth"
const domain = "bigbang.dev"

const { When } = KeycloakIstioAuthSvc;


// Validate the authservice secret.
When(a.Secret)
  .IsCreatedOrUpdated()
  .WithName("authservice")
  .Then(async request => {
    const namespaceName = request.Raw.metadata.namespace;
    if (namespaceName !== "authservice") {
      return
    }
    const config = getVal(request.Raw.data, "config.json")

    const j = JSON.parse(config)
    const c =  new Config(j)
    request.SetLabel("done", "validated-syntax")
  })



// CreateRealm
When(a.Secret)
  .IsCreatedOrUpdated()
  .WithLabel("todo", "createrealm")
  .Then(async request => {
    const namespaceName = request.Raw.metadata.namespace;
    if (namespaceName !== "keycloak") {
      return
    }
    const realmName = request.Raw.metadata.name
    const kcAPI = new KCAPI(keycloakBaseUrl)
    await kcAPI.GetOrCreateRealm(realmName)
    request.RemoveLabel("todo")
    request.SetLabel("done", "created")
  })


// CreateClient
When(a.Secret)
  .IsCreatedOrUpdated()
  .WithName("config")
  .WithLabel("todo", "createclient")
  .Then(async request => {    

    // 1. get the new clientsecret
    const realmName = getVal(request.Raw.data, "realmName");


    const clientId = getVal(request.Raw.data, "clientId");
    const clientName = getVal(request.Raw.data, "clientName");
    const kcAPI = new KCAPI(keycloakBaseUrl)
    const redirectUri = `https://${clientId}.${domain}/login`
    const clientSecret = await kcAPI.GetOrCreateClient(realmName, clientName, clientId, redirectUri)

    // 2. get the openid stuff
    interface kcOpenIdData {
      authorization_endpoint: string
      token_endpoint: string
      jwks_uri: string
      end_session_endpoint: string
    }

    const response = await fetch<kcOpenIdData>(`${keycloakBaseUrl}/realms/${realmName}/.well-known/openid-configuration`)
    if (!response.ok) {
      throw new Error(`failed to get openid-configuration for realm ${realmName}`)
    }
    
    request.Raw.data['clientSecret'] = Buffer.from(clientSecret).toString("base64")
    request.Raw.data['authorization_uri'] = Buffer.from(response.data.authorization_endpoint).toString("base64")
    request.Raw.data['token_uri'] = Buffer.from(response.data.token_endpoint).toString("base64")
    request.Raw.data['jwks_uri'] = Buffer.from(response.data.jwks_uri).toString("base64")
    request.Raw.data['redirect_uri'] = Buffer.from(redirectUri).toString("base64")
    request.Raw.data['logout_uri'] = Buffer.from(response.data.end_session_endpoint).toString("base64")

    request.RemoveLabel("todo")
    request.SetLabel("done", "clientcreated")

    // get the existing config.json secret
    const k8sApi = new K8sAPI();
    const configRaw = await k8sApi.getSecretValue(
      "authservice",
      "authservice",
      "config.json"
    )
    const oldConfig = new Config(JSON.parse(configRaw))

    const chainInput:  CreateChainInput = {
      name: clientName,
      authorization_uri: response.data.authorization_endpoint,
      token_uri: response.data.token_endpoint,
      jwks_uri: response.data.jwks_uri,
      redirect_uri: redirectUri,
      clientSecret: clientSecret,
      logout_uri: response.data.end_session_endpoint,
      }
      
      const newConfig = new Config({
        chains: [Config.CreateSingleChain(chainInput)],
        listen_address: oldConfig.listen_address,
        listen_port: oldConfig.listen_port,
        log_level: oldConfig.log_level,
        threads: oldConfig.threads,
      })

      await k8sApi.createOrUpdateSecret("authservice", "authservice", "config.json", JSON.stringify(newConfig)) 



    request.SetLabel("todo", "setupauthservice")
    
  })

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
    const kcAPI = new KCAPI(keycloakBaseUrl)
    const userPassword = await kcAPI.GetOrCreateUser(newUser)
    request.Raw.data['password'] = Buffer.from(userPassword).toString("base64")
    request.RemoveLabel("todo")
    request.SetLabel("done", "created")
  });




function getVal(data: { [key: string]: string }, p: string): string {
  if (data && data[p]) {
    return Buffer.from(data[p], "base64").toString("utf-8");
  }
  throw new Error(`${p} not in the secret`);
}
