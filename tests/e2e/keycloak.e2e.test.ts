import test, { ExecutionContext } from "ava";
import util from "util";
import { exec } from "child_process";
import { fetch } from "pepr";
import { RequestInfo } from "node-fetch";
import { KeycloakRole } from "../../capabilities/crds/keycloakrole-v1";

// run shell command asynchronously
const execAsync = util.promisify(exec);

test.serial("E2E Test: Create New Client from Custom Resource", async t => {
  // Define the kubcetl command to label secret for pepr operator
  const applyCR =
    "kubectl apply -f tests/e2e/keycloak-client-cr.yaml -n keycloak ";

  try {
    const { stdout: applyout, stderr: applyerr } = await execAsync(applyCR);

    t.truthy(applyout, "Kubectl command to label new secret produced output");
    t.falsy(
      applyerr,
      "kubectl command to label new secret produced no stderr output",
    );

    // Get the newly created secret that should have been created by pepr-keycloak-authsvc and keycloak
    const getNewSecret = "kubectl get keycloakclient/client2 -n keycloak";
    const { stdout: newSecretOut, stderr: newSecretErr } =
      await execAsync(getNewSecret);

    t.truthy(newSecretOut, "Kubectl command to get new secret produced output");
    t.falsy(
      newSecretErr,
      "kubectl command to get new secret produced no stderr output",
    );
  } catch (e) {
    t.fail("Failed to run kubectl command without errors: " + e.message);
  }
});

test.serial("E2E Test: Create a realm from generic secret", async t => {
  // Define the kubcetl command to label secret for pepr operator
  const labelSecret =
    "kubectl label secret realm1 -n keycloak  pepr.dev/keycloak=createrealm";

  try {
    const { stdout: labelout, stderr: labelerr } = await execAsync(labelSecret);

    t.truthy(labelout, "Kubectl command to label new secret produced output");
    t.falsy(
      labelerr,
      "kubectl command to label new secret produced no stderr output",
    );

    await verifyEntity(
      "http://localhost:8080/auth/admin/realms",
      (obj: { realm: string }) => obj.realm === "e2e-secret-test",
      (realminfo: object) => realminfo,
      t,
    );
  } catch (e) {
    t.fail("Failed to run kubectl command without errors: " + e.message);
  }
});

test.serial("E2E Test: Delete a client when secret is deleted", async t => {
  // Define the kubectl command to delete secret
  const deleteSecret = "kubectl delete keycloakclient/client2 -n keycloak";

  try {
    const { stdout: deleteOut, stderr: deleteErr } =
      await execAsync(deleteSecret);

    t.truthy(deleteOut, "Kubectl command to delete secret produced output");
    t.falsy(
      deleteErr,
      "kubectl command to delete secret produced no stderr output",
    );

    // Attempt to get the newly deleted secret
    try {
      const getNewSecret = "kubectl get keycloakclient/client2 -n keycloak";
      await execAsync(getNewSecret);

      t.fail("Secret should not exist anymore but it does.");
    } catch (err) {
      t.pass("Secret does not exist anymore as expected.");
    }

    await verifyEntity(
      "http://localhost:8080/auth/admin/realms/master/clients",
      (obj: { clientId: string }) => obj.clientId === "podinfo",
      (podinfo: object) => !podinfo,
      t,
    );
  } catch (e) {
    t.fail("Failed to run kubectl command without errors: " + e.message);
  }
});

test.serial("E2E Test: Create realm from configmap", async t => {
  // Define the kubcetl command to label configmap for pepr operator
  const labelConfigMap =
    'kubectl label cm realm-configmap -n keycloak "pepr.dev/keycloak=createrealm"';

  try {
    const { stdout: labelout, stderr: labelerr } =
      await execAsync(labelConfigMap);

    t.truthy(
      labelout,
      "Kubectl command to label new configmap produced output",
    );
    t.falsy(
      labelerr,
      "kubectl command to label new configmap produced no stderr output",
    );

    await verifyEntity(
      "http://localhost:8080/auth/admin/realms",
      (obj: { realm: string }) => obj.realm === "e2e-cm-test",
      (realminfo: object) => realminfo,
      t,
    );
  } catch (e) {
    t.fail("Failed to run kubectl command without errors: " + e.message);
  }
});

test.serial("E2E Test: Update Client with Custom Resource", async t => {
  await execAsync(
    "kubectl apply -f tests/e2e/keycloak-client-cr.yaml -n keycloak ",
  );

  const existingClient = await getRequest(
    "http://localhost:8080/auth/admin/realms/master/clients?clientId=podinfo",
  );

  t.is(existingClient.data[0].description, "My Keycloak client");

  // Define the kubcetl command to label secret for pepr operator
  const updatedCR =
    "kubectl apply -f tests/e2e/updated-client-cr.yaml -n keycloak ";

  try {
    const { stdout: applyout, stderr: applyerr } = await execAsync(updatedCR);

    t.truthy(applyout, "Kubectl command to label new secret produced output");
    t.falsy(
      applyerr,
      "kubectl command to label new secret produced no stderr output",
    );

    const clientId = await getRequest(
      "http://localhost:8080/auth/admin/realms/master/clients?clientId=podinfo",
    );

    t.is(clientId.data[0].description, "Updated Description");
    t.is(existingClient.data[0].id, clientId.data[0].id);
  } catch (e) {
    t.fail("Failed to run kubectl command without errors: " + e.message);
  }
});

test.serial("E2E Test: Create User with Custom Resource", async t => {
  // kubectl create user crd
  const newUser = "kubectl apply -f tests/e2e/keycloak-user-cr.yaml";

  try {
    const { stdout: newUserout, stderr: newUsererr } = await execAsync(newUser);

    t.truthy(newUserout, "Kubectl command to label new secret produced output");
    t.falsy(
      newUsererr,
      "kubectl command to label new secret produced no stderr output",
    );
    await new Promise(resolve => setTimeout(resolve, 5000));
    const getUser = await getRequest(
      "http://localhost:8080/auth/admin/realms/master/users?username=pepr-user",
    );

    t.is(getUser.data[0].firstName, "Pepr");

    //Validate that the Realm Roles were created
    const userRealmRoles = await getRequest(
      "http://localhost:8080/auth/admin/realms/master/users/" +
        getUser.data[0].id +
        "/role-mappings/realm",
    );

    t.truthy(
      (userRealmRoles.data as KeycloakRole[]).length === 3,
      "There was not 3 roles associated to the user",
    );

    const defaultRole = (userRealmRoles.data as KeycloakRole[]).find(
      obj => obj.name === "default-roles-master",
    );
    t.truthy(defaultRole, "Default Realm Role is not present for user");
    const offlineRole = (userRealmRoles.data as KeycloakRole[]).find(
      obj => obj.name === "offline_access",
    );
    t.truthy(offlineRole, "Offline Access Realm Role is not present for user");
    const CreateRealmRole = (userRealmRoles.data as KeycloakRole[]).find(
      obj => obj.name === "create-realm",
    );
    t.truthy(
      CreateRealmRole,
      "Create Realm Realm Role is not present for user",
    );

    //Validate that the Client Roles were created
    const accountClientId = await getRequest(
      "http://localhost:8080/auth/admin/realms/master/clients?clientId=account",
    );

    const userAccountClientRoles = await getRequest(
      "http://localhost:8080/auth/admin/realms/master/users/" +
        getUser.data[0].id +
        "/role-mappings/clients/" +
        accountClientId.data[0].id,
    );

    t.truthy(
      (userAccountClientRoles.data as KeycloakRole[]).length === 2,
      "There was not 2 roles associated to the user",
    );

    const manageAccountRole = (
      userAccountClientRoles.data as KeycloakRole[]
    ).find(obj => obj.name === "manage-account");
    t.truthy(
      manageAccountRole,
      "Manage Account Client Role is not present for user",
    );
    const viewApplicationsRole = (
      userAccountClientRoles.data as KeycloakRole[]
    ).find(obj => obj.name === "view-applications");
    t.truthy(
      viewApplicationsRole,
      "View Applications Client Role is not present for user",
    );

    const brokerClientId = await getRequest(
      "http://localhost:8080/auth/admin/realms/master/clients?clientId=broker",
    );

    const userBrokerClientRoles = await getRequest(
      "http://localhost:8080/auth/admin/realms/master/users/" +
        getUser.data[0].id +
        "/role-mappings/clients/" +
        brokerClientId.data[0].id,
    );

    t.truthy(
      (userBrokerClientRoles.data as KeycloakRole[]).length === 1,
      "There was not 1 roles associated to the user",
    );

    const readTokenRole = (userBrokerClientRoles.data as KeycloakRole[]).find(
      obj => obj.name === "read-token",
    );
    t.truthy(readTokenRole, "Read Token Client Role is not present for user");
  } catch (e) {
    t.fail("Failed to run kubectl command without errors: " + e.message);
  }
});

/****************************
  Testing Helper Functions
*****************************/

// keycloak get request helper method
async function getRequest(url: URL | RequestInfo) {
  interface accessToken {
    access_token: string;
  }

  const response = await fetch<accessToken>(
    `http://localhost:8080/auth/realms/master/protocol/openid-connect/token`,
    {
      method: "POST",
      body: `username=admin&password=password&grant_type=password&client_id=admin-cli`,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    },
  );
  return await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${response.data.access_token}`,
    },
  });
}

/* 
    Make requests and verify their response for conditions based on e2e tests
    necessary for avoiding race conditions in checking pepr controller and keycloak
    changes have been made successfully
*/
async function verifyEntity(
  url: string,
  dataFind,
  condition,
  t: ExecutionContext<unknown>,
) {
  interface responseObj {
    realm: string;
    clientId: string;
  }

  let retries = 0;
  const maxRetries = 3;
  const timeout = 3000;

  while (retries < maxRetries) {
    const response = await getRequest(url);
    const data = response.data as responseObj[];
    const entity = data.find(dataFind);

    if (condition(entity)) {
      t.pass();
      break;
    } else {
      retries++;
      if (retries === maxRetries) {
        t.fail();
        break;
      } else {
        await new Promise(resolve => setTimeout(resolve, timeout));
      }
    }
  }
}
