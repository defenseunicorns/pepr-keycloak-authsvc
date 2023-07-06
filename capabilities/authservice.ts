import { Capability, Log, a } from "pepr";

import { AuthServiceSecretBuilder } from "./lib/authservice/secretBuilder";
import { K8sAPI } from "./lib/kubernetes-api";
import { V1Secret } from "@kubernetes/client-node";

export const AuthService = new Capability({
  name: "AuthService",
  description: "Simple example to configure AuthService",
  namespaces: [],
});

const { When } = AuthService;

async function updateAuthServiceSecret(addSecret?: V1Secret, deleteSecret?: V1Secret) {
  try {
    const k8sApi = new K8sAPI();
    const authserviceSecretBuilder = new AuthServiceSecretBuilder(k8sApi);
      const sha256Hash = await authserviceSecretBuilder.buildAuthserviceSecret(
        "pepr.dev/keycloak=oidcconfig", addSecret,  deleteSecret);
      await k8sApi.checksumDeployment("authservice", "authservice", sha256Hash);
  } catch (e) {
    Log.error(`error ${e}`);
  }
}

// In the event that any secrets are changed that are used by authservice, regenerate the authservice secret
// Created/Deleted/Updated.
When(a.Secret)
  .IsCreatedOrUpdated()
  .WithLabel("pepr.dev/keycloak", "oidcconfig")
  .Then(async request => {
    await updateAuthServiceSecret(request.Raw, undefined);
  });

When(a.Secret)
  .IsDeleted()
  .Then(async request => {
    // 0.10.0 bug.
    if (request.OldResource.metadata?.labels?.["pepr.dev/keycloak"] === "oidcconfig") {
      await updateAuthServiceSecret(undefined, request.OldResource);
    }
  });
