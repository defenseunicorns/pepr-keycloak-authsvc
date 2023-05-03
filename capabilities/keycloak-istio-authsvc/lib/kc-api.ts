import KcAdminClient from "@keycloak/keycloak-admin-client";

const kcAdminClient = new KcAdminClient();

export async function connect() {
  // Authorize with username / password
  await kcAdminClient.auth({
    username: "admin",
    password: "admin",
    grantType: "password",
    clientId: "admin-cli",
  });
}
