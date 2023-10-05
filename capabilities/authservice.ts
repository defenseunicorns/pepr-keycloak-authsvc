import { Capability, a } from "pepr";

import { AuthServiceSecretBuilder } from "./lib/authservice/secretBuilder";

export const AuthService = new Capability({
  name: "AuthService",
  description: "Configures AuthService secret and restarts it to load it",
  namespaces: [],
});

const { When } = AuthService;

const authserviceSecretBuilder = new AuthServiceSecretBuilder();

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
