import anyTest, { TestFn } from "ava";

import { K8sAPI } from "./kubernetes-api";
import { kind } from "pepr";
import { CustomSecret } from "./authservice/customSecret";

// Global Test Variables
const namespace = "keycloak";
const name = "keycloak-env";
const labelSelector = "helm.sh/chart=keycloak-18.4.3-bb.2";
const adminUser = "admin";
const adminPass = "sup3r-secret-p@ssword";

const test = anyTest as TestFn<{
  testSecret: kind.Secret;
}>;

test.beforeEach(async () => {
  // Make sure a newly created secret isn't present when starting new test
  try {
    await K8sAPI.deleteSecret("secret-test-value", namespace);
  } catch (e) {
    // ignore when the secret doesn't exist
  }
});

/*
    Kubernetes-api getSecret Function tests
*/
test.serial(
  "Test getSecret functionality for successfully retrieving secret",
  async t => {
    const getSecretResponse = await K8sAPI.getSecret(name, namespace);

    t.truthy(getSecretResponse.getData, "Response should not be null");

    t.is(
      getSecretResponse.getData("KEYCLOAK_ADMIN"),
      adminUser,
      "Response should contain data field called KEYCLOAK_ADMIN with the value `admin`",
    );
    t.is(
      getSecretResponse.getData("KEYCLOAK_ADMIN_PASSWORD"),
      adminPass,
      "Response should contain data field called KEYCLOAK_ADMIN_PASSWORD with the value `sup3r-secret-p@ssword`",
    );


  },
);

test.serial("Test getSecret functionality no existing secret", async t => {
  try {
    await K8sAPI.getSecret(name, null);
    // Expect the request to fail
    t.fail("Expected promise to be rejected");
  } catch (e) {
    t.true(e instanceof Object, "The rejected value should be an object");
  }
});

test.serial(
  "Test getSecret functionality for retrieving secret with null values",
  async t => {
    const emptySecret = new CustomSecret({});
    const nullName = (await K8sAPI.getSecret(null, namespace)).getSecret;
    t.is(emptySecret.getSecret, nullName);

    const nullParams = (await K8sAPI.getSecret(null, null)).getSecret;
    t.is(emptySecret.getSecret, nullParams);
  },
);

/*
    Kubernetes-api getSecretsByLabelSelector Function tests
*/
test.serial(
  "Test getSecretsByLabelSelector functionality for successfully retrieving secrets",
  async t => {
    const getSecretsByLabelSelectorResponse =
      await K8sAPI.getSecretsByLabelSelector(labelSelector);

    t.truthy(
      getSecretsByLabelSelectorResponse,
      "Assert this response is not null",
    );
    t.true(
      getSecretsByLabelSelectorResponse.length > 0,
      "Assert there is at least 1 element in secret list",
    );

    // Get specific keycloak secret and check its data
    const envSecret = getSecretsByLabelSelectorResponse.find(
      secret => secret.metadata.name === name,
    );
    t.is(
      envSecret.getData("KEYCLOAK_ADMIN"),
      adminUser,
      "Response should contain data field called KEYCLOAK_ADMIN with the value `YWRtaW4=`",
    );
    t.is(
      envSecret.getData("KEYCLOAK_ADMIN_PASSWORD"),
      adminPass,
      "Response should contain data field called KEYCLOAK_ADMIN_PASSWORD with the value `c3VwM3Itc2VjcmV0LXBAc3N3b3Jk`",
    );
  },
);

test.serial(
  "Test getSecretsByLabelSelector functionality for no secrets matching labelSelector",
  async t => {
    const getSecretsByLabelSelectorResponse =
      await K8sAPI.getSecretsByLabelSelector("FAKE_SELECTOR_LABEL");

    t.truthy(
      getSecretsByLabelSelectorResponse,
      "Response should not be null despite having 0 elements",
    );
    t.is(
      getSecretsByLabelSelectorResponse.length,
      0,
      "Response should contain 0 elements in list of Secrets that matched the labelSelector",
    );
  },
);

test.serial(
  "Test getSecretsByLabelSelector functionality for when labelSelector is null",
  async t => {
    // Null value should result in TypeError response
    await t.throwsAsync(K8sAPI.getSecretsByLabelSelector(null), {
      instanceOf: TypeError,
      message: "Cannot read properties of null (reading 'split')",
    });
  },
);

/*
    Kubernetes-api applySecret Function tests
*/
test.serial(
  "Test applySecret functionality for successfully creating a new secret",
  async t => {
    const applySecretResponse = await K8sAPI.applySecret(
      new CustomSecret({
        metadata: {
          name: "secret-test-value",
          namespace: namespace,
          labels: { "pepr.dev/keycloak": "testlabel" },
        },
        data: { testField: "testfield" },
      }),
    );

    t.truthy(
      applySecretResponse,
      "Response should contain a Secret and not be null",
    );
    t.is(
      applySecretResponse.kind,
      "Secret",
      "Response should be of kind Secret",
    );
    // t.is(
    //   applySecretResponse.data["testField"],
    //   "dGVzdGZpZWxk",
    //   "Response should contain a secret that contains base64 encoded `dGVzdGZpZWxk` data",
    // );
    t.is(
      applySecretResponse.metadata.labels["pepr.dev/keycloak"],
      "testlabel",
      "Response should contain a new data element called `testField`",
    );

    // Next need to get that secret to verify it was successfully created
    const newSecret = await K8sAPI.getSecret("secret-test-value", namespace);
    t.truthy(newSecret.getData, "Response should not be null");
    t.is(
      newSecret.metadata.labels["pepr.dev/keycloak"],
      "testlabel",
      "Verify new secret contains data element `testField`",
    );
  },
);

test.serial("Test applySecret functionality duplicate secret", async t => {
  try {
    const firstSecret = await K8sAPI.applySecret(
      new CustomSecret({
        metadata: {
          name: "secret-test-value",
          namespace: namespace,
          labels: { "pepr.dev/keycloak": "testlabel" },
        },
        data: { testField: "testfield" },
      }),
    );

    t.truthy(firstSecret, "First Secret to be created should not be undefined");

    const secondSecret = await K8sAPI.applySecret(
      new CustomSecret({
        metadata: {
          name: "secret-test-value",
          namespace: namespace,
          labels: { "pepr.dev/keycloak": "testlabel" },
        },
        data: { testField: "testfield" },
      }),
    );

    t.truthy(
      secondSecret,
      "Second Secret to be created should not be undefined",
    );
    t.deepEqual(firstSecret, secondSecret, "Secrets should equal each other");
  } catch (e) {
    t.fail("The secrets were unable to be created successfully");
  }
});

test.serial(
  "Test applySecret functionality for updating an existing secret",
  async t => {
    const applySecretResponse = await K8sAPI.applySecret(
      new CustomSecret({
        metadata: {
          name: name,
          namespace: namespace,
        },
        data: { testField: "testfield" },
      }),
    );

    t.truthy(
      applySecretResponse,
      "Response should contain a Secret and not be null",
    );
    t.is(
      applySecretResponse.kind,
      "Secret",
      "Response should be of kind Secret",
    );
    // t.is(
    //   applySecretResponse.data["testField"],
    //   "dGVzdGZpZWxk",
    //   "Response should contain an updated Secret that contains the new data element `testField`",
    // );
    t.is(
      applySecretResponse.data["KEYCLOAK_ADMIN"],
      "YWRtaW4=",
      "Response should contain an updated Secret that contains the old data field called KEYCLOAK_ADMIN with the value `YWRtaW4=`",
    );
    t.is(
      applySecretResponse.data["KEYCLOAK_ADMIN_PASSWORD"],
      "c3VwM3Itc2VjcmV0LXBAc3N3b3Jk",
      "Response should contain an updated Secret that contains the old data field called KEYCLOAK_ADMIN_PASSWORD with the value `c3VwM3Itc2VjcmV0LXBAc3N3b3Jk`",
    );
  },
);

test.serial(
  "Test applySecret functionality for incomplete secret object",
  async t => {
    try {
      await K8sAPI.applySecret(
        new CustomSecret({
          data: { testField: "testfield" },
        }),
      );
      // Expect the request to fail because of not being defined correctly
      t.fail("Expected promise to be rejected");
    } catch (e) {
      t.true(e instanceof Object, "The rejected value should be an ojbect");
    }
  },
);

/*
    Kubernetes-api deleteSecret Function tests
*/
test.serial(
  "Test deleteSecret functionality for successfully deleting a secret",
  async t => {
    // First Create a new test secret
    await K8sAPI.applySecret(
      new CustomSecret({
        metadata: {
          name: "secret-test-value",
          namespace: namespace,
          labels: { "pepr.dev/keycloak": "testlabel" },
        },
        data: { testField: "testfield" },
      }),
    );

    // Next delete that secret
    await K8sAPI.deleteSecret("secret-test-value", namespace);

    // Then attempt to retrieve that secret
    try {
      await K8sAPI.getSecret("secret-test-value", namespace);
    } catch (e) {
      t.true(e instanceof Object, "There was no Secret to retrieve");
    }
  },
);

test.serial(
  "Test deleteSecret functionality for secret that doesn't exist",
  async t => {
    try {
      await K8sAPI.deleteSecret("SECRET_THAT_DOESNT_EXIST", namespace);
      t.pass("Expected to pass because function catches non existent deletion");
    } catch (e) {
      t.fail();
    }
  },
);
