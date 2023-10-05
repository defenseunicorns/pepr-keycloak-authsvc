import { K8s, Log, fetchStatus, kind } from "pepr";

export class K8sAPI {
  // Return a secret based on the name of the secret and a namespace
  static async getSecret(name: string, namespace: string) {
    return transformFromSecret(
      await K8s(kind.Secret).InNamespace(namespace).Get(name),
    );
  }

  // Return list of secrets that contain labels
  static async getSecretsByLabelSelector(labelSelector: string) {
    const labels = labelSelector.split("=");
    const label = { [labels[0]]: labels[1] };
    const result = await K8s(kind.Secret, { labels: label }).Get();
    return result.items;
  }

  // Delete a secret based on its name and a namespace
  static async deleteSecret(name: string, namespace: string) {
    try {
      await K8s(kind.Secret).InNamespace(namespace).Delete(name);
    } catch (e) {
      if (e.response?.statusCode === fetchStatus.NOT_FOUND) {
        return;
      } else {
        throw e;
      }
    }
  }

  // Create / Update secret based on provided metadata and data fields
  static async applySecret(secret: Partial<kind.Secret>) {
    transformToSecret(secret);
    return K8s(kind.Secret).Apply(secret);
  }

  static async checksumDeployment(
    name: string,
    namespace: string,
    checksum: string,
  ) {
    const appName = "Deployment";
    try {
      await K8s(kind.Deployment, { name: name, namespace: namespace }).Patch([
        {
          op: "add",
          path: "/spec/template/metadata/annotations/pepr.dev~1checksum",
          value: checksum,
        },
      ]);

      Log.info(`Successfully applied the checksum to ${appName}`, "pepr-istio");
    } catch (err) {
      Log.error(
        `Failed to apply the checksum to ${appName}: ${err.data?.message}`,
        "pepr-istio",
      );
    }
  }
}

// ToDo: Deep copy rather than copy in place
function transformToSecret(secret: kind.Secret) {
  if (!secret.data) {
    throw new Error("Data is missing in secret");
  }
  for (const key in secret.data) {
    if (!secret.data[key]) {
      throw new Error(`Key ${key} is missing in secret`);
    }
    secret.data[key] = Buffer.from(secret.data[key]).toString("base64");
  }
}

function transformFromSecret(secret: kind.Secret) {
  if (!secret.data) {
    throw new Error("Data is missing in secret");
  }
  for (const key in secret.data) {
    if (!secret.data[key]) {
      throw new Error(`Key ${key} is missing in secret`);
    }
    secret.data[key] = Buffer.from(secret.data[key], "base64").toString(
      "utf-8",
    );
  }
  return secret;
}
