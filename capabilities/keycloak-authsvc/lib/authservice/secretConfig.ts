import {
  AccessTokenConfig,
  IdTokenConfig,
  JwksFetcherConfig,
  LogoutConfig,
  OIDCConfig,
} from "./oidcSectionConfig";

// XXX: BDW: make sure they are valid regexes
export class StringMatch {
  exact?: string;
  prefix?: string;
  suffix?: string;
  regex?: string;

  constructor(json: any) {
    if ("exact" in json) {
      this.exact = json.exact;
    }
    if ("prefix" in json) {
      this.prefix = json.prefix;
    }
    if ("suffix" in json) {
      this.suffix = json.suffix;
    }
    if ("regex" in json) {
      this.regex = json.regex;
    }
  }
  toObject(): Record<string, any> {
    return {
      exact: this.exact,
      prefix: this.prefix,
      suffix: this.suffix,
      regex: this.regex,
    };
  }
}

export class TriggerRule {
  excluded_paths: StringMatch[];
  included_paths: StringMatch[];

  constructor(json: any) {
    this.excluded_paths = json.excluded_paths.map(
      (path: any) => new StringMatch(path)
    );
    this.included_paths = json.included_paths.map(
      (path: any) => new StringMatch(path)
    );
  }
  toObject(): Record<string, any> {
    return {
      excluded_paths: this.excluded_paths.map(path => path.toObject()),
      included_paths: this.included_paths.map(path => path.toObject()),
    };
  }
}

// XXX: BDW: make sure both aren't set.
export class Match {
  header: string;
  prefix?: string;
  equality?: string;

  constructor(json: any) {
    this.header = json.header;

    if ("prefix" in json) {
      this.prefix = json.prefix;
    }
    if ("equality" in json) {
      this.equality = json.equality;
    }
  }
  toObject(): Record<string, any> {
    return {
      header: this.header,
      prefix: this.prefix,
      equality: this.equality,
    };
  }
}

// XXX: BDW: make sure both aren't set,
export class Filter {
  oidc?: OIDCConfig;
  oidc_override?: OIDCConfig;

  constructor(json: any) {
    if ("oidc" in json) {
      this.oidc = new OIDCConfig(json.oidc);
    }
    if ("oidc_override" in json) {
      this.oidc_override = new OIDCConfig(json.oidc_override);
    }
  }

  toObject(): Record<string, any> {
    const obj: Record<string, any> = {};

    if (this.oidc) {
      obj.oidc = this.oidc.toObject();
    }
    if (this.oidc_override) {
      obj.oidc_override = this.oidc_override.toObject();
    }

    return obj;
  }
}

export class FilterChain {
  name: string;
  match?: Match;
  filters: Filter[];

  constructor(json: any) {
    this.name = json.name;

    if ("match" in json) {
      this.match = new Match(json.match);
    }

    this.filters = json.filters.map((filter: any) => new Filter(filter));
  }
  toObject(): Record<string, any> {
    return {
      name: this.name,
      match: this.match?.toObject(),
      filters: this.filters.map(filter => filter.toObject()),
    };
  }
}

export interface CreateChainInput {
  name: string;
  fqdn: string;
  authorization_uri: string;
  token_uri: string;
  jwks_uri: string;
  redirect_uri: string;
  clientSecret: string;
  logout_uri: string;
}

export class Config {
  chains: FilterChain[];
  listen_address: string;
  listen_port: number;
  log_level: string;
  threads: number;
  trigger_rules?: TriggerRule[];
  default_oidc_config?: OIDCConfig;
  allow_unmatched_requests?: boolean;

  constructor(json: any) {
    this.chains = json.chains.map((chain: any) => new FilterChain(chain));
    this.listen_address = json.listen_address;
    this.listen_port = json.listen_port;
    this.log_level = json.log_level;
    this.threads = json.threads;

    if ("trigger_rules" in json) {
      this.trigger_rules = json.trigger_rules.map(
        (rule: any) => new TriggerRule(rule)
      );
    }

    if ("default_oidc_config" in json) {
      this.default_oidc_config = new OIDCConfig(json.default_oidc_config);
    }

    if ("allow_unmatched_requests" in json) {
      this.allow_unmatched_requests = json.allow_unmatched_requests;
    }
  }

  static CreateSingleChain(input: CreateChainInput): FilterChain {
    const oidcConfig = new OIDCConfig({
      skip_verify_peer_cert: true,
      authorization_uri: input.authorization_uri,
      token_uri: input.token_uri,
      jwks_fetcher: new JwksFetcherConfig({
        jwks_uri: input.jwks_uri,
        periodic_fetch_interval_sec: 60,
        skip_verify_peer_cert: true,
      }),
      id_token: new IdTokenConfig(),
      access_token: new AccessTokenConfig(),
      absolute_session_timeout: 0,
      idle_session_timeout: 0,
      callback_uri: input.redirect_uri,
      logout: new LogoutConfig({
        path: "/logout",
        redirect_uri: input.logout_uri,
      }),
      client_id: input.name,
      client_secret: input.clientSecret,
      cookie_name_prefix: input.name,
    });

    const filter = new Filter({
      oidc: oidcConfig,
    });

    return new FilterChain({
      name: input.name,
      match: new Match({ header: ":authority", equality: input.fqdn }),
      filters: [filter],
    });
  }

  toObject(): Record<string, any> {
    return {
      chains: this.chains.map(chain => chain.toObject()),
      listen_address: this.listen_address,
      listen_port: this.listen_port,
      log_level: this.log_level,
      threads: this.threads,
      trigger_rules: this.trigger_rules.map(rule => rule.toObject()),
      default_oidc_config: this.default_oidc_config?.toObject(),
      allow_unmatched_requests: this.allow_unmatched_requests,
    };
  }
}
