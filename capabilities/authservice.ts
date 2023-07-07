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

// this will continue running
async function updateAuthServiceSecret(
  addSecret?: V1Secret,
  deleteSecret?: V1Secret
) {
  try {
    const k8sApi = new K8sAPI();
    const authserviceSecretBuilder = new AuthServiceSecretBuilder(k8sApi);
    const sha256Hash = await authserviceSecretBuilder.updateAuthServiceSecret(
      "pepr.dev/keycloak=oidcconfig",
      addSecret,
      deleteSecret
    );
    await k8sApi.checksumDeployment("authservice", "authservice", sha256Hash);
  } catch (e) {
    Log.error(`error ${e}`, "updateAuthServiceSecret");
  }
}

async function addSecret(secret: V1Secret) {
  await updateAuthServiceSecret(secret, undefined);
}
async function deleteSecret(secret: V1Secret) {
  await updateAuthServiceSecret(undefined, secret);
}

// these will run in the backgeound
When(a.Secret)
  .IsCreatedOrUpdated()
  .WithLabel("pepr.dev/keycloak", "oidcconfig")
  .Then(request => {
    addSecret(request.Raw);
  });

When(a.Secret)
  .IsDeleted()
  .WithLabel("pepr.dev/keycloak", "oidcconfig")
  .Then(request => {
    deleteSecret(request.OldResource);
  });
