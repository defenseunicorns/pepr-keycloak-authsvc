// This file is auto-generated by kubernetes-fluent-client, do not edit manually

import { GenericKind, RegisterKind } from "kubernetes-fluent-client";

export class KeycloakUser extends GenericKind {
  spec?: Spec;
}

export interface Spec {
  domain?: string;
  keycloakBaseUrl?: string;
  realm?: string;
  user?: User;
}

export interface User {
  clientRoles?: { [key: string]: string[] };
  credentials?: Credential[];
  email?: string;
  emailVerified?: boolean;
  enabled?: boolean;
  firstName?: string;
  lastName?: string;
  realmRoles?: string[];
  username?: string;
}

export interface Credential {
  algorithm?: string;
  config?: { [key: string]: string | string[] | boolean };
  counter?: number;
  createdDate?: number;
  credentialData?: string;
  device?: string;
  digits?: number;
  hashedSaltedValue?: string;
  hashIterations?: number;
  id?: string;
  period?: number;
  priority?: string;
  salt?: string;
  temporary?: boolean;
  type?: string;
  userLabel?: string;
  value?: string;
}

RegisterKind(KeycloakUser, {
  group: "pepr.dev",
  version: "v1",
  kind: "KeycloakUser",
});
