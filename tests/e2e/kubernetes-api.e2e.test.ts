import anyTest, { TestFn } from "ava";

import { K8sAPI } from "../../capabilities/lib/kubernetes-api";
import { CustomSecret } from "../../capabilities/lib/authservice/customSecret";

const test = anyTest as TestFn;

// Global Test Variables
const namespace = "kube-system";
const name = "secret-test-value";
const labelSelector = { "pepr.dev/keycloak": "testlabel" };

// create testing secret to be used by tests
test.before(async () => {
  await K8sAPI.applySecret(
    new CustomSecret({
      metadata: {
        name: "secret-test-value",
        namespace: "kube-system",
        labels: { "pepr.dev/keycloak": "testlabel" },
      },
      data: { testField1: "testfield1" },
    }),
  );
});

// remove craeted secret no matter what happens in the tests
test.after.always(async () => {
  await K8sAPI.deleteSecret(name, namespace);
});

/*
    Kubernetes-api getSecret Function tests
*/
test.serial(
  "Test getSecret functionality for successfully retrieving secret",
  async t => {
    const getSecretResponse = await K8sAPI.getSecret(name, namespace);

    t.truthy(getSecretResponse.getSecret(), "Response should not be null");

    t.is(
      getSecretResponse.getStringData("testField1"),
      "testfield1",
      "Response should contain data field called testField1 with the value `testfield1`",
    );
    t.is(
      getSecretResponse.getSecret().metadata["name"],
      name,
      "Response should contain metadata field called name with the value `secret-test-value`",
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

    // Get specific secret and check its data
    const envSecret = getSecretsByLabelSelectorResponse.find(
      secret => secret.metadata.name === name,
    );
    t.is(
      envSecret.getStringData("testField1"),
      "testfield1",
      "Response should contain data field called testField1 with the value `testfield1`",
    );
  },
);

test.serial(
  "Test getSecretsByLabelSelector functionality for no secrets matching labelSelector",
  async t => {
    const getSecretsByLabelSelectorResponse =
      await K8sAPI.getSecretsByLabelSelector({
        FAKE_SELECTOR_LABEL: "FAKE_SELECTOR_VALUE",
      });

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
  "Test getSecretsByLabelSelector functionality for when labelSelector is empty",
  async t => {
    const getSecretsByLabelSelectorResponse =
      await K8sAPI.getSecretsByLabelSelector({});
    t.is(
      0,
      getSecretsByLabelSelectorResponse.length,
      "When an empty labelSelector is provided should return an empty list",
    );
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
          name: "another-test-secret",
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
    t.is(
      applySecretResponse.data["testField"],
      "dGVzdGZpZWxk",
      "Response should contain a secret that contains base64 encoded `dGVzdGZpZWxk` data",
    );
    t.is(
      applySecretResponse.metadata.labels["pepr.dev/keycloak"],
      "testlabel",
      "Response should contain a new data element called `testField`",
    );

    // Next need to get that secret to verify it was successfully created
    const newSecret = await K8sAPI.getSecret("another-test-secret", namespace);
    t.truthy(newSecret.getStringData, "Response should not be null");
    t.is(
      newSecret.metadata.labels["pepr.dev/keycloak"],
      "testlabel",
      "Verify new secret contains data element `testField`",
    );

    // remove created secret
    await K8sAPI.deleteSecret("another-test-secret", namespace);
  },
);

test.serial("Test applySecret functionality duplicate secret", async t => {
  try {
    const firstSecret = await K8sAPI.applySecret(
      new CustomSecret({
        metadata: {
          name: "duplicate-test-secret",
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
          name: "duplicate-test-secret",
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

  // remove created secret
  await K8sAPI.deleteSecret("duplicate-test-secret", namespace);
});

test.serial(
  "Test applySecret functionality for updating an existing secret",
  async t => {
    const s = await K8sAPI.getSecret(name, namespace);

    t.truthy(s);
    t.is(
      s.getStringData("testField1"),
      "testfield1",
      "Original secret should contain the data element `testField1`",
    );

    const applySecretResponse = await K8sAPI.applySecret(
      new CustomSecret({
        metadata: {
          name: name,
          namespace: namespace,
        },
        data: { testField2: "testfield2" },
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
    t.falsy(
      applySecretResponse.data["testField1"],
      "Response should not contain the data element `testField1`",
    );
    t.is(
      applySecretResponse.data["testField2"],
      "dGVzdGZpZWxkMg==",
      "Response should contain an updated Secret that contains the new data element `testField2`",
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
          name: "test-delete-secret",
          namespace: namespace,
          labels: { "pepr.dev/keycloak": "testlabel" },
        },
        data: { testField: "testfield" },
      }),
    );

    // Next delete that secret
    await K8sAPI.deleteSecret("test-delete-secret", namespace);

    // Then attempt to retrieve that secret
    try {
      await K8sAPI.getSecret("test-delete-secret", namespace);
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
