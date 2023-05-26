# Keycloak Istio Authsvc Capability

This capability is designed to automate the manual steps required to integrate new applications into the [Big Bang IdAM Solution](https://docs-bigbang.dso.mil/latest/docs/understanding-bigbang/package-architecture/authservice/)

## Pre-reqs

The installation must be complete for keycloak, authservice and istio. It's best to use the bigbang chart to deploy these.

### Keycloak setup:

1. Must be resolvable via https://keycloak.bigbang.dev (or whatever domain you setup) inside the cluster, authservice requires TLS even with MTLS.
2. The admin user and password must be stored in a secret in namespace `keycloak`, object `keycloak-env`
3. pepr does not need special access to this namespace beyond the mutating webhook.

### authservice setup:

1. must be in namespace authservice
2. must have a secret called authservice that contains the config.json
3. pepr needs needs access to this namespace
   1. full access to secrets (to read/write the client secrets, and update the authservice config)
   2. will roll the authservice deployment via a restartedAt label (patch)

### Istio setup:

1. must have it's mesh aware of authservice (in the `istio-system` namespace, configmap `istio`)
2. Istio objects must be created by the istio setup
   1. peerauthentications.security.istio.io
   2. authorizationpolicies.security.istio.io (authz)
   3. requestauthentications.security.istio.io (authn)

## How to trigger the SSO pepr module:

### Realm setup:

If the realm is not created, there are two ways to create a realm (the realm can be pre-created)

1. From a secret, this will create a pain old demo realm, with no configuration

```
    kubectl create secret generic configrealm -n keycloak --from-literal=realm=demo --from-literal=domain=bigbang.dev
    kubectl label secret configrealm -n keycloak  todo=createrealm
```

2. From a configmap export, A realm exported with keycloak's UI, can be imported in this method. Recommended to not export the clients. In this case all the realm info will be imported. Any clients that are in this import will be ignored, and it's recommended to remove them to keep this export smaller, and more flexible. `Keycloak's database enforces some primary key issues, so importing more than one realm by modifying the realm name in the import is not recommended.`

```
kubectl create cm configrealm -n podinfo --from-file=realmJson
kubectl label cm configrealm -n podinfo  todo=createrealm
```

### Client setup:

Setting up a client for an application is the primary use of this module. To kick off the process, for an example app called `podinfo`

Before this application can be secured, the application deployment/statefulset that will be secured (via istio virtual service/gateway), must have this in it's spec:

```
spec:
  template:
    metadata:
      labels:
        protect: keycloak
```

All the virtual services, and the gateway should be setup during application deployment time. Before you create the client try to access the service externally and you should see a `permission denied` since it's not setup in authservice or keycloak yet.

```
kubectl create secret generic configclient -n podinfo --from-literal=realm=demo --from-literal=id=podinfo --from-literal=name=podinfo --from-literal=domain=bigbang.dev
kubectl label secret configclient -n podinfo  todo=createclient
```

This performs several tasks:

1. reads the kubernetes secret
2. contacts keycloak to generate the client secret
3. write the keycloak data into the `authservice` namespace with a secret called `mission-${name}` in this case it would be `mission-podinfo`
4. regenerates the namespace `authservice` named secret `authservice` to include the new client secret in its configuration
5. restarts the authservice deployment

## Deployment

TBD

### How to deploy this module

Use pepr build and pepr deploy

### How to validate this module is working properly

See above.
