import test, { ExecutionContext } from "ava";
import util from "util";
import { exec } from "child_process";
import { fetch } from "pepr";
import { RequestInfo } from "node-fetch";

// run shell command asynchronously
const execAsync = util.promisify(exec);

test.serial("E2E Test: Create New Client from Generic Kind", async t => {
  // Define the kubcetl command to label secret for pepr operator
  const labelSecret =
    'kubectl label unicorn client2 -n default "pepr.dev/keycloak=createclient"';

  try {
    const { stdout: labelout, stderr: labelerr } = await execAsync(labelSecret);

    t.truthy(
      labelout,
      "Kubectl command to label new unicorn kind produced output",
    );
    t.falsy(
      labelerr,
      "kubectl command to label new unicorn kind produced no stderr output",
    );

    // Get the newly created secret that should have been created by pepr-keycloak-authsvc and keycloak
    const getNewSecret = "kubectl get secret podinfo-client -n default";
    const { stdout: newSecretOut, stderr: newSecretErr } =
      await execAsync(getNewSecret);

    t.truthy(
      newSecretOut,
      "Kubectl command to get new unicorn kind produced output",
    );
    t.falsy(
      newSecretErr,
      "kubectl command to get new unicorn kind produced no stderr output",
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
  const deleteSecret = "kubectl delete unicorn client2 -n default";

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
      const getNewSecret = "kubectl get secret podinfo-client -n default";
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
