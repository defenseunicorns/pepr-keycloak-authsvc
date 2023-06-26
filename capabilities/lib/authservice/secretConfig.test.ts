import test from "ava";
import { AuthserviceConfig, ChainInput, Match } from "./secretConfig";
import { LogoutConfig, OIDCConfig } from "./oidcSectionConfig";

test("AuthserviceConfig should handle input correctly", t => {
  const chainInput: ChainInput = {
    id: "test",
    name: "test",
    hostname: "test.hostname",
    redirect_uri: "http://localhost:8080",
    secret: "secret",
    domain: "example.com",
    realm: "brown-bear",
  };

  const filterChain = AuthserviceConfig.createSingleChain(chainInput);

  // Check FilterChain properties
  t.is(filterChain.name, chainInput.name);
  t.truthy(filterChain.match);
  t.truthy(filterChain.filters);

  const match = filterChain.match as Match;
  t.is(match.header, ":authority");
  t.is(match.equality, chainInput.hostname);

  const filter = filterChain.filters[0];
  t.truthy(filter.oidc_override);

  const oidcConfig = filter.oidc_override as OIDCConfig;
  t.is(oidcConfig.callback_uri, chainInput.redirect_uri);
  t.is(oidcConfig.client_id, chainInput.name);
  t.is(oidcConfig.client_secret, chainInput.secret);
  t.is(oidcConfig.cookie_name_prefix, chainInput.name);

  const logoutConfig = oidcConfig.logout as LogoutConfig;
  t.is(logoutConfig.path, "/logout");
  t.is(
    logoutConfig.redirect_uri,
    "https://keycloak.example.com/auth/realms/brown-bear/protocol/openid-connect/logout?client_id=test"
  );

  const json = {
    chains: [filterChain.toObject()],
    listen_address: "localhost",
    listen_port: 8080,
    log_level: "debug",
    threads: 1,
  };

  const authserviceConfig = new AuthserviceConfig(json);

  // Check AuthserviceConfig properties
  t.is(authserviceConfig.chains.length, 1);
  t.is(authserviceConfig.listen_address, "localhost");
  t.is(authserviceConfig.listen_port, 8080);
  t.is(authserviceConfig.log_level, "debug");
  t.is(authserviceConfig.threads, 1);
});
