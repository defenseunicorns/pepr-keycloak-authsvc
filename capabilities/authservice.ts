import { Capability, Log, a } from "pepr";

import { AuthServiceSecretBuilder } from "./lib/authservice/secretBuilder";
import { K8sAPI } from "./lib/kubernetes-api";

export const AuthService = new Capability({
  name: "AuthService",
  description: "Simple example to configure AuthService",
  namespaces: [],
});

// TODO: add a workflow for deleting a client

const { When } = AuthService;

// temporary until we can have a post persisted builder
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
// Update the authservice secret (triggers from previous capability)
When(a.Secret)
  .IsCreatedOrUpdated()
  .WithLabel("pepr", "oidcconfig")
  .Then(async request => {
    try {
      const k8sApi = new K8sAPI();
      const authserviceSecretBuilder = new AuthServiceSecretBuilder(k8sApi);
      // XXX: BDW: TODO: remove once we have a post persisted builder
      setImmediate(async () => {
        // waiting 5 seconds for the previous objects to be created.
        await delay(5000);
        await authserviceSecretBuilder.buildAuthserviceSecret("pepr=oidcconfig");
        await k8sApi.restartDeployment("authservice", "authservice");
      });
    } catch (e) {
      Log.error(`error ${e}`);
    }
  });
 