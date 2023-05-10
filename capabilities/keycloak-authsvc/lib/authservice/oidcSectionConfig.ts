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
    if (!json.server_uri || json.server_uri.length < 1) {
      throw new TypeError(
        "server_uri is required and must be at least 1 character long"
      );
    }
    // Validate the URI
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
    // Validate the URI
    new URL(json.jwks_uri);
    this.jwks_uri = json.jwks_uri;
    if ("periodic_fetch_interval_sec" in json) {
      this.periodic_fetch_interval_sec = json.periodic_fetch_interval_sec;
    }
    if ("skip_verify_peer_cert" in json) {
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
  id_token: IdTokenConfig;
  access_token: AccessTokenConfig;
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
    if (!json.authorization_uri || json.authorization_uri.length < 1) {
      throw new TypeError(
        "authorization_uri is required and must be at least 1 character long"
      );
    }
    if (!json.token_uri || json.token_uri.length < 1) {
      throw new TypeError(
        "token_uri is required and must be at least 1 character long"
      );
    }
    if (!json.callback_uri || json.callback_uri.length < 1) {
      throw new TypeError(
        "callback_uri is required and must be at least 1 character long"
      );
    }
    if (!json.client_id || json.client_id.length < 1) {
      throw new TypeError(
        "client_id is required and must be at least 1 character long"
      );
    }
    if (!json.client_secret || json.client_secret.length < 1) {
      throw new TypeError(
        "client_secret is required and must be at least 1 character long"
      );
    }
    if (json.scopes && !Array.isArray(json.scopes)) {
      throw new TypeError("scopes must be an array");
    }

    // Validate the URIs
    new URL(json.authorization_uri);
    new URL(json.token_uri);
    new URL(json.callback_uri);

    this.authorization_uri = json.authorization_uri;
    this.token_uri = json.token_uri;
    this.callback_uri = json.callback_uri;
    this.client_id = json.client_id;
    this.client_secret = json.client_secret;
    if ("scopes" in json) {
      this.scopes = json.scopes;
    } else {
      this.scopes = [];
    }

    if ("cookie_name_prefix" in json) {
      this.cookie_name_prefix = json.cookie_name_prefix;
    }

    this.id_token = new IdTokenConfig();
    this.access_token = new AccessTokenConfig();

    if ("logout" in json) {
      this.logout = new LogoutConfig(json.logout);
    }

    if ("jwks" in json) {
      this.jwks = json.jwks;
    }

    if ("jwks_fetcher" in json) {
      this.jwks_fetcher = new JwksFetcherConfig(json.jwks_fetcher);
    }

    if ("absolute_session_timeout" in json) {
      this.absolute_session_timeout = json.absolute_session_timeout;
    }

    if ("idle_session_timeout" in json) {
      this.idle_session_timeout = json.idle_session_timeout;
    }

    if ("trusted_certificate_authority" in json) {
      this.trusted_certificate_authority = json.trusted_certificate_authority;
    } else {
      this.trusted_certificate_authority = "";
    }

    if ("proxy_uri" in json) {
      // Validate the URI
      new URL(json.proxy_uri);
      this.proxy_uri = json.proxy_uri;
    }

    if ("redis_session_store_config" in json) {
      this.redis_session_store_config = new RedisConfig(
        json.redis_session_store_config
      );
    }

    if ("skip_verify_peer_cert" in json) {
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
      id_token: this.id_token.toObject(),
      access_token: this.access_token.toObject(),
      logout: this.logout.toObject(),
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
