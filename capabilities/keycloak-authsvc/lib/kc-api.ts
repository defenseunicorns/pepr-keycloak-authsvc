import KeycloakAdminClient from "@keycloak/keycloak-admin-client";
import { K8sAPI } from "./kubernetes-api";
import { fetch } from "pepr";
import KcAdminClient from "@keycloak/keycloak-admin-client";

export interface OpenIdData {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  end_session_endpoint: string;
  issuer: string;
}

export class KcAPI {
  keycloakBaseUrl: string;
  init: boolean;
  client: KeycloakAdminClient;
  password: string;
  username: string;
  k8sApi: K8sAPI;

  constructor(keycloakBaseUrl: string) {
    this.keycloakBaseUrl = keycloakBaseUrl;
    this.init = false;
  }

  private async connect() {
    if (this.init == true) {
      return;
    }

    // XXX: BDW: hard coded.
    const namespace = "keycloak";
    const name = "keycloak-env";

    this.k8sApi = new K8sAPI();
    this.password = await this.k8sApi.getSecretValue(
      namespace,
      name,
      "KEYCLOAK_ADMIN_PASSWORD"
    );

    this.username = await this.k8sApi.getSecretValue(
      namespace,
      name,
      "KEYCLOAK_ADMIN"
    );

    // XXX: BDW: todo: test with multiple types of keycloak deployments.
    this.client = new KcAdminClient({ baseUrl: this.keycloakBaseUrl });
    await this.client.auth({
      username: this.username,
      password: this.password,
      grantType: "password",
      clientId: "admin-cli",
    });
    this.init = true;
  }

  async GetOrCreateRealm(realmName: string): Promise<boolean> {
    await this.connect();

    try {
      const isFound = await this.client.realms.findOne({
        realm: realmName,
      });
      if (isFound) {
        return true;
      }
    } catch (error) {
      if (error.response && error.response.status === 404) {
        // realm not found, will create it
      } else {
        throw error;
      }
    }

    // use the same realmName and realmId
    const realm = await this.client.realms.create({
      id: realmName,
      realm: realmName,
      enabled: true,
    });

    if (realm.realmName != realmName) {
      throw new Error(`realm ${realmName} was not created as expected`);
    }
    return true;
  }

  async GetOrCreateClient(
    realmName: string,
    clientName: string,
    clientId: string,
    redirectUri: string
  ): Promise<string> {
    await this.connect();

    // Find client by clientId
    const clients = await this.client.clients.find({
      realm: realmName,
      clientId: clientId,
    });

    if (clients.length > 1) {
      throw new Error(`Found more than one client with clientId ${clientId}`);
    }

    if (clients.length === 1) {
      return clients[0].secret;
    }

    // Otherwise, create a new client
    const newClient = {
      clientId: clientId,
      name: clientName,
      realm: realmName,
      redirectUris: [redirectUri],
      // Add other client settings here, such as "protocol", "publicClient", etc.
    };

    await this.client.clients.create(newClient);

    // Find and return the newly created client
    const newClientsForSecret = await this.client.clients.find(newClient);
    return newClientsForSecret[0].secret;
  }

  async GetOpenIdData(realmName: string): Promise<OpenIdData> {
    const response = await fetch<OpenIdData>(
      `${this.keycloakBaseUrl}/realms/${realmName}/.well-known/openid-configuration`
    );
    if (!response.ok) {
      throw new Error(
        `failed to get openid-configuration for realm ${realmName}`
      );
    }
    return response.data;
  }

  async ImportRealm(realm: string) {
    await this.connect();
    // TODO: can I convert to realm represetnation or let the API call fail?
    await this.client.realms.create(JSON.parse(realm));
  }
}
