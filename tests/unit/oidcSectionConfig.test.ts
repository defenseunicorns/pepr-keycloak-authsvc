import test from "ava";
import {
  AccessTokenConfig,
  IdTokenConfig,
  JwksFetcherConfig,
  LogoutConfig,
  OIDCConfig,
  RedisConfig,
} from "../../capabilities/lib/authservice/oidcSectionConfig";

test("IdTokenConfig should create an object correctly", t => {
  const config = new IdTokenConfig();
  const obj = config.toObject();
  t.deepEqual(obj, { header: "Authorization", preamble: "Bearer" });
});

test("AccessTokenConfig should create an object correctly", t => {
  const config = new AccessTokenConfig();
  const obj = config.toObject();
  t.deepEqual(obj, { header: "JWT" });
});

test("RedisConfig should create an object correctly", t => {
  const config = new RedisConfig({ server_uri: "redis://localhost:6379" });
  const obj = config.toObject();
  t.deepEqual(obj, { server_uri: "redis://localhost:6379" });
});

test("LogoutConfig should create an object correctly", t => {
  const config = new LogoutConfig({
    path: "/logout",
    redirect_uri: "http://localhost:3000",
  });
  const obj = config.toObject();
  t.deepEqual(obj, { path: "/logout", redirect_uri: "http://localhost:3000" });
});

test("JwksFetcherConfig should create an object correctly", t => {
  const config = new JwksFetcherConfig({
    jwks_uri: "http://localhost/jwks_uri",
  });
  const obj = config.toObject();
  t.deepEqual(obj, {
    jwks_uri: "http://localhost/jwks_uri",
    periodic_fetch_interval_sec: undefined,
    skip_verify_peer_cert: undefined,
  });
});

test("OIDCConfig should create an object correctly", t => {
  const config = new OIDCConfig({
    authorization_uri: "http://localhost/auth",
    token_uri: "http://localhost/token",
    callback_uri: "http://localhost/callback",
    client_id: "test-client",
    client_secret: "test-secret",
  });
  const obj = config.toObject();
  t.deepEqual(obj, {
    authorization_uri: "http://localhost/auth",
    token_uri: "http://localhost/token",
    callback_uri: "http://localhost/callback",
    client_id: "test-client",
    client_secret: "test-secret",
    scopes: undefined,
    cookie_name_prefix: undefined,
    id_token: undefined,
    access_token: undefined,
    logout: undefined,
    jwks: undefined,
    jwks_fetcher: undefined,
    absolute_session_timeout: undefined,
    idle_session_timeout: undefined,
    trusted_certificate_authority: undefined,
    proxy_uri: undefined,
    redis_session_store_config: undefined,
    skip_verify_peer_cert: undefined,
  });
});
