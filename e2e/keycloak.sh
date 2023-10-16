#!/bin/bash

helm repo add codecentric https://codecentric.github.io/helm-charts
helm upgrade --install keycloak codecentric/keycloakx --namespace keycloak --create-namespace --values=values.yaml

sleep 5 && kubectl wait --for=condition=ready pods -l app.kubernetes.io/name=keycloakx -n keycloak --timeout=5m
kubectl apply -f test-secret.yaml





