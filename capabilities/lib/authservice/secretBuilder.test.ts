import anyTest, { TestFn } from "ava";

import { AuthServiceSecretBuilder } from "./secretBuilder";
import { k8s } from "pepr";
import { K8sAPI } from "../kubernetes-api";
import { AuthserviceConfig } from "./secretConfig";

const test = anyTest as TestFn<{
  authServiceSecretBuilder: AuthServiceSecretBuilder;
  testSecret: k8s.V1Secret;
}>;

test.beforeEach(t => {
  const k8sApi = new K8sAPI();

  // mock function to return secrets
  k8sApi.getSecretsByLabelSelector = () => {
    return Promise.resolve([
      {
        metadata: {
          namespace: "default",
          name: "foo",
        },
      },
      {
        metadata: {
          namespace: "default",
          name: "bar",
        },
      },
    ]);
  };

  const secretBuilder = new AuthServiceSecretBuilder(k8sApi);

  // mock authservice config
  secretBuilder.getAuthServiceConfig = () => {
    return Promise.resolve(
      new AuthserviceConfig({
        chains: [],
        listen_address: "0.0.0.0",
        listen_port: 8080,
        log_level: "info",
        threads: 4,
      }),
    );
  };

  t.context = {
    authServiceSecretBuilder: secretBuilder,
    testSecret: {
      metadata: {
        namespace: "default",
        name: "baz",
      },
      data: {
        id: "ZGV2XzAwZWI4OTA0LTViODgtNGM2OC1hZDY3LWNlYzBkMmUwN2FhNl9wb2RpbmZv",
        name: "cG9kaW5mbw==",
        domain: "YmlnYmFuZy5kZXY=",
        realm: "YmFieS15b2Rh",
        redirectUri: "YmlnYmFuZy5kZXY=",
        clientSecret: "cG9kaW5mbw==",
      },
    },
  };
});

test("AuthServiceSecretBuilder should handle adding a secret correctly", async t => {
  const secrets = await t.context.authServiceSecretBuilder.buildSecretList(
    t.context.testSecret,
    false,
  );

  t.is(secrets.length, 3);
});

test("AuthServiceSecretBuilder should handle deleting a secret correctly", async t => {
  const deletedSecret: k8s.V1Secret = {
    metadata: {
      namespace: "default",
      name: "foo",
    },
  };

  const secrets = await t.context.authServiceSecretBuilder.buildSecretList(
    deletedSecret,
    true,
  );

  t.is(secrets.length, 1);
});

test("AuthServiceSecretBuilder should handle sorting secrets correctly", async t => {
  const secrets = await t.context.authServiceSecretBuilder.buildSecretList(
    {
      metadata: {
        namespace: "otherns",
        name: "foo",
      },
    },
    false,
  );

  t.is(secrets.length, 3);
  t.is(secrets[0].metadata.name, "bar");
  t.is(secrets[1].metadata.name, "foo");
  t.is(secrets[2].metadata.name, "foo");
  t.is(secrets[2].metadata.namespace, "otherns");
});

test("AuthServiceSecretBuilder should build an authservice config", async t => {
  const authServiceConfig =
    await t.context.authServiceSecretBuilder.buildAuthServiceConfig([
      t.context.testSecret,
    ]);

  t.is(authServiceConfig.chains.length, 1);
  t.is(authServiceConfig.chains[0].name, "podinfo");
});

test("AuthServiceSecretBuilder should leave a single chain if all are removed", async t => {
  const authServiceConfig =
    await t.context.authServiceSecretBuilder.buildAuthServiceConfig([]);

  t.is(authServiceConfig.chains.length, 1);
  t.is(authServiceConfig.chains[0].name, "placeholderName");
});
