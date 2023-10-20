import { OIDCConfig, OIDCConfigJSON } from "./oidcSectionConfig";

interface StringMatchJSON {
  exact?: string;
  prefix?: string;
  suffix?: string;
  regex?: string;
}

export class StringMatch {
  exact?: string;
  prefix?: string;
  suffix?: string;
  regex?: string;

  constructor(json: StringMatchJSON) {
    this.exact = json?.exact;
    this.prefix = json?.prefix;
    this.suffix = json?.suffix;
    this.regex = json?.regex;
  }
  toObject() {
    return {
      exact: this.exact,
      prefix: this.prefix,
      suffix: this.suffix,
      regex: this.regex,
    };
  }
}

interface TriggerRuleJSON {
  excluded_paths: StringMatchJSON[];
  included_paths: StringMatchJSON[];
}

export class TriggerRule {
  excluded_paths: StringMatch[];
  included_paths: StringMatch[];

  constructor(json: TriggerRuleJSON) {
    this.excluded_paths = json.excluded_paths.map(
      path => new StringMatch(path),
    );
    this.included_paths = json.included_paths.map(
      path => new StringMatch(path),
    );
  }
  toObject() {
    return {
      excluded_paths: this.excluded_paths.map(path => path.toObject()),
      included_paths: this.included_paths.map(path => path.toObject()),
    };
  }
}

interface MatchJSON {
  header: string;
  prefix?: string;
  equality?: string;
}

export class Match {
  header: string;
  prefix?: string;
  equality?: string;

  constructor(json: MatchJSON) {
    this.header = json.header;
    this.prefix = json?.prefix;
    this.equality = json?.equality;
    if (!this.prefix && !this.equality) {
      throw new TypeError("prefix or equality must be set");
    }
    if (this.prefix && this.equality) {
      throw new TypeError("prefix and equality cannot both be set");
    }
  }
  toObject() {
    return {
      header: this.header,
      prefix: this.prefix,
      equality: this.equality,
    };
  }
}

interface FilterJSON {
  oidc?: OIDCConfigJSON;
  oidc_override?: OIDCConfigJSON;
}

export class Filter {
  oidc?: OIDCConfig;
  oidc_override?: OIDCConfig;

  constructor(json: FilterJSON) {
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

  toObject() {
    return {
      oidc: this.oidc?.toObject(),
      oidc_override: this.oidc_override?.toObject(),
    };
  }
}

interface FilterChainJSON {
  name: string;
  match?: MatchJSON;
  filters: FilterJSON[];
}

export class FilterChain {
  name: string;
  match?: Match;
  filters: Filter[];

  constructor(json: FilterChainJSON) {
    this.name = json.name;

    if (json.match) {
      this.match = new Match(json.match);
    }

    this.filters = json.filters.map(filter => new Filter(filter));
  }
  toObject() {
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
  cookie_name_prefix: string;
}

interface AuthserviceConfigJSON {
  chains: FilterChainJSON[];
  listen_address: string;
  listen_port: number;
  log_level: string;
  threads: number;
  trigger_rules?: TriggerRuleJSON[];
  default_oidc_config?: OIDCConfigJSON;
  allow_unmatched_requests?: boolean;
}

interface AuthserviceConfigJSON {
  chains: FilterChainJSON[];
  listen_address: string;
  listen_port: number;
  log_level: string;
  threads: number;
  trigger_rules?: TriggerRuleJSON[];
  default_oidc_config?: OIDCConfigJSON;
  allow_unmatched_requests?: boolean;
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

  constructor(json: AuthserviceConfigJSON) {
    this.chains = json.chains.map(chain => new FilterChain(chain));
    this.listen_address = json.listen_address;
    this.listen_port = json.listen_port;
    this.log_level = json.log_level;
    this.threads = json.threads;

    if (json.trigger_rules !== undefined) {
      this.trigger_rules = json.trigger_rules.map(
        rule => new TriggerRule(rule),
      );
    }

    if (json.default_oidc_config !== undefined) {
      this.default_oidc_config = new OIDCConfig(json.default_oidc_config);
    }
    this.allow_unmatched_requests = json?.allow_unmatched_requests;
  }

  static createSingleChain(input: ChainInput): FilterChain {
    const oidcConfig = new OIDCConfig({
      callback_uri: input.redirect_uri,
      client_id: input.id,
      client_secret: input.secret,
      cookie_name_prefix: input.cookie_name_prefix,
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

  toObject() {
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
