// import { K8s, Log, fetchStatus, kind } from "pepr";
// import { chance } from "./secretV2";
// import k8s from "@kubernetes/client-node";

// export class K8sAPI {
//   k8sApi: k8s.CoreV1Api;
//   k8sAppsV1Api: k8s.AppsV1Api;

// constructor() {}

// getSecretValues(
//   inputSecret: kind.Secret,
//   keys: string[],
// ): { [key: string]: string } {
//   const secret = inputSecret.data;
//   const secretValues: { [key: string]: string } = {};

//   if (secret) {
//     keys.forEach(key => {
//       if (secret[key]) {
//         secretValues[key] = secret[key];
//       } else {
//         throw new Error(
//           `Could not find key '${key}' in the secret ${inputSecret.metadata?.name}`,
//         );
//       }
//     });
//     return secretValues;
//   }
//   throw new Error(
//     `Could not retrieve the secret ${inputSecret.metadata?.name}`,
//   );
// }

// async checksumDeployment(
//   name: string, namespace: string, checksum: string) {
//   const appName = "Deployment";
//   try {
//     await K8s(kind.Deployment, { name: name, namespace: namespace }).Patch([
//       {
//         op: "add",
//         path: "/spec/template/metadata/annotations/pepr.dev~1checksum",
//         value: checksum,
//       },
//     ]);

//     Log.info(`Successfully applied the checksum to ${appName}`, "pepr-istio");
//   } catch (err) {
//     Log.error(
//       `Failed to apply the checksum to ${appName}: ${err.data?.message}`,
//       "pepr-istio",
//     );
//   }
// }

// async getSecretsByLabelSelector(
//   labelSelector: string,
// ): Promise<kind.Secret[]> {
//   return await chance.getSecretsByLabelSelector(labelSelector);
// }

// async upsertSecret(
//   name: string,
//   namespace: string,
//   secretData: Record<string, string>,
//   labels?: { [key: string]: string },
// ) {
//   // Prepare the Secret object
//   const secret: kind.Secret = {
//     apiVersion: "v1",
//     kind: "Secret",
//     metadata: {
//       name: name,
//       namespace: namespace,
//       labels,
//     },
//     data: secretData,
//   };

//   try {
//     await chance.applySecret(secret);
//   } catch (e) {
//     throw e;
//   }
// }

// async patchSecret(
//   name: string,
//   namespace: string,
//   secretData: Record<string, string>,
// ): Promise<boolean> {

//   try {
//     chance.applySecret({ metadata: { name: name, namespace: namespace }, data: secretData })

//     return true;
//   } catch (e) {
//     // Check to see if we're out of sync.
//     if (e.response && e.response.statusCode === 409) {
//       // Conflict due to version mismatch
//       return false;
//     } else {
//       throw e;
//     }
//   }
// }

// async deleteSecret(name: string, namespace: string) {
//   try {
//     await K8s(kind.Secret).InNamespace(namespace).Delete(name);
//   } catch (e) {
//     if (e.response?.statusCode === fetchStatus.NOT_FOUND) {
//       return;
//     } else {
//       throw e;
//     }
//   }
// }
// }
