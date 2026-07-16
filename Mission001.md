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
