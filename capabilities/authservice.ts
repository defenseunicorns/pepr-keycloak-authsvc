import { Capability, Log, a } from "pepr";

import { AuthServiceSecretBuilder } from "./lib/authservice/secretBuilder";
import { K8sAPI } from "./lib/kubernetes-api";

export const AuthService = new Capability({
  name: "AuthService",
  description: "Simple example to configure AuthService",
  namespaces: [],
});

interface OidcClientK8sSecretData {
  realm: string,
  id: string,
  name: string,
  domain: string,
  secret: string,
  redirect_uri: string
}

// TODO: add a workflow for deleting a client

const { When } = AuthService;

// temporary until we can have a post persisted builder
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
// Update the authservice secret (triggers from previous capability)
When(a.Secret)
  .IsCreatedOrUpdated()
  .WithLabel("done", "createclient")
  .Then(async request => {
    const newSecret: OidcClientK8sSecretData = {
      realm: request.Raw.data.realm,
      id: request.Raw.data.id,
      name: request.Raw.data.name,
      domain: request.Raw.data.domain,
      secret: request.Raw.data.clientSecret,
      redirect_uri: request.Raw.data.redirectUri
    };

    const k8sApi = new K8sAPI();
    await k8sApi.createOrUpdateSecret(
      `mission-${request.Raw.data.name}`,
      "authservice",
      newSecret as unknown as Record<string, string>
    );

    try {
      const k8sApi = new K8sAPI();
      const authserviceSecretBuilder = new AuthServiceSecretBuilder(k8sApi);
      // XXX: BDW: TODO: remove once we have a post persisted builder
      setImmediate(async () => {
        // waiting 5 seconds for the previous objects to be created.
        await delay(5000);
        await authserviceSecretBuilder.buildAuthserviceSecret();
        await k8sApi.restartDeployment("authservice", "authservice");
      });
    } catch (e) {
      Log.error(`error ${e}`);
    }
  });
 
