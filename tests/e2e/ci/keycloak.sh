#!/bin/bash

helm repo add codecentric https://codecentric.github.io/helm-charts
helm upgrade --install keycloak codecentric/keycloakx --namespace keycloak --create-namespace --values=../values.yaml

sleep 5 && kubectl wait --for=condition=Ready pods -l app.kubernetes.io/name=keycloakx -n keycloak --timeout=5m

# Create secret for creating a realm in KC
kubectl apply -f realm-secret.yaml
# Create configmap for creating a realm in KC
kubectl apply -f realm-configmap.yaml
# Create CRD
kubectl apply -f client-crd.yaml
# Create CR for KC client
kubectl apply -f client-cr.yaml

kubectl port-forward -n keycloak service/keycloak-http 8080:80 &





