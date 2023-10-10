import { K8s, Log, fetchStatus, kind } from "pepr";
import { CustomSecret } from "./authservice/customSecret";

export class K8sAPI {
  // Return a secret based on the name of the secret and a namespace
  static async getSecret(name: string, namespace: string) {
    return new CustomSecret(
      await K8s(kind.Secret).InNamespace(namespace).Get(name),
    );
  }

  // Return list of CustomSecrets that contain labels
  static async getSecretsByLabelSelector(labelSelector: string) {
    const [key, value] = labelSelector.split("=");
    const label = { [key]: value };

    const result = await Promise.all(
      (await K8s(kind.Secret, { labels: label }).Get()).items.map(
        secret => new CustomSecret(secret),
      ),
    );

    return result;
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
  static async applySecret(secret: CustomSecret) {
    return K8s(kind.Secret).Apply(secret.getSecret());
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
