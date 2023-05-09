import { Capability, a, fetch } from "pepr";
import { KeycloakAPI } from "./lib/keycloak-api";

export const Keycloak = new Capability({
  name: "keycloak-pepr",
  description: "Simple example to configure keycloak realm and clientid",
  namespaces: [],
});

const keycloakBaseUrl = "https://keycloak.bigbang.dev";
const domain = "bigbang.dev";

const { When } = Keycloak;

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
    const kcAPI = new KeycloakAPI(keycloakBaseUrl);
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
    const realmName = getVal(request.Raw.data, "realmName");
    const clientId = getVal(request.Raw.data, "clientId");
    const clientName = getVal(request.Raw.data, "clientName");
    const kcAPI = new KeycloakAPI(keycloakBaseUrl);
    const redirectUri = `https://${clientId}.${domain}/login`;
    const clientSecret = await kcAPI.GetOrCreateClient(
      realmName,
      clientName,
      clientId,
      redirectUri
    );

    interface kcOpenIdData {
      authorization_endpoint: string;
      token_endpoint: string;
      jwks_uri: string;
    }

    const response = await fetch<kcOpenIdData>(
      `${keycloakBaseUrl}/auth/realms/${realmName}/.well-known/openid-configuration`
    );
    if (!response.ok) {
      throw new Error(
        `failed to get openid-configuration for realm ${realmName}`
      );
    }

    request.Raw.data["clientSecret"] =
      Buffer.from(clientSecret).toString("base64");
    request.Raw.data["authorization_uri"] = Buffer.from(
      response.data.authorization_endpoint
    ).toString("base64");
    request.Raw.data["token_uri"] = Buffer.from(
      response.data.token_endpoint
    ).toString("base64");
    request.Raw.data["jwks_uri"] = Buffer.from(response.data.jwks_uri).toString(
      "base64"
    );

    request.RemoveLabel("todo");
    request.SetLabel("done", "created");
    request.SetLabel("todo", "setupauthservice");
  });

// SetupAuthService
When(a.Secret)
  .IsCreatedOrUpdated()
  .WithName("config")
  .WithLabel("todo", "setupauthservice")
  .Then(async () => {
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
  });

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
    const kcAPI = new KeycloakAPI(keycloakBaseUrl);
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
