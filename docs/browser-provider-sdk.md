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

## Durable capability-selection explanations

`explainBrowserProviderSelection` binds a Supervisor `ExecutionDecision` back to the exact detached BPAL diagnostics record that justified it. It fails closed on provider, capability-version, policy-version, risk, maturity, verification, channel, origin, automatic-failover, Browser-on-demand, or production-environment mismatches. The resulting explanation is deterministic, deeply frozen, and includes only policy metadata: selected channel, decision code, exact approved origins, navigation/evidence/verification identities, approval requirement, and bounded reason codes.

`createBrowserProviderSelectionAuditEvent` converts that explanation into the existing `PersistentAuditEvent` contract for `ExecutionRecordStore.appendAuditEvent`. Its SHA-256 identity binds the canonical timestamp, normalized optional execution/dispatch identities, incident identity, and complete explanation, so equivalent stored records deduplicate while materially different records cannot collide under duplicate-ignore persistence. The event cannot authorize, approve, replay, resume, dispatch, launch, or execute work. It contains no credentials, tokens, provider responses, browser objects, screenshot binaries, or mutable callbacks, and production Browser execution remains explicitly false.

`selectBrowserProviderExecutionWithAudit` is the governed BPAL selection call site. It resolves one exact registered provider capability, maps only that provider's detached metadata into the Supervisor policy selector, validates the decision against the same diagnostics snapshot, and awaits durable audit persistence before returning the frozen decision, explanation, and audit event. Unknown provider/capability scope and audit-store failures are terminal. The service has no Browser Runtime, Playwright, provider client, network, credential, approval-token, or mutation dependency. A production Browser request is reduced to manual review unless production execution is separately enabled by policy; the persisted explanation still declares `productionExecutionEnabled: false`.

Durable selection audits remain subject to the existing coordination-table RLS boundary: anonymous reads and public client writes are denied, mutation paths remain server/service-role only, and authenticated operator visibility is read-only and sanitized.

## CI guard

`npm run validate:bpal` runs `scripts/validate-bpal-guard.mjs`, which fails if a second registry, second root adapter contract, second Vercel adapter, forbidden BPAL execution/credential dependencies, direct Vercel knowledge inside Browser Runtime, or duplicate Vercel capability IDs are introduced. Runtime tests additionally exercise registration isolation, cross-reference integrity, navigation confinement, explicit Vercel capability bindings, durable selection explanations, fail-closed decision binding, and audit-before-return selection behavior.

## Localization

Operator-facing BPAL labels use the `browserProvider.*` / `browserProvider.vercel.*` namespace and existing localized Supervisor policy labels. English, Spanish, Portuguese, Polish, and Russian coverage is verified by the Browser Provider diagnostics test suite.

## Next sprint

The recommended next sprint is to render validated, read-only capability-selection audit events in an authenticated execution-history detail page and link that page from the existing sandbox history table, without adding approval, retry, resume, execution, credential, provider-request, or production Browser controls.
