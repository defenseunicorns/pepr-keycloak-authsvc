import { PeprModule } from "pepr";
import { KeycloakAuthSvc } from "./capabilities/keycloak-authsvc";
// cfg loads your pepr configuration from package.json
import cfg from "./package.json";

/**
 * This is the main entrypoint for this Pepr module. It is run when the module is started.
 * This is where you register your Pepr configurations and capabilities.
 */
new PeprModule(cfg, [KeycloakAuthSvc]);
