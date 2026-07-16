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
- Navigation model: bounded fixed paths or route templates with required parameters; no arbitrary URLs or executable instructions.
- Selector model: structured role, label, test ID, exact text, or narrowly validated CSS selectors organized by provider domain.
- Evidence and verification models: deterministic metadata profiles only; no callbacks, code, screenshot binaries, or success claims before execution.
- Health and versioning: provider health is separate from platform/deployment health and uses `healthy`, `degraded`, `outage`, `unknown`, and `suspended`.

## Vercel

The canonical `VercelBrowserAdapter` is read-only and non-executing. It provides metadata for deployment status, deployment failures, deployment logs, domain status, project metadata, environment-variable metadata, dashboard evidence capture, and dashboard/API comparison. It does not log in, mutate provider state, handle provider credentials, import Playwright, invoke Browser Runtime, or support production browser execution.

## Supervisor integration

`mapBrowserProviderCapabilityToSupervisorCapability` maps BPAL capability metadata into the existing HA execution-policy capability shape while preserving risk, maturity, read-only state, production-disabled environments, verification profile identity, and origin identity. `createBrowserProviderWorkerDescriptor` exposes a zero-execution-capacity provider-worker descriptor for metadata-only adapters.

## CI guard

`npm run validate:bpal` runs `scripts/validate-bpal-guard.mjs`, which fails if a second registry, second root adapter contract, second Vercel adapter, forbidden BPAL execution/credential dependencies, direct Vercel knowledge inside Browser Runtime, or duplicate Vercel capability IDs are introduced.

## Localization

Operator-facing BPAL labels use the `browserProvider.*` / `browserProvider.vercel.*` namespace and must be complete in English, Spanish, Portuguese, Polish, and Russian.

## Next sprint

The recommended next sprint is to wire BPAL metadata into operator-visible Supervisor diagnostics and policy review screens while keeping production/provider Browser execution disabled and preserving API-first HA policy.
