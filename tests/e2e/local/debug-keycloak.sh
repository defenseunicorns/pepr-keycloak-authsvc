#!/bin/bash

helm repo add codecentric https://codecentric.github.io/helm-charts
helm upgrade --install keycloak codecentric/keycloakx --namespace keycloak --create-namespace --values=../values.yaml

sleep 5 && kubectl wait --for=condition=Ready pods -l app.kubernetes.io/name=keycloakx -n keycloak --timeout=5m

# Create secret for creating a realm in KC
kubectl apply -f debug-realm-secret.yaml
# Create configmap for creating a realm in KC
kubectl apply -f debug-realm-configmap.yaml
# Create CRD
kubectl apply -f debug-client-crd.yaml
# Create the CR for KC client
kubectl apply -f debug-client-cr.yaml
# Create User CRD
kubectl apply -f debug-users-crd.yaml
# Create the CR for User
kubectl apply -f debug-users-cr.yaml

# Port forward keycloak for access
kubectl port-forward -n keycloak service/keycloak-http 8080:80 &