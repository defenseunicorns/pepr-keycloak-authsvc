import test from "ava";
import util from "util";
import { exec } from "child_process";
import { fetch } from "pepr";

// run shell command asynchronously
const execAsync = util.promisify(exec);

// keycloak get request helper method
async function getRequest(url) {
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

test.serial("E2E Test: Create New Client from Generic Secret", async t => {
  // Define the kubcetl command to label secret for pepr operator
  const labelSecret =
    'kubectl label secret client1 -n keycloak "pepr.dev/keycloak=createclient"';

  try {
    const { stdout: labelout, stderr: labelerr } = await execAsync(labelSecret);

    t.truthy(labelout, "Kubectl command to label new secret produced output");
    t.falsy(
      labelerr,
      "kubectl command to label new secret produced no stderr output",
    );

    // Get the newly created secret that should have been created by pepr-keycloak-authsvc and keycloak
    const getNewSecret = "kubectl get secret client1 -n keycloak";
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

    await getRequest(`http://localhost:8080/auth/admin/realms/`)
      .then(response => {
        t.true(response.ok, "Request to get all realms should be successful");
        return response.data as object[];
      })
      .then(data => {
        t.true(data.length === 2);
      });
  } catch (e) {
    t.fail("Failed to run kubectl command without errors: " + e.message);
  }
});

// todo: Currently this test fails because the podinfo client is not deleted from the master realm. failing because of hostname differences
test.serial("E2E Test: Delete a client when secret is deleted", async t => {
  // Define the kubectl command to delete secret
  const deleteSecret = "kubectl delete secret client1 -n keycloak";

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
      const getNewSecret = "kubectl get secret client1 -n keycloak";
      await execAsync(getNewSecret);

      t.fail("Secret should not exist anymore but it does.");
    } catch (err) {
      t.pass("Secret does not exist anymore as expected.");
    }

    interface responseObj {
      clientId: string;
    }

    await getRequest("http://localhost:8080/auth/admin/realms/master/clients")
      .then(response => {
        return response.data as responseObj[];
      })
      .then(data => {
        t.falsy(
          data.find(obj => obj.clientId === "podinfo"),
          "There should no longer be a podinfo client in the master realm after having deleted the keycloak secret.",
        );
      });
  } catch (e) {
    t.fail("Failed to run kubectl command without errors: " + e.message);
  }
});

// todo: Currently this test fails because the `e2e-cm-test` realm is not created in keycloak. failing because of hostname differences
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

    interface responseObj {
      realm: string;
    }

    await getRequest("http://localhost:8080/auth/admin/realms")
      .then(response => {
        return response.data as responseObj[];
      })
      .then(data => {
        t.truthy(
          data.find(obj => obj.realm === "e2e-cm-test"),
          "There should be a new realm called `e2e-cm-test` in keycloak.",
        );
      });
  } catch (e) {
    t.fail("Failed to run kubectl command without errors: " + e.message);
  }
});
