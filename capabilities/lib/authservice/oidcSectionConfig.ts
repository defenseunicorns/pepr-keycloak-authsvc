interface RedisConfigJSON {
  server_uri: string;
}

interface LogoutConfigJSON {
  path: string;
  redirect_uri: string;
}

interface JwksFetcherConfigJSON {
  jwks_uri: string;
  periodic_fetch_interval_sec?: number;
  skip_verify_peer_cert?: boolean;
}

export interface OIDCConfigJSON {
  authorization_uri?: string;
  token_uri?: string;
  callback_uri: string;
  client_id: string;
  client_secret: string;
  scopes?: string[];
  cookie_name_prefix?: string;
  id_token?: IdTokenConfig;
  access_token?: AccessTokenConfig;
  logout?: LogoutConfigJSON;
  jwks?: string;
  jwks_fetcher?: JwksFetcherConfigJSON;
  absolute_session_timeout?: number;
  idle_session_timeout?: number;
  trusted_certificate_authority?: string;
  proxy_uri?: string;
  redis_session_store_config?: RedisConfig;
  skip_verify_peer_cert?: boolean;
}
export class IdTokenConfig {
  header = "Authorization";
  preamble = "Bearer";

  toObject() {
    return {
      header: this?.header,
      preamble: this?.preamble,
    };
  }
}

export class AccessTokenConfig {
  header = "JWT";

  toObject(): Record<string, string> {
    return {
      header: this.header,
    };
  }
}

export class RedisConfig {
  server_uri: string;

  constructor(json?: RedisConfigJSON) {
    new URL(json.server_uri);
    this.server_uri = json.server_uri;
  }
  toObject(): Record<string, string> {
    return {
      server_uri: this.server_uri,
    };
  }
}

export class LogoutConfig {
  path: string;
  redirect_uri: string;

  constructor(json: LogoutConfigJSON) {
    if (!json.path || json.path.length < 1) {
      throw new TypeError(
        "path is required and must be at least 1 character long",
      );
    }
    if (!json.redirect_uri || json.redirect_uri.length < 1) {
      throw new TypeError(
        "redirect_uri is required and must be at least 1 character long",
      );
    }

    // Validate the URI
    new URL(json.redirect_uri);

    this.path = json.path;
    this.redirect_uri = json.redirect_uri;
  }
  toObject() {
    return {
      path: this.path,
      redirect_uri: this.redirect_uri,
    };
  }
}

export class JwksFetcherConfig {
  jwks_uri: string;
  periodic_fetch_interval_sec?: number;
  skip_verify_peer_cert?: boolean;

  constructor(json: JwksFetcherConfigJSON) {
    if (!json.jwks_uri) {
      throw new TypeError("jwks_uri is required");
    }

    new URL(json.jwks_uri);

    this.jwks_uri = json.jwks_uri;
    this.periodic_fetch_interval_sec = json?.periodic_fetch_interval_sec;
    this.skip_verify_peer_cert = json?.skip_verify_peer_cert;
  }
  toObject() {
    return {
      jwks_uri: this.jwks_uri,
      periodic_fetch_interval_sec: this.periodic_fetch_interval_sec,
      skip_verify_peer_cert: this.skip_verify_peer_cert,
    };
  }
}

export class OIDCConfig {
  authorization_uri?: string;
  token_uri?: string;
  callback_uri: string;
  client_id: string;
  client_secret: string;
  scopes?: string[];
  cookie_name_prefix?: string;
  id_token?: IdTokenConfig;
  access_token?: AccessTokenConfig;
  logout?: LogoutConfig;
  jwks?: string;
  jwks_fetcher?: JwksFetcherConfig;
  absolute_session_timeout?: number;
  idle_session_timeout?: number;
  trusted_certificate_authority?: string;
  proxy_uri?: string;
  redis_session_store_config?: RedisConfig;
  skip_verify_peer_cert?: boolean;

  constructor(json: OIDCConfigJSON) {
    this.authorization_uri = json.authorization_uri;
    this.token_uri = json.token_uri;
    this.callback_uri = json.callback_uri;
    this.client_id = json.client_id;
    this.client_secret = json.client_secret;
    this.scopes = json.scopes;

    this.cookie_name_prefix = json.cookie_name_prefix;
    this.id_token = json.id_token;
    this.access_token = json.access_token;

    if (json.logout) {
      this.logout = new LogoutConfig(json.logout);
    }

    this.jwks = json.jwks;

    if (json.jwks_fetcher) {
      this.jwks_fetcher = new JwksFetcherConfig(json.jwks_fetcher);
    }

    this.absolute_session_timeout = json.absolute_session_timeout;
    this.idle_session_timeout = json.idle_session_timeout;
    this.trusted_certificate_authority = json.trusted_certificate_authority;
    this.proxy_uri = json.proxy_uri;
    this.redis_session_store_config = json.redis_session_store_config;
    this.skip_verify_peer_cert = json.skip_verify_peer_cert;
  }

  toObject() {
    return {
      authorization_uri: this?.authorization_uri,
      token_uri: this?.token_uri,
      callback_uri: this.callback_uri,
      client_id: this.client_id,
      client_secret: this.client_secret,
      scopes: this.scopes,
      cookie_name_prefix: this.cookie_name_prefix,
      id_token: this.id_token?.toObject(),
      access_token: this.access_token?.toObject(),
      logout: this.logout?.toObject(),
      jwks: this.jwks,
      jwks_fetcher: this.jwks_fetcher?.toObject(),
      absolute_session_timeout: this.absolute_session_timeout,
      idle_session_timeout: this.idle_session_timeout,
      trusted_certificate_authority: this.trusted_certificate_authority,
      proxy_uri: this.proxy_uri,
      redis_session_store_config: this.redis_session_store_config?.toObject(),
      skip_verify_peer_cert: this.skip_verify_peer_cert,
    };
  }
}
