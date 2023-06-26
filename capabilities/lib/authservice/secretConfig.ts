import { LogoutConfig, OIDCConfig } from "./oidcSectionConfig";

export class StringMatch {
  exact?: string;
  prefix?: string;
  suffix?: string;
  regex?: string;

  constructor(json: any) {
    if (json.exact !== undefined) {
      this.exact = json.exact;
    }
    if (json.prefix !== undefined) {
      this.prefix = json.prefix;
    }
    if (json.suffix !== undefined) {
      this.suffix = json.suffix;
    }
    if (json.regex !== undefined) {
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

export class Match {
  header: string;
  prefix?: string;
  equality?: string;

  constructor(json: any) {
    this.header = json.header;

    if (json.prefix) {
      this.prefix = json.prefix;
    }
    if (json.equality) {
      this.equality = json.equality;
    }
    if (!this.prefix && !this.equality) {
      throw new TypeError("prefix or equality must be set");
    }
    if (this.prefix && this.equality) {
      throw new TypeError("prefix and equality cannot both be set");
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

export class Filter {
  oidc?: OIDCConfig;
  oidc_override?: OIDCConfig;

  constructor(json: any) {
    if (json.oidc) {
      this.oidc = new OIDCConfig(json.oidc);
    }
    if (json.oidc_override) {
      this.oidc_override = new OIDCConfig(json.oidc_override);
    }
    if (!this.oidc && !this.oidc_override) {
      throw new TypeError("oidc or oidc_override must be set");
    }
    if (this.oidc && this.oidc_override) {
      throw new TypeError("oidc and oidc_override cannot both be set");
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

    if (json.match) {
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

export interface ChainInput {
  name: string;
  hostname: string;
  redirect_uri: string;
  secret: string;
  id: string;
}

export class AuthserviceConfig {
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

    if (json.trigger_rules !== undefined) {
      this.trigger_rules = json.trigger_rules.map(
        (rule: any) => new TriggerRule(rule)
      );
    }

    if (json.default_oidc_config !== undefined) {
      this.default_oidc_config = new OIDCConfig(json.default_oidc_config);
    }

    if (json.allow_unmatched_requests !== undefined) {
      this.allow_unmatched_requests = json.allow_unmatched_requests;
    }
  }

  static createSingleChain(input: ChainInput): FilterChain {
    const logout = new LogoutConfig({
      path: "/logout",
      redirect_uri: `https://keycloak.${input.domain}/auth/realms/${input.realm}/protocol/openid-connect/logout?client_id=${input.id}`,
    });

    const oidcConfig = new OIDCConfig({
      callback_uri: input.redirect_uri,
      client_id: input.id,
      client_secret: input.secret,
      cookie_name_prefix: input.name,
      logout: logout,
    });

    const filter = new Filter({
      oidc_override: oidcConfig,
    });

    const matchMe = new Match({
      header: ":authority",
      equality: input.hostname,
    });

    return new FilterChain({
      name: input.name,
      match: matchMe,
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
