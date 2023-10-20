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

interface clientData {
  id: string;
  clientId: string;
  secret: string;
}

export class KcAPI {
  keycloakBaseUrl: string;
  token: string;

  constructor(keycloakBaseUrl: string) {
    this.keycloakBaseUrl = keycloakBaseUrl;
  }

  private async connect() {
    if (this.token) {
      return;
    }

    const namespace = "keycloak";
    const name = "keycloak-env";
    const responseSecret = await K8sAPI.getSecret(name, namespace);
    const username = responseSecret.getStringData("KEYCLOAK_ADMIN");
    const password = responseSecret.getStringData("KEYCLOAK_ADMIN_PASSWORD");

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
      },
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
      },
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
        },
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
      `${this.keycloakBaseUrl}/realms/${realmName}/.well-known/openid-configuration`,
    );
    if (!response.ok) {
      throw new Error(
        `failed to get openid-configuration for realm ${realmName}`,
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

  private async GetClientByClientId(
    realmName: string,
    clientId: string,
  ): Promise<clientData | null> {
    await this.connect();
    const response = await fetch<clientData[]>(
      `${this.keycloakBaseUrl}/admin/realms/${realmName}/clients?clientId=${clientId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      },
    );

    if (!response.ok) {
      if (response.status === fetchStatus.NOT_FOUND) {
        return null;
      } else {
        throw new Error(`Failed to get client with clientId ${clientId}`);
      }
    }

    const clients = response.data;

    if (clients.length > 1) {
      throw new Error(`Found more than one client with clientId ${clientId}`);
    }

    if (clients.length === 1) {
      return clients[0];
    }

    return null;
  }

  async GetOrCreateClient(
    realmName: string,
    clientName: string,
    clientId: string,
    redirectUri: string,
  ): Promise<string> {
    await this.connect();

    const client = await this.GetClientByClientId(realmName, clientId);
    if (client) {
      return client.secret;
    }

    // Otherwise, create a new client
    await this.CreateClient(clientId, clientName, redirectUri, realmName);

    return await this.GetClientByClientId(realmName, clientId).then(client => {
      if (client) {
        return client.secret;
      } else {
        throw new Error(
          `Failed to fetch newly created client with clientId ${clientId}`,
        );
      }
    });
  }

  private async CreateClient(
    clientId: string,
    clientName: string,
    redirectUri: string,
    realmName: string,
  ) {
    await this.connect();

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
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to create client with clientId ${clientId}`);
    }
  }

  async DeleteClient(clientId: string, realmName: string) {
    await this.connect();
    const client = await this.GetClientByClientId(realmName, clientId);

    if (client) {
      const response = await fetch(
        `${this.keycloakBaseUrl}/admin/realms/${realmName}/clients/${client.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
        },
      );
      if (!response.ok && response.status !== fetchStatus.NOT_FOUND) {
        throw new Error(
          `Failed to delete client with clientId ${clientId}, ${response.status}`,
        );
      }
    }
  }
}
