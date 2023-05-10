# Keycloak Istio Authsvc Capability

This capability is designed to automate the manual steps required to integrate new applications into the [Big Bang IdAM Solution](https://docs-bigbang.dso.mil/latest/docs/understanding-bigbang/package-architecture/authservice/)

## Setup

Create the Zarf package:
`zarf package create setup --confirm`

Deploy the Zarf package:
`zarf package deploy zarf-package-* --confirm`
