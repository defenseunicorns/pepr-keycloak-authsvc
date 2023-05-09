import { generatePassword } from "./util"
import { K8sAPI } from "./kubernetes-api"

import KcAdminClient from "@keycloak/keycloak-admin-client";

export class KCAPI {
  keycloakBaseUrl: string
  init: boolean
  client: KcAdminClient
  password: string
  k8sApi: K8sAPI

  constructor(keycloakBaseUrl: string) {
    this.keycloakBaseUrl = keycloakBaseUrl
    this.init = false
  }

  private async connect() {
    if (this.init == true) {
      return
    }

    // stuff that should come from the configmap
    const secretName = "keycloak";
    const keycloakNameSpace = "keycloak";

    this.k8sApi = new K8sAPI();
    this.password = await this.k8sApi.getSecretValue(
      "keycloak",
      "keycloak",
      "admin-password"
    )

    // XXX: BDW: todo: test with multiple types of keycloak deployments.
    this.client = await new KcAdminClient({ baseUrl: this.keycloakBaseUrl });
    await this.client.auth({
      username: 'user',
      password: this.password,
      grantType: 'password',
      clientId: 'admin-cli'
    })
    this.init = true
  }


  async GetOrCreateRealm(realmName: string): Promise<boolean> {
    await this.connect()

    var realmFound = false
    try {
      const targetRealm = await this.client.realms.findOne({ realm: realmName });
      return true
    } catch (error) {
      if (error.response && error.response.status === 404) {
        // realm not found, will create it
      }else {
        throw new Error(error)
      }
    }

    // XXX: BDW do we need the realmid? test to see if it's optional
    const realm = await this.client.realms.create({
      id: realmName + '1',
      realm: realmName,
    });

    if (realm.realmName != realmName) {
      throw new Error(`realm ${realmName} was not created as expected`)
    }
    return true
  }


  async GetOrCreateClient(realmName: string, clientName: string, clientId: string, redirectUri: string): Promise<string> {
    await this.connect()
 
    // Find client by clientId
    const clients = await this.client.clients.find({ realm: realmName, clientId: clientId });
  
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
      redirectUris: [redirectUri]
      // Add other client settings here, such as "protocol", "publicClient", "redirectUris", etc.
    };
  
    await this.client.clients.create(newClient);
  
    // Find and return the newly created client
    const newClientsForSecret = await this.client.clients.find(newClient);
    return newClientsForSecret[0].secret;
  }


  async GetOrCreateUser(userConfig): Promise<string> {
    await this.connect()

    // Find user by username
    const users = await this.client.users.find(userConfig);

    // If user exists, return it
    if (users.length > 1) {
      throw new Error(`Found more than one user with username ${userConfig.username}`);
    }
  
    var id: string

    if (users.length === 1) {
      id = users[0].id
    } else {
      const createdUserId = await this.client.users.create(userConfig);
      id = createdUserId.id
    }
  
    // Set a temporary password, make sure the password generator is valid.
    const tempPassword = generatePassword(12)
    await this.client.users.resetPassword({
      id: id,
      realm: userConfig.realmName,
      credential: {
        type: 'password',
        value: tempPassword,
        temporary: true,
      },
    });
  
    // Find and return the newly created user with the temporary password
    const newUser = await this.client.users.find(userConfig);
  
    if (newUser.length != 1) {
      throw new Error(`Found more than one user with username ${userConfig.username}`);
    }
    return tempPassword;
  }
  
}