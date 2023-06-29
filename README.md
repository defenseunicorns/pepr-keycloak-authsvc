# Pepr Module for Keycloak and Authservice

This is a Pepr Module intended to be imported into your own Pepr Module. [Pepr](https://github.com/defenseunicorns/pepr) is a Kubernetes transformation system written in Typescript. 
<br>
This repo has two capabilities in it that can be imported separately, or used together.
1. Keycloak capability communicates with the keycloak deployed in cluster to generate a new client secret that will be picked up by the authservice module.
2. Authservice capability reads from secrets created by the Keycloak module or manually and updates authservice's config.
<br>
These capability working together are designed to automate the manual steps required to integrate new applications into the [Big Bang IdAM Solution](https://docs-bigbang.dso.mil/latest/docs/understanding-bigbang/package-architecture/authservice/). If you wish to use this capability with the open source charts/images for this, there will be some changes that will need to be made:
1. authservice does not have a public chart, only an [example](https://github.com/istio-ecosystem/authservice/tree/master/bookinfo-example/authservice). Changes will need to be made to make this work. You should start with the [bigbang docs](https://docs-bigbang.dso.mil/2.2.0/docs/understanding-bigbang/package-architecture/authservice/) to help with the implementation
2. There are assumptions that the Keycloak capability makes that are specific to work with the [bigbang keycloak chart](https://docs-bigbang.dso.mil/2.2.0/docs/understanding-bigbang/package-architecture/keycloak/#Keycloak). This code can function with some minor changes to work with other keycloak charts. Mostly around where the keycloak chart stores the local admin kubernetes secret which the capability uses to communicate with keycloak.

## Installation To use this module:
- run `npm i @pepr/keycloak-authsvc`.
- Update your pepr.ts to look like this, or add additional capabilities to your module.
```typescript
import { PeprModule } from "pepr";
import { Keycloak } from "@pepr/keycloak-authsvc";
import { AuthService } from "@pepr/keycloak-authsvc";
import cfg from "./package.json";

new PeprModule(cfg, [Keycloak, AuthService]);
```

## Pre-reqs for Keycloak capability
1. for CAC auth, keycloak needs to be installed per BigBang, and accessible via an ingress gateway that is configured to passthrough into keycloak for TLS termination in keycloak.
2. if CAC auth is not required, the ingress gateway can perform TLS termination.
3. Keycloak must be resolvable via `https://keycloak.${domain}` from within and outside of the cluster. 

## Pre-reqs for Authservice capability
1. Istio must be setup with Authservice per the configuration from the BigBang chart (all the authn, authz stuff is covered in there)
2. AuthService must have the istio sidecar running
3. The IDP (IE: Keycloak) must be resolvable via from within and outside of the cluster. 

## Keycloak setup:
1. Must be resolvable via https://keycloak.${domain} (or whatever domain you setup) inside the cluster, authservice requires TLS even with MTLS.
2. The admin user and password must be stored in a secret in namespace `keycloak`, object `keycloak-env`
3. pepr does not need special access to this namespace beyond the mutating webhook.

## Authservice setup:
1. must be in namespace authservice
2. must have a secret called authservice that contains the config.json
3. pepr needs needs access to this namespace
   1. full access to secrets (to read/write the client secrets, and update the authservice config).
   2. will roll the authservice deployment via a checksum label (patch)

## Istio setup:
1. must have it's mesh aware of authservice (in the `istio-system` namespace, configmap `istio`)
2. Istio objects must be created by the istio setup
   1. peerauthentications.security.istio.io
   2. authorizationpolicies.security.istio.io (authz)
   3. requestauthentications.security.istio.io (authn)

## Realm setup:
The realm should be created by the bigbang package, but if not, the Keycloak capability provides this. The best way to do this:
1. Export configuration without clients to a JSON file
2. Verify the JSON file has the configuration you want
3. rename the JSON file to `realmJson`
4. Follow the procedure below to create a configmap with the realm configuration. Since there should be no secrets in the realm configuration, it's safe to use a configmap.
```bash
    kubectl create configmap configrealm -n keycloak --from-file=realmJson --from-literal=domain=bigbang.dev
    kubectl label configmap configrealm -n keycloak  pepr.dev/keycloak=createrealm
```
NOTE: Multiple realms have not been tested!

## Setting up an application to be secured with Keycloak/Authservice
1. This assumes the application is secured with istio's sidecar, has a virtual service and a gateway. It should be accessible from outside the cluster without authenication. 
2. To protect this application with Keycloak, you can add the following to the deployment (or possibly a statefulset). This should result in a 'Permission Denied' message when attempting to access the application.

The modifications to the deployment will look like this:
```yaml
spec:
  template:
    metadata:
      labels:
        protect: keycloak
```
Here's a command that will perform that patch on an example application (podinfo in namespace podinfo)
```shell
kubectl patch deployment podinfo -n podinfo -p '{"spec":{"template":{"metadata":{"labels":{"protect":"keycloak"}}}}}'
```
3. To start the process for creation of the secret from keycloak:
```bash
kubectl create secret generic configclient -n podinfo \
  --from-literal=realm=baby-yoda \
  --from-literal=id=podinfo \
  --from-literal=name=podinfo \
  --from-literal=domain=bigbang.dev \
  --dry-run=client -o yaml | kubectl label --local -f - pepr.dev/keycloak=createclient -o yaml | kubectl apply -f -
```
This performs the same action:
```bash
kubectl create secret generic configclient -n podinfo --from-literal=realm=baby-yoda --from-literal=id=podinfo --from-literal=name=podinfo --from-literal=domain=bigbang.dev
kubectl label secret configclient -n podinfo  pepr.dev/keycloak=createclient
```
Did it work? If this command:
```bash
kubectl get secret podinfo-client -n podinfo -o yaml
```
returns the following, then the Keycloak capability functioned properly.
(NOTE: the clientSecret will be generated by keycloak so will not look the same) 
```yaml
apiVersion: v1
kind: Secret
type: Opaque
metadata:
  labels:
    pepr.dev/keycloak: oidcconfig
  name: podinfo-client
  namespace: podinfo
data:
  clientSecret: WlJUWjNDcW9MMEpHaHRKZVdqcVNHdGoxVVEwbHBwZEY=
  domain: YmlnYmFuZy5kZXY=
  id: ZGV2XzAwZWI4OTA0LTViODgtNGM2OC1hZDY3LWNlYzBkMmUwN2FhNl9wb2RpbmZv
  name: cG9kaW5mbw==
  realm: YmFieS15b2Rh
  redirectUri: aHR0cHM6Ly9wb2RpbmZvLmJpZ2JhbmcuZGV2L2xvZ2lu
```
If the following is in the secret, then the AuthService capability also ran correctly.
```yaml
  annotations:
    e4a35052-c138-55e4-94a7-bb942b1cddc7.pepr.dev/AuthService: succeeded
```
4. Verifying the application now requires authentication. What initially allowed no authentication after step 1, then access denied after step 2, should now properly authenicate a user (NOTE: you'll need a user in the realm to test it). 

## Troubleshooting
If you got to step 4 above and the authentication flow is not properly working, here are things to test:
1. Can you login to the keycloak admin console? 
2. Did you create a user in the realm? Can that user login to keycloak as well?
3. Does keycloak and authservice have the sidecar container running with it?
4. Is authservice running properly?
5. is the new chain in authservice's secret there?
6. Did authservice properly restart?
7. Is the authn/authz stuff in istio properly setup?

