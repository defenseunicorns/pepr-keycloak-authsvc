import { Capability, a } from "pepr";

import { AuthServiceSecretBuilder } from "./lib/authservice/secretBuilder";
import { K8sAPI } from "./lib/kubernetes-api";

export const AuthService = new Capability({
  name: "AuthService",
  description: "Configures AuthService secret and restarts it to load it",
  namespaces: [],
});

const { When } = AuthService;

const k8sApi = new K8sAPI();
const authserviceSecretBuilder = new AuthServiceSecretBuilder(k8sApi);

When(a.Secret)
  .IsCreatedOrUpdated()
  .WithLabel("pepr.dev/keycloak", "oidcconfig")
  .Mutate(async request => {
    await authserviceSecretBuilder.update({
      secret: request.Raw,
      isDelete: false,
    });
  });

When(a.Secret)
  .IsDeleted()
  .WithLabel("pepr.dev/keycloak", "oidcconfig")
  .Mutate(async request => {
    await authserviceSecretBuilder.update({
      secret: request.OldResource,
      isDelete: true,
    });
  });
