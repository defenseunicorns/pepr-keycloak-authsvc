import { Log, PeprModule } from "pepr";
import { Keycloak } from "./capabilities/keycloak";
// cfg loads your pepr configuration from package.json
import cfg from "./package.json";

/**
 * This is the main entrypoint for this Pepr module. It is run when the module is started.
 * This is where you register your Pepr configurations and capabilities.
 */
new PeprModule(
  cfg,
  [
    Keycloak,
    // Your additional capabilities go here
  ],
  {
    // Any actions you want to perform before the request is processed, including modifying the request.
    // Comment out or delete the line below to remove the default beforeHook.
    beforeHook: req => Log.debug(`beforeHook: ${req.uid}`),

    // Any actions you want to perform after the request is processed, including modifying the response.
    // Comment out or delete the line below to remove the default afterHook.
    afterHook: res => Log.debug(`afterHook: ${res.uid}`),
  }
);
