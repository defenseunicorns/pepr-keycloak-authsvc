export interface OidcClientK8sSecretData {
  clientId: string;
  name: string;
  [key: string]: string | string[] | boolean;
}
