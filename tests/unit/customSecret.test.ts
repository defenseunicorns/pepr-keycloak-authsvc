import anyTest, { TestFn } from "ava";
import { CustomSecret } from "../../capabilities/lib/authservice/customSecret";

const test = anyTest as TestFn;

/* Global Test Variables */
const base64TestSecret = {
  metadata: {
    name: "metadata.name",
    namespace: "metadata.namespace",
  },
  apiVersion: "v1",
  kind: "Secret",
  type: "Opaque",
  data: {
    item: Buffer.from("itemData").toString("base64"),
    anotherItem: Buffer.from("anotherItemData").toString("base64"),
  },
};

const utf8TestSecret = {
  metadata: {
    name: "metadata.name",
    namespace: "metadata.namespace",
  },
  apiVersion: "v1",
  kind: "Secret",
  type: "Opaque",
  data: {
    item: "itemData",
    anotherItem: "anotherItemData",
  },
};

const inavlidTestSecret = {
  metadata: {
    name: "metadata.name",
    namespace: "metadata.namespace",
  },
  apiVersion: "v1",
  kind: "Secret",
  type: "Opaque",
  data: {
    item: "invalid_base64_value",
  },
};

let base64Secret, utf8Secret, invalidSecret;

// Create test secrets for tests
test.before(async () => {
  base64Secret = new CustomSecret(base64TestSecret);
  utf8Secret = new CustomSecret(utf8TestSecret);
  invalidSecret = new CustomSecret(inavlidTestSecret);
});

/*
    CustomSecret Class Tests
*/
test.serial("Test Create Custom Secret with base64 data", async t => {
  t.truthy(base64Secret, "Secret should not be null");
  t.is(
    base64Secret.metadata["name"],
    "metadata.name",
    "Secret should contain metadata field `name` with the value `metadata.name`",
  );
  t.is(
    base64Secret.metadata["namespace"],
    "metadata.namespace",
    "Secret should contain metadata field `namespace` with the value `metadata.namespace`",
  );
  t.is(
    base64Secret.getStringData("item"),
    "itemData",
    "Secret should contain data field `item` with the value `itemData`",
  );
  t.is(
    base64Secret.getStringData("anotherItem"),
    "anotherItemData",
    "Secret should contain data field `anotherItem` with the value `anotherItemData`",
  );
});

test.serial("Test Create Custom Secret with utf8 data", async t => {
  t.truthy(utf8Secret, "Secret should not be null");
  t.is(
    utf8Secret.metadata["name"],
    "metadata.name",
    "Secret should contain metadata field `name` with the value `metadata.name`",
  );
  t.is(
    utf8Secret.metadata["namespace"],
    "metadata.namespace",
    "Secret should contain metadata field `namespace` with the value `metadata.namespace`",
  );
  t.is(
    utf8Secret.getStringData("item"),
    "itemData",
    "Secret should contain data field `item` with the value `itemData`",
  );
  t.is(
    utf8Secret.getStringData("anotherItem"),
    "anotherItemData",
    "Secret should contain data field `anotherItem` with the value `anotherItemData`",
  );
});

test.serial("Test Create Custom Secret with invalid data", async t => {
  t.truthy(invalidSecret, "Secret should not be null");
  t.is(
    invalidSecret.metadata["name"],
    "metadata.name",
    "Secret should contain metadata field `name` with the value `metadata.name`",
  );
  t.is(
    invalidSecret.metadata["namespace"],
    "metadata.namespace",
    "Secret should contain metadata field `namespace` with the value `metadata.namespace`",
  );
  t.is(
    invalidSecret.getStringData("item"),
    "invalid_base64_value",
    "Secret should contain data field `item` with the value `itemData`",
  );
});

/*
    CustomSecret setData Function Tests
*/
test.serial("Test Setting new utf-8 and base64 data in secret", async t => {
  base64Secret.setData("newItem", "This is a new item.");
  // Add a base64 encoded string to data, which will be encoded into base64 again by the setData function
  base64Secret.setData(
    "anotherNewItem",
    Buffer.from("This is another new item.").toString("base64"),
  );

  t.is(
    base64Secret.getStringData("newItem"),
    "This is a new item.",
    "Secret should contain data field `newItem` with value `This is a new item.`",
  );
  t.is(
    base64Secret.getStringData("anotherNewItem"),
    Buffer.from("This is another new item.").toString("base64"),
    "Secret should contain data field `anotherNewItem` with value `This is another new item.`",
  );
});

/*
    CustomSecret getStringData Function Tests
*/
test.serial("Test getStringData with base64 secret data", async t => {
  t.is(
    base64Secret.getStringData("item"),
    "itemData",
    "Assert getStringData matches original object data.",
  );
  t.is(
    base64Secret.getStringData("anotherItem"),
    "anotherItemData",
    "Assert getStringData matches original object data.",
  );
});

test.serial("Test getStringData with utf-8 secret data", async t => {
  t.is(
    utf8Secret.getStringData("item"),
    "itemData",
    "Assert getStringData matches original object data.",
  );
  t.is(
    utf8Secret.getStringData("anotherItem"),
    "anotherItemData",
    "Assert getStringData matches original object data.",
  );
});

/*
    CustomSecret getSecret Function Tests
*/
test.serial("Test successful getSecret request", async t => {
  const convertedSecret = base64Secret.getSecret();

  t.truthy(convertedSecret, "Secret should not be null");

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
});

test.serial("Test getSecret that returns a kind.Secret", async t => {
  const convertedSecret = base64Secret.getSecret();

  t.is(typeof convertedSecret, "object", "Verify it's an object");

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
});

test.serial("Test getSecret that returns base64 encoded data", async t => {
  const convertedSecret = base64Secret.getSecret();

  t.is(
    convertedSecret.data["item"],
    Buffer.from("itemData").toString("base64"),
    "Secret should contain data field `item` with value `itemData`",
  );
  t.is(
    convertedSecret.data["anotherItem"],
    Buffer.from("anotherItemData").toString("base64"),
    "Secret should contain data field `anotherItem` with value `anotherItemData`",
  );
});

/*
    CustomSecret isValidASCII Function Tests
*/
test.serial("Valid ASCII characters", t => {
  const validInputs = ["Hello, World!", "12345", "@#$%^&*()", ""];
  validInputs.forEach(input => {
    t.true(base64Secret.isValidASCII(input));
  });
});

test.serial("Non-ASCII characters", t => {
  const nonAsciiInputs = ["Héllo", "©opyright", "日本語", "😃"];
  nonAsciiInputs.forEach(input => {
    t.false(base64Secret.isValidASCII(input));
  });
});

test.serial("Mixed ASCII and non-ASCII characters", t => {
  const mixedInputs = ["Hello, 日本語", "1234 © 5678", "ASCII 😃 Unicode"];
  mixedInputs.forEach(input => {
    t.false(base64Secret.isValidASCII(input));
  });
});
