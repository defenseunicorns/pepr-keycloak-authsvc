export class IdTokenConfig {
  header = "Authorization";
  preamble = "Bearer";

  toObject(): Record<string, any> {
    return {
      header: this?.preamble,
      preamble: this?.preamble,
    };
  }
}

export class AccessTokenConfig {
  header = "JWT";

  toObject(): Record<string, any> {
    return {
      header: this.header,
    };
  }
}

class RedisConfig {
  server_uri: string;

  constructor(json?: any) {
    new URL(json.server_uri);
    this.server_uri = json.server_uri;
  }
  toObject(): Record<string, any> {
    return {
      server_uri: this.server_uri,
    };
  }
}

export class LogoutConfig {
  path: string;
  redirect_uri: string;

  constructor(json: any) {
    if (!json.path || json.path.length < 1) {
      throw new TypeError(
        "path is required and must be at least 1 character long"
      );
    }
    if (!json.redirect_uri || json.redirect_uri.length < 1) {
      throw new TypeError(
        "redirect_uri is required and must be at least 1 character long"
      );
    }

    // Validate the URI
    new URL(json.redirect_uri);

    this.path = json.path;
    this.redirect_uri = json.redirect_uri;
  }
  toObject(): Record<string, any> {
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

  constructor(json: any) {
    if (!json.jwks_uri) {
      throw new TypeError("jwks_uri is required");
    }

    new URL(json.jwks_uri);

    this.jwks_uri = json.jwks_uri;
    if (json.periodic_fetch_interval_sec) {
      this.periodic_fetch_interval_sec = json.periodic_fetch_interval_sec;
    }
    if (json.skip_verify_peer_cert) {
      this.skip_verify_peer_cert = json.skip_verify_peer_cert;
    }
  }
  toObject(): Record<string, any> {
    return {
      jwks_uri: this.jwks_uri,
      periodic_fetch_interval_sec: this.periodic_fetch_interval_sec,
      skip_verify_peer_cert: this.skip_verify_peer_cert,
    };
  }
}

export class OIDCConfig {
  authorization_uri: string;
  token_uri: string;
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

  constructor(json: any) {
    this.authorization_uri = json.authorization_uri;
    this.token_uri = json.token_uri;
    this.callback_uri = json.callback_uri;
    this.client_id = json.client_id;
    this.client_secret = json.client_secret;
    if (json.scopes) {
      this.scopes = json.scopes;
    } else {
      this.scopes = [];
    }

    if ("cookie_name_prefix" in json) {
      this.cookie_name_prefix = json.cookie_name_prefix;
    }

    this.id_token = json.id_token;
    this.access_token = json.access_token;

    if (json.logout) {
      this.logout = new LogoutConfig(json.logout);
    }

    if (json.jwks) {
      this.jwks = json.jwks;
    }

    if (json.jwks_fetcher) {
      this.jwks_fetcher = new JwksFetcherConfig(json.jwks_fetcher);
    }

    if (json.absolute_session_timeout) {
      this.absolute_session_timeout = json.absolute_session_timeout;
    }

    if (json.idle_session_timeout) {
      this.idle_session_timeout = json.idle_session_timeout;
    }

    if (json.trusted_certificate_authority) {
      this.trusted_certificate_authority = json.trusted_certificate_authority;
    }

    if (json.proxy_uri) {
      new URL(json.proxy_uri);
      this.proxy_uri = json.proxy_uri;
    }

    if (json.redis_session_store_config) {
      this.redis_session_store_config = json.redis_session_store_config;
    }

    if (json.skip_verify_peer_cert) {
      this.skip_verify_peer_cert = json.skip_verify_peer_cert;
    }
  }

  toObject(): Record<string, any> {
    return {
      authorization_uri: this.authorization_uri,
      token_uri: this.token_uri,
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
