import test from "ava";
import {
  AuthserviceConfig,
  ChainInput,
  Match,
} from "../../capabilities/lib/authservice/secretConfig";
import { OIDCConfig } from "../../capabilities/lib/authservice/oidcSectionConfig";

test("AuthserviceConfig should handle input correctly", t => {
  const chainInput: ChainInput = {
    id: "test",
    name: "test",
    hostname: "test.hostname",
    redirect_uri: "http://localhost:8080",
    secret: "secret",
    cookie_name_prefix: "testNamespace_test",
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
  t.is(oidcConfig.cookie_name_prefix, chainInput.cookie_name_prefix);

  const authserviceConfig = new AuthserviceConfig({
    chains: [filterChain],
    listen_address: "localhost",
    listen_port: 8080,
    log_level: "debug",
    threads: 1,
  });

  // Check AuthserviceConfig properties
  t.is(authserviceConfig.chains.length, 1);
  t.is(authserviceConfig.listen_address, "localhost");
  t.is(authserviceConfig.listen_port, 8080);
  t.is(authserviceConfig.log_level, "debug");
  t.is(authserviceConfig.threads, 1);
});
