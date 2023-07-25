import { Capability, Log, a } from "pepr";

import { AuthServiceSecretBuilder } from "./lib/authservice/secretBuilder";
import { K8sAPI } from "./lib/kubernetes-api";

export const AuthService = new Capability({
  name: "AuthService",
  description: "Simple example to configure AuthService",
  namespaces: [],
});

const { When } = AuthService;

const k8sApi = new K8sAPI();
const authserviceSecretBuilder = new AuthServiceSecretBuilder(k8sApi);

// these will run in the backgeound
When(a.Secret)
  .IsCreatedOrUpdated()
  .WithLabel("pepr.dev/keycloak", "oidcconfig")
  .Then(async request => {
    await authserviceSecretBuilder.update({
      secret: request.Raw,
      isDelete: false,
    });
  });

When(a.Secret)
  .IsDeleted()
  .WithLabel("pepr.dev/keycloak", "oidcconfig")
  .Then(async request => {
    await authserviceSecretBuilder.update({
      secret: request.OldResource,
      isDelete: true,
    });
  });
