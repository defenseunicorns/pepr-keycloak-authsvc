import { K8s, Log, fetchStatus, kind } from "pepr";

export class chance {
  static async getSecret(name: string, namespace: string) {
    return transformFromSecret(
      await K8s(kind.Secret).InNamespace(namespace).Get(name),
    );
  }

  static async getSecretsByLabelSelector(labelSelector: string) {
    const labels = labelSelector.split("=");
    const result = await K8s(kind.Secret, {
      labels: { [labels[0]]: labels[1] },
    }).Get();
    return result.items;
  }

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
  for (const key in secret.data) {
    secret.data[key] = Buffer.from(secret.data[key]).toString("base64");
  }
}

function transformFromSecret(secret: kind.Secret) {
  for (const key in secret.data) {
    secret.data[key] = Buffer.from(secret.data[key], "base64").toString(
      "utf-8",
    );
  }
  return secret;
}
