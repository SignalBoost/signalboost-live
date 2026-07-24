# Browser Agent Commercial Portability Contract

## Product boundary

The Browser Agent is a standalone commercial product. This repository is only a development, integration, and validation lab. The product core must not depend on the lab's brand, domains, authentication, database schema, hosting provider, deployment topology, or business workflows.

A buyer must be able to install and operate the product without access to any lab-owned service.

## Buyer-owned configuration

The buyer owns and supplies:

- credentials and secret storage
- provider selection and provider endpoints
- approved target origins
- execution, approval, retention, and evidence policies
- branding and user-facing copy
- telemetry and observability destinations
- storage and database implementations
- networking, proxies, and egress controls
- deployment environment and release process

No buyer credential may be embedded in the portable package, examples, tests, or reference deployments.

## Supported distribution models

The product architecture must support versioned package distribution, containers, self-hosted services, customer-cloud deployment, and embedded SDK use. A distribution may implement a subset, but the core contracts must not prevent another supported model.

## Required commercial artifacts

A releasable product must include:

1. a versioned package or container image
2. a machine-readable configuration schema
3. an installation and first-run guide
4. stable integration contracts
5. health and readiness checks
6. an upgrade and rollback guide
7. documented security and trust boundaries
8. at least one company-neutral reference deployment

Provider adapters must remain independently replaceable and must use buyer-managed credentials through injected ports.

## Lab integration

Any lab integration must be implemented as an optional reference adapter outside the commercial core. Removing that adapter must not break installation, configuration, tests, runtime startup, or provider selection.

## Release rule

A product is not plug-and-play merely because its code runs in the lab. Commercial readiness requires a clean installation in an unrelated environment using only documented buyer configuration and published artifacts.
