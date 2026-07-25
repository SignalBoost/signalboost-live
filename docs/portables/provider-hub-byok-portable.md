# SignalBoost Provider Hub — BYOK / BYOI Portable

> **Read with [ONBOARD.md](../../ONBOARD.md)** and [Portables Catalog](README.md). The current repository and verified code remain the source of truth.

## Product status

SignalBoost Provider Hub is a first-class commercial portable and a shared foundation for other SignalBoost products.

It turns the existing Bring Your Own Key (BYOK) and Bring Your Own Infrastructure (BYOI) doctrine into a separately packageable, white-label product for individual users, small businesses, development teams, regulated organizations, and Fortune 500 deployments.

This document defines the product contract and delivery direction. It does not claim that every listed enterprise capability is already implemented. The Portable Product Catalog and Readiness Dashboard must report verified implementation and packaging status accurately.

## Product promise

Provider Hub gives a user or buyer one governed place to connect, validate, manage, and expose provider resources they own to authorized applications and portables without hard-coding a vendor into product logic.

Buyer-owned resources may include:

- API keys and application credentials;
- OAuth applications and delegated connections;
- service accounts and cloud identities;
- AI, media, voice, rendering, storage, email, payment, social, publishing, analytics, security, and infrastructure providers;
- provider budgets, quotas, rate limits, environments, regions, versions, and capabilities.

The user or buyer owns the provider relationship, account, credentials, data permissions, and spend. SignalBoost must not silently become the provider of record or front provider spend.

## Dual-audience contract

Provider Hub must support two first-class operating modes without creating separate incompatible products.

### Self-service SignalBoost mode

Authenticated SignalBoost users must be able to:

- choose from supported providers;
- connect their own account through an approved API-key, OAuth, service-account, manual, or assisted path;
- validate the connection without exposing raw secrets;
- see bounded connection, capability, environment, quota, and health status;
- authorize which SignalBoost products may use the connection;
- replace, rotate, or disconnect a provider through explicit confirmation and approval controls;
- continue through manual setup when automated onboarding is unavailable;
- use approved connections from Campaign Studio, Video Creator, Press & Media, Marketing Planner, Website Review, Security Scan, and future portables.

The self-service experience must remain understandable to ordinary users. Enterprise terminology, infrastructure choices, and advanced policy controls must not block a user who only needs to connect one AI or media provider.

### Enterprise and white-label mode

Licensed organizations must be able to deploy the same product boundary with:

- tenant, business-unit, project, environment, and region isolation;
- enterprise identity, SSO, RBAC, and policy integrations;
- buyer-controlled vault and persistence adapters;
- provider allowlists and environment restrictions;
- approval policies for credentials, spend, publishing, and production use;
- usage, quota, cost, health, risk, and compliance visibility;
- audit evidence, migration, backup, recovery, and high-availability options;
- white-label branding and separately governed deployment.

Enterprise additions must extend the same versioned contracts used by self-service mode rather than creating a closed fork.

## First-class portable requirements

Provider Hub must:

- operate outside SignalBoost without source-code modification;
- separate host-agnostic core contracts from SignalBoost-specific host integration;
- remain provider-neutral and cloud-neutral;
- support tenant and environment isolation;
- accept buyer-supplied provider accounts, applications, credentials, and spend;
- preserve manual provider setup as a first-class reliability floor;
- fail closed when ownership, authorization, policy, validation, or durable state cannot be verified;
- expose bounded, sanitized, allowlisted metadata to user and operator surfaces;
- keep credentials and secret values out of logs, diagnostics, browser payloads, evidence, and UI responses;
- preserve explicit approval gates for provider mutation, spend, publishing, production execution, credential changes, and infrastructure mutation;
- provide installation, configuration, migration, security, compliance, backup, recovery, test, upgrade, and support documentation;
- support white-label packaging and buyer-controlled branding where licensed.

## Product architecture

The target portable boundary is:

```text
provider-hub-core
    -> provider contracts, capability discovery, validation, policy inputs,
       lifecycle metadata, health metadata, evidence contracts, and safe SDKs

provider-hub-host
    -> buyer or SignalBoost adapters for identity, vault, persistence, audit,
       approvals, UI, notifications, billing/licensing, and deployment

provider adapters
    -> plugged-in implementations for individual providers or provider classes
```

The core must not import Next.js, Supabase, a specific vault, a specific cloud, or provider-specific business logic. Host services and provider implementations arrive through explicit ports and versioned contracts.

The canonical Universal Provider Framework under `saas/lib/provider-framework/` remains a metadata and SDK boundary. Provider Hub may compose it, but must not silently turn it into a second orchestration engine, policy engine, browser runtime, dispatcher, credential store, or COS replacement.

## Enterprise capability roadmap

### Foundation

- provider registration and lifecycle metadata;
- capability and version discovery;
- authentication metadata without secret exposure;
- environment, region, tenant, and ownership metadata;
- configuration validation and fail-closed readiness;
- manual onboarding path;
- bounded health, quota, rate-limit, and verification metadata;
- immutable audit events and evidence references;
- SDK contracts for SignalBoost and third-party applications.

### Enterprise hardening

- pluggable vault integrations;
- SSO and enterprise identity integration;
- role-based and attribute-based access-control adapters;
- approval policies for credential changes, spend, publishing, and production use;
- credential rotation workflows with explicit authorization;
- policy-driven provider allowlists and environment restrictions;
- regional and data-residency controls;
- provider risk and compliance metadata;
- backup, recovery, migration, and disaster-recovery procedures;
- high-availability deployment patterns;
- usage, quota, budget, and cost visibility;
- exportable audit and compliance evidence;
- white-label deployment and licensing controls.

### Advanced routing, only through separately approved phases

- health-aware provider selection;
- policy-governed fallback and failover;
- workload and capability routing;
- bounded spend and quota controls;
- provider deprecation and version migration assistance.

These capabilities must not introduce automatic approval, unbounded spend, secret exposure, silent provider mutation, or production execution outside existing governance.

## Consumers

Provider Hub is a shared dependency for portables that require external resources, including:

- Campaign Studio;
- Render / Video Creator;
- Press & Media;
- Marketing + Sales / Marketing Planner;
- Website Review;
- Security Scan;
- Social Outreach Connector;
- future enterprise and marketplace applications.

A consuming portable requests a capability through the Provider Hub contract. It must not assume a specific provider, read raw secrets directly, or bypass approvals and policy.

## Distribution model

Provider Hub may be delivered as:

- an included self-service capability inside SignalBoost Cloud;
- a standalone enterprise deployment;
- a white-label portable embedded in a buyer platform;
- an SDK and operator console for development organizations;
- a managed enterprise edition under a commercial agreement.

Provider Hub itself is primarily a platform product, but its self-service connection experience must remain directly available to authenticated SignalBoost end users. Mobile and marketplace applications may use it through authenticated, bounded APIs and may expose safe connection status, setup guidance, approvals, and diagnostics without exposing raw credentials.

## Commercial readiness gates

Provider Hub must not be marketed as production-ready until the repository verifies the applicable gates:

- portable core/host boundary;
- versioned public contracts;
- supported provider and authentication matrices;
- secure vault integration and secret-redaction tests;
- tenant and environment isolation tests;
- authorization and approval tests;
- install and deployment automation;
- upgrade, migration, backup, and rollback procedures;
- observability and bounded diagnostics;
- licensing and entitlement enforcement;
- security architecture and threat model;
- compliance documentation and evidence export;
- customer administration and support documentation;
- acceptance, load, recovery, and compatibility testing.

Readiness dashboards and sales materials must distinguish designed, implemented, tested, packaged, deployable, and production-proven states.

## Initial implementation sequence

1. Inventory and map existing BYOK/provider code, stores, migrations, settings, adapters, tests, and documentation.
2. Define `provider-hub-core` contracts and dependency boundaries without duplicating the Universal Provider Framework.
3. Define `provider-hub-host` ports for vault, identity, persistence, audit, approvals, licensing, and UI.
4. Add a Provider Hub portable manifest and dependency-graph entry.
5. Add deterministic contract, secret-rejection, tenant-isolation, and compatibility tests.
6. Build an authenticated self-service connection surface and enterprise administration surface with strict response allowlists.
7. Package one reference deployment and one external-host integration example.
8. Complete security, compliance, installation, upgrade, recovery, and acceptance documentation.

Each phase must be delivered through a bounded pull request with exact validation results.

## Safety boundary

Provider registration, configuration metadata, health status, a plan, a recommendation, or a successful validation does not authorize provider mutation or business execution.

Publishing, spending, credential changes, infrastructure changes, provider mutations, browser execution, and production actions remain behind explicit governance and approval gates.
