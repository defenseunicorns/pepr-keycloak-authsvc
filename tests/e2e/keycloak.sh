#!/bin/bash

helm repo add codecentric https://codecentric.github.io/helm-charts
helm upgrade --install keycloak codecentric/keycloakx --namespace keycloak --create-namespace --values=values.yaml

sleep 5 && kubectl wait --for=condition=ready pods -l app.kubernetes.io/name=keycloakx -n keycloak --timeout=5m

# if the script is run with the debug arg then use the debug K8's resource files
if [ "$1" = "debug"  ]; then
    kubectl apply -f debug/realm-secret.yaml
    kubectl apply -f debug/realm-configmap.yaml
else
    kubectl apply -f realm-secret.yaml
    kubectl apply -f realm-configmap.yaml
fi

kubectl port-forward -n keycloak service/keycloak-http 8080:80 &
