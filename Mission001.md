# Mission 001 — Autonomous Platform Supervisor

## Sprint 11 — Supervisor Core Contracts and Orchestrator Skeleton

Sprint 11 established the provider-neutral supervisor foundation:

Observer → Thinker → Policy Engine → Executor → Verifier → Audit

It is intentionally contract-only and deterministic. The supervisor core does **not** perform live Vercel observation, call an LLM, launch a browser, invoke Browser Runtime repairs, or change production/provider state.

## Sprint 12 — Vercel Observer and Normalized Incident Ingestion

Sprint 12 adds the first real provider Observer: a read-only Vercel deployment observer under `saas/lib/supervisor/providers/vercel/`.

This sprint is observation-only. It detects provider facts, normalizes them into the existing `SupervisorIncident` schema, validates every incident with the Sprint 11 schema, and stops there. It does **not** diagnose root causes, propose repair steps, invoke an LLM/Thinker, launch Playwright or Browser Runtime, execute plans, mutate Vercel configuration, redeploy projects, change environment variables, or bypass the Supervisor orchestrator.

### Vercel Observer responsibilities

- Resolve the Vercel token through an injected secret resolver.
- Query recent deployments through an injected read-only Vercel client.
- Normalize Vercel deployment states to `queued`, `building`, `ready`, `failed`, `canceled`, or `unknown`.
- Apply deterministic incident detectors.
- Return zero or more validated `SupervisorIncident` objects.
- Convert authentication, authorization, rate-limit, and provider-outage failures into normalized provider incidents.

### Read-only boundary

The Vercel client interface exposes only:

- `getProjectMetadata`
- `listRecentDeployments`
- `getDeployment`

It intentionally does not expose deployment creation, redeploy, cancel, project update, environment-variable mutation, deletion, token rotation, domain mutation, or generic arbitrary request methods.

### Incident types

Sprint 12 detects:

- failed deployment
- repeated deployment failure
- stuck queued/building deployment
- canceled production deployment
- unknown provider state
- API authentication or authorization failure
- provider API unavailable / rate-limited after bounded retries

### Severity rules

Severity is deterministic and centralized in the Vercel incident mapper:

- failed sandbox or preview deployment: `warning`
- failed production deployment: `critical`
- repeated sandbox or preview failures: `warning`
- repeated production failures: `critical`
- stuck sandbox or preview deployment: `warning`
- stuck production deployment: `critical`
- canceled production deployment: `warning`
- unknown provider state: `warning`
- authentication or authorization failure: `critical`
- provider outage or rate limit: `warning`

### Deduplication behavior

Incident IDs are stable and deterministic:

- failed deployment: provider + project + deployment ID + incident type
- repeated failures: provider + project + environment + consecutive failure-sequence fingerprint
- stuck deployment: provider + project + deployment ID + threshold category
- connection failure: provider connection ID + normalized error category

A short deterministic fingerprint is also stored in safe metadata for correlation.

### Retry rules

The Observer retries only safe read operations. Retry behavior is bounded by configuration, uses an injected sleeper for deterministic tests, honors safe Retry-After metadata where available, and never retries authentication, authorization, or invalid configuration failures. Exhausted retryable failures produce one provider-unavailable incident.

### Sanitation rules

All Vercel-provided strings routed to incidents pass through a sanitation layer that redacts authorization headers, bearer tokens, obvious API-token assignments, cookies, environment-variable values, stack-trace tails, and excessive message length. Incidents never store raw build logs, raw API responses, Authorization headers, cookies, or the resolved token.

### Files added

- `saas/lib/supervisor/providers/vercel/vercel-client.ts`
- `saas/lib/supervisor/providers/vercel/vercel-types.ts`
- `saas/lib/supervisor/providers/vercel/vercel-observer.ts`
- `saas/lib/supervisor/providers/vercel/incident-mapper.ts`
- `saas/lib/supervisor/providers/vercel/deployment-classifier.ts`
- `saas/lib/supervisor/providers/vercel/errors.ts`
- `saas/lib/supervisor/providers/vercel/index.ts`
- `saas/lib/supervisor/providers/index.ts`
- `saas/tests/vercelObserver.node.test.ts`

### Tests added

`saas/tests/vercelObserver.node.test.ts` covers healthy observations, sandbox/preview/production failed deployments, repeated failures with configurable thresholds, stuck deployment age rules, canceled production deployments, unknown states, authentication failures, bounded rate-limit retries, stable deduplication keys, token/header/raw-response redaction, incident schema validation, Observer dependency boundaries, read-only client surface, and no-network test behavior.

### Known limitations

- The Observer is registered through module exports for dependency injection, but it is not connected to automatic execution.
- No internal API route was added because Sprint 12 can be satisfied through direct dependency injection, and adding a route without fully reusing existing admin/provider-connection lookup abstractions would create unnecessary security risk.
- The client is intentionally narrow and read-only; additional safe read endpoints can be added in later sprints only when required by a detector.

### Deferred to Sprint 13

Sprint 13 should add a governed incident-ingestion workflow around the Observer: provider-connection lookup, server-side secret resolution, optional admin-only manual observation endpoint if the existing authentication/rate-limit/audit abstractions are reused safely, persistence/audit of normalized incidents, and owner-visible review surfaces. Sprint 13 should still stop before diagnosis or repair unless a separately reviewed Observer → Thinker handoff is explicitly approved.

## Sprint 14 — Policy-to-Executor Bridge

Sprint 14 adds a provider-neutral, non-mutating dispatcher layer under `saas/lib/supervisor/executors/`. The bridge accepts only already-validated incidents, repair plans, approved policy decisions, explicit approved step IDs, and execution context. It proves safe routing only; it does **not** execute real repairs.

### Dispatcher responsibilities

- Treat the Policy Engine as the authorization boundary.
- Reject `blocked` and `approval_required` policy outcomes as terminal.
- Require a non-empty, duplicate-free approved step scope.
- Verify every approved step ID exists in the repair plan and exactly matches the policy-approved scope.
- Fail closed on unknown executor kinds, missing executor registrations, incompatible plans, mixed API/browser executable plans, and unsupported executable content.
- Emit sanitized serializable dispatch audit events.
- Enforce in-memory at-most-once dispatch IDs before executor invocation so duplicate or concurrent dispatch attempts cannot execute twice within the same dispatcher instance.

### Executor registry and kinds

The Sprint 14 registry supports exactly three executor kinds: `api`, `browser`, and `manual`. It allows one active executor per kind and rejects duplicate registrations unless replacement is explicitly requested. Unknown and missing executor resolution fails closed. The registry intentionally imports no browser automation, provider SDK, mutable provider client, SSH, CLI, Kubernetes, or shell abstractions.

### Executor stub behavior

- `APIExecutor` is a routing stub. It accepts API-compatible approved steps, records which steps would have been routed, returns `not_implemented`, performs no network calls, resolves no credentials, and does not call Universal Runner.
- `BrowserExecutor` is disabled for Sprint 14. It validates browser-compatible approved steps, returns `not_implemented` or `rejected`, and does not import or invoke the Browser Runtime, Playwright, Chromium, Stagehand, or browser-use.
- `ManualExecutor` routes manual-review or stop-style plans to human review. It may return `completed` only for the manual routing action itself and never claims the incident was remediated.

### Audit and sanitation

Dispatch audit events added in Sprint 14 are `dispatch_requested`, `dispatch_rejected`, `dispatch_started`, `dispatch_completed`, `dispatch_failed`, `executor_missing`, and `duplicate_dispatch_rejected`. Payloads are scrubbed to serializable data and must not include credentials, secret values, tokens, authorization headers, raw provider responses, stack traces, browser objects, or unvalidated provider payloads.

### Orchestrator integration

`SupervisorOrchestrator` can now receive an injected `SupervisorDispatcher` and explicit requested executor kind. Blocked and approval-required policy outcomes remain terminal before dispatcher handoff, and only `policy.approvedStepIds` are passed into dispatch. The previous executor interface remains available for existing tests and consumers. No Browser Runtime or Universal Runner connection is made in this sprint.

### At-most-once limitation

At-most-once protection is in memory for the lifetime of a dispatcher instance. It rejects duplicate and concurrent duplicate `dispatchId` values within that process. Durable process-restart dispatch tracking is intentionally deferred.

### Known limitations and Sprint 15 recommendation

Sprint 14 proves routing only. No real repair is executed, API mutation remains disabled, browser execution remains disabled, and process-restart durable dispatch tracking is not implemented. Sprint 15 should add durable dispatch/audit persistence and an owner-visible review surface for proposed dispatches while keeping API and browser mutations disabled until a separately reviewed mutation contract, approval gate, and provider-specific safety adapter are approved.
