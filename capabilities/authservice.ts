import { Capability, Log, a } from "pepr";

import { AuthServiceSecretBuilder } from "./lib/authservice/secretBuilder";
import { K8sAPI } from "./lib/kubernetes-api";

export const AuthService = new Capability({
  name: "AuthService",
  description: "Simple example to configure AuthService",
  namespaces: [],
});

const { When } = AuthService;

// Watch should help us here.
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// TODO: When we have Watch() this will be correct, as the secrets will be persisted.
async function updateAuthServiceSecret() {
  try {
    const k8sApi = new K8sAPI();
    const authserviceSecretBuilder = new AuthServiceSecretBuilder(k8sApi);
    setImmediate(async () => {
      // XXX:TODO: this isn't enough time. waiting 5 seconds for the previous objects to be created.
      await delay(5000);
      const sha256Hash = await authserviceSecretBuilder.buildAuthserviceSecret(
        "pepr.dev/keycloak=oidcconfig"
      );
      await k8sApi.checksumDeployment("authservice", "authservice", sha256Hash);
    });
  } catch (e) {
    Log.error(`error ${e}`);
  }
}

// In the event that any secrets are changed that are used by authservice, regenerate the authservice secret
// Created/Deleted/Updated.
When(a.Secret)
  .IsCreatedOrUpdated()
  .WithLabel("pepr.dev/keycloak", "oidcconfig")
  .Then(async () => {
    await updateAuthServiceSecret();
  });

When(a.Secret)
  .IsDeleted()
  .WithLabel("pepr.dev/keycloak", "oidcconfig")
  .Then(async () => {
    await updateAuthServiceSecret();
  });
