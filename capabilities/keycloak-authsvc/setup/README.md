
`npm run k3d-setup`

`npm run zarf` (in setup directory)

edit the configmap in istio-system called istio and add this to it extensionProviders needs to be at the same level as default..

```
    extensionProviders:
      - name: "authservice"
        envoyExtAuthzGrpc:
          service: "authservice.authservice.svc.cluster.local"
          port: "10003"

```

Create and label the secret to get keycloak in the istio mesh:
```
kubectl create secret generic setup -n keycloak --from-literal=domain=bigbang.dev
kubectl label secret setup -n keycloak todo=setupkeycloak
```


Wait until keycloak has restarted, this will create the the demo realm
```
kubectl create secret generic configrealm -n keycloak --from-literal=realm=demo --from-literal=domain=bigbang.dev
kubectl label secret configrealm -n keycloak  todo=createrealm
```

You can now create a user in the keycloak UI.


Now to create the keycloak client, run this:
```
kubectl create secret generic configclient -n podinfo --from-literal=realm=demo --from-literal=clientId=podinfo --from-literal=clientName=podinfo --from-literal=domain=bigbang.dev
kubectl label secret configclient -n podinfo  todo=createclient
```

navigate your web browser to https://podinfo.bigbang.dev/

