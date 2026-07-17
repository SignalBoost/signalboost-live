# Browser Provider SDK

The Browser Provider Abstraction Layer (BPAL) is the single provider-neutral metadata SDK between Browser Runtime consumers, Supervisor policy, provider workers, and provider-specific read-only definitions. It contains metadata only: no execution, credentials, browser launch, Playwright import, mutations, approval bypass, provider SDK clients, network requests, or production browser enablement.

## Canonical module

- Canonical directory: `saas/lib/browser-provider/`.
- Canonical public entry point: `saas/lib/browser-provider/index.ts`.
- Internal provider data for Vercel lives under `saas/lib/browser-provider/vercel/`.
- The former `saas/lib/browser-provider/providers/vercel-provider.ts` path is a temporary compatibility re-export only; new code must import from the public entry point.

## Components

- `BrowserProviderAdapter`: provider-neutral adapter contract exposing deterministic serializable metadata and capability/support methods.
- `BrowserProviderRegistry`: deterministic dependency-injected registry for register, unregister, lookup, listing, health, version, and capability access; duplicate registrations and unknown providers fail closed.
- Capability model: lowercase canonical risk/maturity values, read-only support flags, origin/navigation/evidence/verification identities, versioning, and suspended fail-closed behavior.
- Origin model: exact HTTPS origins only, no credentials, query strings, fragments, paths, or wildcards.
- Navigation model: bounded fixed paths or route templates with exact declared parameters; protocol-relative paths, encoded traversal, backslashes, queries, fragments, arbitrary URLs, and executable instructions are rejected.
- Selector model: structured role, label, test ID, exact text, or narrowly validated CSS selectors organized by provider domain.
- Evidence and verification models: deterministic metadata profiles only; no callbacks, code, screenshot binaries, or success claims before execution.
- Health and versioning: provider health is separate from platform/deployment health and uses `healthy`, `degraded`, `outage`, `unknown`, and `suspended`.
- Diagnostics snapshot: `createBrowserProviderDiagnosticsSnapshot` produces a deterministic, deeply frozen, read-only policy view for Supervisor/operator review and fails closed if a provider claims production execution or executable worker capacity.

## Registration integrity

Registration is the canonical cross-model integrity boundary. The registry stores detached frozen copies rather than caller-owned metadata and rejects provider identity/version mismatches, production-enabled adapters, foreign-provider records, duplicate or dangling references, missing Browser navigation/origin scope, navigation-to-origin escapes, capability/profile support mismatches, unsupported selector capability IDs, and evidence or verification profiles without deterministic requirements. A failed registration leaves the registry unchanged.

Capability bindings are explicit. Every Browser-capable capability must resolve to one registered navigation profile, one or more approved exact origins, a verification profile that declares support for the capability, and an evidence profile that declares support for the capability. Provider-level Browser-on-demand and automatic-failover claims must match the registered capability set, while production Browser execution remains prohibited.

## Vercel

The canonical `VercelBrowserAdapter` is read-only and non-executing. It provides metadata for deployment status, deployment failures, deployment logs, domain status, project metadata, environment-variable metadata, dashboard evidence capture, and dashboard/API comparison. Its capability-to-navigation, verification, and evidence bindings are explicit and registration-validated. It does not log in, mutate provider state, handle provider credentials, import Playwright, invoke Browser Runtime, or support production browser execution.

## Supervisor integration

`mapBrowserProviderCapabilityToSupervisorCapability` maps BPAL capability metadata into the existing HA execution-policy capability shape while preserving risk, maturity, read-only state, production-disabled environments, verification profile identity, and origin identity. `createBrowserProviderWorkerDescriptor` exposes a zero-execution-capacity provider-worker descriptor for metadata-only adapters.

The admin-only `/dashboard/supervisor/providers` screen renders the diagnostics snapshot for operator policy review. It exposes provider health, versions, exact origins, capability risk/maturity, API/browser/manual channel declarations, evidence and verification profile identities, and approval requirements. It contains no forms, mutation controls, provider requests, credentials, or browser execution path. The Supervisor HA page links to this screen.

## CI guard

`npm run validate:bpal` runs `scripts/validate-bpal-guard.mjs`, which fails if a second registry, second root adapter contract, second Vercel adapter, forbidden BPAL execution/credential dependencies, direct Vercel knowledge inside Browser Runtime, or duplicate Vercel capability IDs are introduced. Runtime tests additionally exercise registration isolation, cross-reference integrity, navigation confinement, and explicit Vercel capability bindings.

## Localization

Operator-facing BPAL labels use the `browserProvider.*` / `browserProvider.vercel.*` namespace and existing localized Supervisor policy labels. English, Spanish, Portuguese, Polish, and Russian coverage is verified by the Browser Provider diagnostics test suite.

## Next sprint

The recommended next sprint is to bind BPAL diagnostics to durable Supervisor audit records and capability-selection explanations without enabling production/provider Browser execution, credentials, or mutations.
