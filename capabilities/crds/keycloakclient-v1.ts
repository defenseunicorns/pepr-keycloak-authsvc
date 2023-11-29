// This file is auto-generated by kubernetes-fluent-client, do not edit manually

import { GenericKind, RegisterKind } from "kubernetes-fluent-client";

export class KeycloakClient extends GenericKind {
  spec?: Spec;
}

export interface Spec {
  client?: Client;
  domain?: string;
  keycloakBaseUrl?: string;
  realm?: string;
}

export interface Client {
  access?: { [key: string]: string | string[] | boolean };
  adminUrl?: string;
  alwaysDisplayInConsole?: boolean;
  attributes?: { [key: string]: string | string[] | boolean };
  authenticationFlowBindingOverrides?: {
    [key: string]: string | string[] | boolean;
  };
  authorizationServicesEnabled?: boolean;
  baseUrl?: string;
  bearerOnly?: boolean;
  clientAuthenticatorType?: string;
  clientId: string;
  consentRequired?: boolean;
  defaultClientScopes?: string[];
  description?: string;
  directAccessGrantsEnabled?: boolean;
  enabled?: boolean;
  frontchannelLogout?: boolean;
  fullScopeAllowed?: boolean;
  id?: string;
  implicitFlowEnabled?: boolean;
  name?: string;
  nodeReRegistrationTimeout?: number;
  notBefore?: number;
  oauth2DeviceAuthorizationGrantEnabled?: boolean;
  optionalClientScopes?: string[];
  origin?: string;
  protocol?: string;
  publicClient?: boolean;
  redirectUris?: string[];
  registeredNodes?: { [key: string]: string | string[] | boolean };
  registrationAccessToken?: string;
  rootUrl?: string;
  secret?: string;
  serviceAccountsEnabled?: boolean;
  standardFlowEnabled?: boolean;
  surrogateAuthRequired?: boolean;
  webOrigins?: string[];
}

RegisterKind(KeycloakClient, {
  group: "pepr.dev",
  version: "v1",
  kind: "KeycloakClient",
});
