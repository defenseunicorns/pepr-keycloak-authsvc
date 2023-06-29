export interface OidcClientK8sSecretData {
  realm: string;
  id: string;
  name: string;
  domain: string;
  clientSecret: string;
  redirectUri: string;
}
