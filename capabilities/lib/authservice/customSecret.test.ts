import anyTest, { TestFn } from "ava";
import { kind } from "pepr";
import { createCustomSecret } from "./customSecret";

const test = anyTest as TestFn<{
  testSecret: kind.Secret;
}>;

const sampleSecret = {
  metadata: {
    name: "metadata.name",
    namespace: "metadata.namespace",
  },
  apiVersion: "v1",
  kind: "Secret",
  type: "Opaque",
  data: {
    item: Buffer.from("my secret data").toString("base64"),
    anotherItem: Buffer.from("another secret data").toString("base64"),
  },
};

/*
    customSecret 
*/
test("Test Create Custom Secret", async t => {
  const customSecret = createCustomSecret(sampleSecret);

  t.truthy(customSecret, "Secret should not be null");
  t.is(
    customSecret.metadata["name"],
    "metadata.name",
    "Secret should contain metadata field `name` with the value `metadata.name`",
  );
  t.is(
    customSecret.metadata["namespace"],
    "metadata.namespace",
    "Secret should contain metadata field `namespace` with the value `metadata.namespace`",
  );
  t.is(
    customSecret.getData("item"),
    "my secret data",
    "Secret should contain data field `item` with the value `my secret data`",
  );
  t.is(
    customSecret.getData("anotherItem"),
    "another secret data",
    "Secret should contain data field `anotherItem` with the value `another secret data`",
  );
});

test("Test Setting new data in secret", async t => {
  const customSecret = createCustomSecret(sampleSecret);

  customSecret.setData("newItem", "This is a new item.");
  // Add a base64 encoded string to data, which will be encoded into base64 again by the setData function
  customSecret.setData(
    "anotherNewItem",
    Buffer.from("This is another new item.").toString("base64"),
  );

  t.is(
    customSecret.getData("newItem"),
    "This is a new item.",
    "Secret should contain data field `newItem` with value `This is a new item.`",
  );
  t.is(
    customSecret.getData("anotherNewItem"),
    Buffer.from("This is another new item.").toString("base64"),
    "Secret should contain data field `anotherNewItem` with value `This is another new item.`",
  );
});

test("Test getSecret that returns a kind.Secret", async t => {
  const customSecret = createCustomSecret(sampleSecret);

  const convertedSecret = customSecret.getSecret();

  t.truthy(convertedSecret, "Secret should not be null");

  t.is(
    convertedSecret.apiVersion,
    "v1",
    "Secret should contain an `apiVersion` with value `v1`",
  );
  t.is(
    convertedSecret.kind,
    "Secret",
    "Secret should contain a `kind` with value `Secret`",
  );

  t.is(
    convertedSecret.metadata["name"],
    "metadata.name",
    "Secret should contain metadata field `name` with value `metadata.name`",
  );
  t.is(
    convertedSecret.metadata["namespace"],
    "metadata.namespace",
    "Secret should contain metadata field `namespace` with value `metadata.namespace`",
  );

  t.is(
    convertedSecret.data["item"],
    Buffer.from("my secret data").toString("base64"),
    "Secret should contain data field `item` with value `my secret data`",
  );
  t.is(
    convertedSecret.data["anotherItem"],
    Buffer.from("another secret data").toString("base64"),
    "Secret should contain data field `anotherItem` with value `another secret data`",
  );
});
