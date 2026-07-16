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

### Sprint 15 — Browser Runtime Dry-Run Adapter

Sprint 15 connects the Supervisor BrowserExecutor to Browser Runtime task contracts only as a deterministic dry-run translation boundary. The BrowserExecutor now constructs a validated `BrowserRuntimeDryRunPackage` and returns `dry_run_ready`; it does not execute the package, launch a browser, import Playwright/Chromium, create a BrowserSession, access any provider account, resolve credentials, click controls, submit forms, modify Vercel, or mutate production/sandbox provider state.

The adapter accepts only a validated incident, repair plan, approved step IDs, browser dispatch metadata, an injected clock, and optional deterministic ID helper. It has no Observer, Thinker, Policy Engine, provider mutation client, BrowserSession, Playwright, secret resolver, credential, or LLM dependency. It fails closed if `requiresBrowser` is false, `targetOrigin` is missing or not an HTTPS origin, credentials/query/fragment/path scope are present, approved step IDs are unknown/duplicated/reordered, API and browser scope are mixed, unsupported actions appear, executable JavaScript or shell content is present, targets are natural-language-only, selectors broaden scope, or plaintext secret material appears.

Supported dry-run actions are exactly `navigate`, `click`, `fill`, `select`, `read`, `screenshot`, `request_approval`, `verify`, and `stop`. Click/fill/select/read require structured targets (`role` plus accessible `name`, `label`, `testId`, exact `text`, or explicit `css` when safe). Fill values must be non-secret literals or references such as `secretRef`, `tokenRef`, `credentialRef`, or `valueRef`; references are preserved but never resolved.

Protected Supervisor steps map to Browser Runtime checkpoints without collapsing approval controls. Supervisor policy approval proves only that the dispatcher may route the exact approved step IDs. Browser Runtime signed task approval and continuation approval remain separate future controls; the dry-run adapter creates no approval token and does not mark a Browser Runtime task approved. Deterministic package fingerprints cover incident/plan identity, target origin, approved step order, mapped task, approval requirements, verification requirements, and schema version. The package verifier is static and side-effect-free.

Known limitation: Browser Runtime live execution remains disconnected. The next recommended sprint is to enable execution only against an isolated local sandbox portal using signed Browser Runtime approvals and never against production/provider accounts.

## Sprint 16 — Isolated Sandbox Browser Execution

Sprint 16 enables one narrow BrowserExecutor execution path for the repository-local sandbox portal only. The allowed origin is centrally injected by tests and production code must not treat arbitrary localhost URLs as safe; the intended local test origin is `http://localhost:4173` and the portal path is `/browser-sandbox/login`.

The flow is deliberately bounded:

1. A Sprint 15 Browser Runtime dry-run package is runtime-validated and fingerprint-verified.
2. The sandbox promoter confirms `targetEnvironment: sandbox`, exact configured sandbox origin, ordered step scope, one approval checkpoint, sandbox-only secret references, supported Browser Runtime actions, and no package tampering.
3. The promoter produces the exact Browser Runtime task for execution without adding, removing, reordering, resolving secrets, or creating approval tokens.
4. BrowserExecutor invokes Browser Runtime through `runBrowserTask` / `resumeBrowserTask`; it does not import Playwright, Chromium, browser-use, Stagehand, or provider SDKs and does not bypass `BrowserSessionFactory`.
5. Phase one navigates only to the sandbox portal, fills harmless `sandbox://` references, captures pre-approval evidence, and pauses at the protected-action checkpoint.
6. Phase two requires a separate Browser Runtime continuation approval bound to the retained execution and exact remaining step IDs before clicking the harmless Protected save control.
7. Completion is accepted only when Browser Runtime deterministic verification is `verified`, required evidence exists, executed step IDs match the approved package, and the page origin stayed confined.

Browser execution is enabled only for the isolated repository sandbox. Production BrowserExecutor execution remains disabled. Vercel browser automation remains disabled. Real provider credentials are prohibited, no external authenticated websites may be targeted, and no production provider mutations are introduced.

Known limitation: retained execution state is in-process test infrastructure. Sprint 17 should add durable sandbox-only execution persistence and operator-visible sanitized audit history; it should not enable production/provider browser execution.

## Sprint 17 — Durable Sandbox Execution Records and Operator Audit History

Sprint 17 adds persistent, restart-safe, sanitized history for Mission 001 Supervisor dispatches and isolated sandbox Browser Runtime executions. The durable records are audit history only: they cannot authorize, replay, resume, approve, retry, or launch any browser task.

### Persistence scope

- `supervisor_executions` stores one sanitized serializable execution summary per sandbox execution.
- `supervisor_audit_events` stores immutable lifecycle events such as dispatch, package promotion, pause, continuation, terminal status, persistence failure, expiry, and restart abandonment.
- `supervisor_evidence` stores safe evidence references, metadata, and optional digests only. It does not store image binaries, raw HTML, cookies, authorization headers, browser storage, local filesystem paths, passwords, tokens, or provider secrets.

### Status model

Allowed terminal-safe transitions are centralized: `requested → started → paused_for_approval → continuation_started → completed`, with failure exits to `failed`, `verification_failed`, `rejected`, `expired`, or `abandoned_after_restart`. Terminal records do not return to running. `completed` requires `verificationStatus: verified`; verification failure is never persisted as successful completion.

### Restart behavior

Live browser sessions, Page objects, Browser objects, and BrowserContext objects remain in memory only. Serializable records may persist, but a process restart means the retained session is gone. Reconciliation marks non-terminal sandbox executions as `abandoned_after_restart` or expired and appends audit history. The system never reconstructs or resumes an in-memory browser session from an audit record; retry requires a new execution ID and new approvals.

### Operator visibility

Authenticated admin/operator routes under `/api/internal/supervisor/executions` provide bounded, read-only list and detail access. The dashboard page at `/dashboard/supervisor/executions` labels the records as sandbox audit history and intentionally includes no Retry, Resume, Approve, Execute, or production-run controls.

### Production boundary and limitations

Only sandbox execution history is supported. Production browser execution, Vercel browser automation, real-provider credentials, real provider mutations, automatic production repair, and provider API writes remain disabled. Screenshots may contain sensitive values in future non-sandbox scenarios, so future sprints must add artifact-level redaction review before broadening beyond the harmless sandbox portal.

### Next recommended sprint

Sprint 18 should add CI-reviewed operational hardening around the read-only history surface: richer timeline filtering, artifact-reference viewer with redaction review, reconciliation scheduling, and Supabase policy tests. It should still avoid production/provider browser automation unless a separate governed approval and provider-specific safety design is reviewed.

## Browser Runtime Sprint 21 — Sanitized Terminal Failures

Sprint 21 hardens the portable Browser Runtime failure boundary without enabling any new execution target or provider capability.

- Every initial and resumed terminal failure now passes through one bounded sanitizer before entering `BrowserTaskResult.error` or error evidence.
- The sanitizer removes exact in-memory signing secrets, approval tokens, continuation tokens, and resolved fill values, plus common bearer/API-key/cookie/password/private-key/URL-credential patterns.
- Stack frames, control characters, and unbounded provider or browser-engine output are removed or truncated.
- Sanitized errors retain enough non-sensitive context for deterministic verification and operator diagnosis.

This slice remains sandbox-compatible and provider-neutral. It does not broaden allowed origins, authorize production execution, resolve new credentials, change approval semantics, or perform any provider mutation.

## Sprint 18 — Federated High-Availability Supervisor Control Plane

Mission 001 now has provider-neutral contracts for active-active Supervisor instances. A single Supervisor process is a single point of failure because an in-memory owner can die while work, browser continuations, or dispatch attempts are still pending. Multiple Supervisors may therefore be active simultaneously, but only one fenced owner may control a particular work item, incident, dispatch, or execution at a time.

The coordination foundation defines durable work items, Supervisor instance identity, time-limited leases, monotonically increasing fencing tokens, deterministic stale-owner rejection, heartbeat/draining behavior, and provider-isolated workers. Lease acquisition and protected writes are compare-and-set style operations. Process restart changes the runtime ID and invalidates prior ownership. Terminal work cannot be reclaimed, and expired leases may be reassigned with a higher fencing generation.

Shared governance is represented by versioned policy and capability metadata. API execution remains preferred. Smart failover may select Browser Agent automatically only for pre-authorized routine continuity work with registered capabilities, low risk, approved origins, deterministic verification, supported versions, and valid ownership fencing. Human intervention is an exception path for consequential, unsupported, stale, conflicting, unverifiable, credential, billing, ownership, permission, CAPTCHA, 2FA, deletion, irreversible, and production-browser conditions.

Execution modes are `api_only`, `smart_failover`, and `browser_on_demand`. API failure classifications are strict machine-readable categories, and browser reasons are limited to `human_requested`, `api_capability_missing`, `api_unavailable_after_bounded_retries`, `api_result_inconsistent`, and `ui_verification_required`. Capability maturity levels are `experimental`, `sandbox_verified`, `human_approved`, `auto_failover_ready`, and `suspended`; risk classes are `read_only`, `low_risk_reversible`, `medium`, `high`, and `forbidden`.

Browser sessions remain non-migratable. No audit record can resume a browser session. A lost browser session requires another Supervisor to wait for lease expiry, claim the work with a new fence, create a new execution ID, obtain new approvals, use a new nonce/token, and start a new Browser Runtime task. Browser Agent acts only as an automatic backup for pre-authorized routine operations. Production and real-provider Browser execution remain disabled.

Operator visibility adds five-language labels for Supervisor instances, provider workers, work ownership, lease expiry, execution method, API retry/failover, browser reason, capability maturity, policy version, stale-owner rejection, manual operator routing, production-browser disabled status, and no-active-work status.

Known limitations: the durable store is an injected deterministic in-memory implementation for this sprint; Supabase/Postgres persistence is intentionally a future implementation behind the same interface. Real-provider Browser automation is still disabled. Next recommended sprint: implement the Supabase/Postgres coordination store and durable at-most-once dispatch ledger, then wire read-only operator data from the durable store into the Supervisor HA page.
