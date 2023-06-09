import { K8sAPI } from "./kubernetes-api";
import { fetch, fetchStatus } from "pepr";

export interface Client {
  clientId: string;
  clientName: string;
  clientSecret: string;
  redirectUri: string[];
}

export interface OpenIdData {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  end_session_endpoint: string;
  issuer: string;
}

export class KcAPI {
  keycloakBaseUrl: string;
  token: string;
  k8sApi: K8sAPI;

  constructor(keycloakBaseUrl: string) {
    this.keycloakBaseUrl = keycloakBaseUrl;
  }

  private async connect() {
    if (this.token) {
      return;
    }

    // XXX: BDW: hard coded, but this is where it's stored in bigbang.
    // TODO: extract this to config
    const namespace = "keycloak";
    const name = "keycloak-env";

    this.k8sApi = new K8sAPI();
    const creds = await this.k8sApi.getSecretValues(name, namespace, [
      "KEYCLOAK_ADMIN_PASSWORD",
      "KEYCLOAK_ADMIN",
    ]);

    const username = creds["KEYCLOAK_ADMIN"];
    const password = creds["KEYCLOAK_ADMIN_PASSWORD"];

    interface accessToken {
      access_token: string;
    }

    const response = await fetch<accessToken>(
      `${this.keycloakBaseUrl}/realms/master/protocol/openid-connect/token`,
      {
        method: "POST",
        body: `username=${username}&password=${password}&grant_type=password&client_id=admin-cli`,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to authenticate as admin`);
    }

    this.token = response.data.access_token;
  }

  async GetOrCreateRealm(realmName: string): Promise<boolean> {
    await this.connect();

    const response = await fetch(
      `${this.keycloakBaseUrl}/admin/realms/${realmName}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      }
    );

    if (response.ok) {
      return true;
    } else if (response.status === fetchStatus.NOT_FOUND) {
      const realm = {
        id: realmName,
        realm: realmName,
        enabled: true,
      };

      const createResponse = await fetch(
        `${this.keycloakBaseUrl}/admin/realms`,
        {
          method: "POST",
          body: JSON.stringify(realm),
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!createResponse.ok) {
        throw new Error(`Failed to create realm ${realmName}`);
      }

      return true;
    } else {
      throw new Error(`Failed to get realm ${realmName}`);
    }
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

    const realmObject = JSON.parse(realm);
    const response = await fetch(`${this.keycloakBaseUrl}/admin/realms`, {
      method: "POST",
      body: JSON.stringify(realmObject),
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to import realm ${realmObject.realm}`);
    }
  }

  private async GetClientSecret(
    realmName: string,
    clientId: string
  ): Promise<string> {
    await this.connect();
    interface clientData {
      clientId: string;
      secret: string;
    }
    await this.connect();
    const response = await fetch<clientData[]>(
      `${this.keycloakBaseUrl}/admin/realms/${realmName}/clients?clientId=${clientId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      }
    );

    if (!response.ok) {
      if (response.status === fetchStatus.NOT_FOUND) {
        return undefined;
      } else {
        throw new Error(`Failed to get client with clientId ${clientId}`);
      }
    }

    const clients = response.data;

    if (clients.length > 1) {
      throw new Error(`Found more than one client with clientId ${clientId}`);
    }

    if (clients.length === 1) {
      return clients[0].secret;
    }
    return undefined;
  }

  async GetOrCreateClient(
    realmName: string,
    clientName: string,
    clientId: string,
    redirectUri: string
  ): Promise<string> {
    await this.connect();

    const secret = await this.GetClientSecret(realmName, clientId);
    if (secret) {
      return secret;
    }

    // Otherwise, create a new client
    await this.CreateClient(clientId, clientName, redirectUri, realmName);

    //
    return await this.GetClientSecret(realmName, clientId);
  }

  private async CreateClient(
    clientId: string,
    clientName: string,
    redirectUri: string,
    realmName: string
  ) {
    const newClient = {
      clientId: clientId,
      name: clientName,
      redirectUris: [redirectUri],
    };

    const response = await fetch(
      `${this.keycloakBaseUrl}/admin/realms/${realmName}/clients`,
      {
        method: "POST",
        body: JSON.stringify(newClient),
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to create client with clientId ${clientId}`);
    }
  }

  async DeleteClient(clientId: string, realmName: string) {
    const response = await fetch(
      `${this.keycloakBaseUrl}/admin/realms/${realmName}/clients/${clientId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      }
    );
    if (!response.ok) {
      throw new Error(`Failed to delete client with clientId ${clientId}`);
    }
  }
}
