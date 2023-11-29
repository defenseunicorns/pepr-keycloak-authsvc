export interface OidcClientK8sSecretData {
  clientId: string;
  name: string;
  [key: string]: string | string[] | boolean;
}

export interface UserData {
  username: string;
  [key: string]: string | string[] | boolean;
}