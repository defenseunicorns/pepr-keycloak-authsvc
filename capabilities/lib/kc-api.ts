import { KeycloakClient } from "../crds/keycloakclient-v1";
import { KeycloakRole } from "../crds/keycloakrole-v1";
import { KeycloakUser, User } from "../crds/keycloakuser-v1";
import { K8sAPI } from "./kubernetes-api";
import { fetch, fetchStatus } from "pepr";

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

  private async GetUserIdByUsername(
    realm: string,
    username: string,
  ): Promise<string | null> {
    await this.connect();
    const response = await fetch(
      `${this.keycloakBaseUrl}/admin/realms/${realm}/users?username=${username}`,
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
        throw new Error(`Failed to get User with username ${username}`);
      }
    }

    if ((response.data as KeycloakUser[]).length > 0) {
      return response.data[0].id;
    }

    return null;
  }

  async UpdateOrCreateClient(
    realmName: string,
    client: KeycloakClient,
  ): Promise<string> {
    if (!client.clientId) {
      throw new Error(`Invalid clientId. It must be provided.`);
    }

    await this.connect();

    const clientExists = await this.GetClientByClientId(
      realmName,
      client.clientId,
    );

    if (clientExists) {
      //todo: update docs to specifically state that its possible to override an existing client
      // secret exists, update it
      await this.UpdateClient(realmName, clientExists.id, client);
    } else {
      // Otherwise, create a new client
      await this.CreateClient(realmName, client);
    }

    return await this.GetClientByClientId(realmName, client.clientId).then(
      newClient => {
        if (newClient) {
          return newClient.secret;
        } else {
          throw new Error(
            `Failed to fetch the newly created client with clientId ${client.clientId}`,
          );
        }
      },
    );
  }

  private async CreateClient(realmName: string, client: KeycloakClient) {
    await this.connect();

    const response = await fetch(
      `${this.keycloakBaseUrl}/admin/realms/${realmName}/clients`,
      {
        method: "POST",
        body: JSON.stringify(client),
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      throw new Error(
        `Failed to create client with clientId ${client.clientId}`,
      );
    }
  }

  private async UpdateClient(
    realmName: string,
    clientId: string,
    client: KeycloakClient,
  ) {
    const response = await fetch(
      `${this.keycloakBaseUrl}/admin/realms/${realmName}/clients/${clientId}`,
      {
        method: "PUT",
        body: JSON.stringify(client),
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

  async UpdateOrCreateUser(realm: string, usersData: User) {
    await this.connect();

    const userId = await this.GetUserIdByUsername(realm, usersData.username);

    // if user exists update else create
    let response;
    if (userId) {
      response = await fetch(
        `${this.keycloakBaseUrl}/admin/realms/${realm}/users/${userId}`,
        {
          method: "PUT",
          body: JSON.stringify(usersData),
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
          },
        },
      );
    } else {
      response = await fetch(
        `${this.keycloakBaseUrl}/admin/realms/${realm}/users`,
        {
          method: "POST",
          body: JSON.stringify(usersData),
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
          },
        },
      );
    }

    if (!response.ok) {
      throw new Error(`Failed to create/update User(s), ${response.status}`);
    }

    // separate step for adding Realm and Client Roles to User
    await this.UserRealmRoles(realm, usersData);
    await this.UserClientRoles(realm, usersData);
  }

  private async UserRealmRoles(realm: string, usersData: User) {
    await this.connect();

    // Roles available in realm
    const realmRoles = await fetch(
      `${this.keycloakBaseUrl}/admin/realms/${realm}/roles`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      },
    );

    const userId = await this.GetUserIdByUsername(realm, usersData.username);

    // create array of keycloak realm roles to add to user
    const userRoles: KeycloakRole[] = usersData.realmRoles.flatMap(
      userRealmRole => {
        return (realmRoles.data as KeycloakRole[]).filter(
          obj => obj.name === userRealmRole,
        );
      },
    );

    const response = await fetch(
      `${this.keycloakBaseUrl}/admin/realms/${realm}/users/${userId}/role-mappings/realm`,
      {
        method: "POST",
        body: JSON.stringify(userRoles),
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      throw new Error(
        `Failed to Update Or Create User Realm Roles, ${response.status}`,
      );
    }
  }

  private async UserClientRoles(realm: string, usersData: User) {
    await this.connect();

    const userId = await this.GetUserIdByUsername(realm, usersData.username);

    // loop through clients in user Custom Resource
    for (const client in usersData.clientRoles) {
      const roles = usersData.clientRoles[client];

      const clientId = await this.GetClientByClientId(realm, client);

      // Roles available in Client
      const clientRoles = await fetch(
        `${this.keycloakBaseUrl}/admin/realms/${realm}/users/${userId}/role-mappings/clients/${clientId.id}/available`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
        },
      );

      // create keycloak client roles array for user
      const userClientRoles = (clientRoles.data as KeycloakRole[]).filter(
        role => roles.includes(role.name),
      );

      const response = await fetch(
        `${this.keycloakBaseUrl}/admin/realms/${realm}/users/${userId}/role-mappings/clients/${clientId.id}`,
        {
          method: "POST",
          body: JSON.stringify(userClientRoles),
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error(
          `Failed to Update Or Create User Client Roles, ${response.status}`,
        );
      }
    }
  }

  async DeleteUser(realm: string, usersData: User) {
    await this.connect();

    // Get user's id
    const userId = await this.GetUserIdByUsername(realm, usersData.username);

    // if user exists, delete
    if (userId) {
      const response = await fetch(
        `${this.keycloakBaseUrl}/admin/realms/${realm}/users/${userId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
        },
      );
      if (!response.ok && response.status !== fetchStatus.NOT_FOUND) {
        throw new Error(
          `Failed to delete User with Id ${userId}, ${response.status}`,
        );
      }
    }
  }
}
