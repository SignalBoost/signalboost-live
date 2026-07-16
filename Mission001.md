# Mission 001 — Autonomous Platform Supervisor

## Sprint 11 — Supervisor Core Contracts and Orchestrator Skeleton

Sprint 11 establishes the provider-neutral supervisor foundation that will eventually connect:

Observer → Thinker → Policy Engine → Executor → Verifier → Audit

This sprint is intentionally contract-only and deterministic. It does **not** perform live Vercel observation, call an LLM, launch a browser, invoke Browser Runtime repairs, or change production/provider state.

## New files

- `saas/lib/supervisor/incident-schema.ts` — strict runtime validation for serializable incidents and evidence.
- `saas/lib/supervisor/repair-plan-schema.ts` — strict runtime validation for bounded repair plans, explicit step actions, secret-reference enforcement, and browser-origin requirements.
- `saas/lib/supervisor/execution-contracts.ts` — provider-neutral Observer, Thinker, PolicyEngine, Executor, Verifier, and AuditSink interfaces.
- `saas/lib/supervisor/policy-engine.ts` — deterministic conservative default policy engine for disabled, passive, and autopilot modes.
- `saas/lib/supervisor/orchestrator.ts` — fail-closed orchestration skeleton coordinating injected dependencies only.
- `saas/lib/supervisor/errors.ts` — supervisor-specific error classes.
- `saas/lib/supervisor/index.ts` — public exports.
- `saas/tests/supervisorCore.node.test.ts` — focused contract, policy, schema, and orchestrator tests.

## Dependency boundaries

- The Observer contract receives only provider observation context and returns validated incidents. It does not receive an Executor, Browser Runtime, browser session, or browser handle.
- The Thinker contract receives one validated incident and returns a repair-plan candidate. It does not receive an Executor, Browser Runtime, browser session, or browser handle.
- The PolicyEngine receives a validated incident, validated repair plan, supervisor mode, and policy context, then returns a deterministic scoped decision.
- The Executor receives only the validated incident, validated repair plan, policy decision, explicit approved step IDs, and execution context.
- The Verifier receives the incident, repair plan, and execution result.
- The AuditSink receives immutable serializable audit events.
- The supervisor core does not import Playwright, Chromium, browser-use, Stagehand, OpenAI, Gemini, Vercel SDK, Stripe SDK, or Supabase clients.

## Policy behavior

### Disabled mode

- Blocks every execution.

### Passive mode

- May approve read-only plans automatically.
- Requires approval for protected actions.
- Requires approval for medium, high, or critical risk plans.
- Requires approval for production modifications.
- Blocks destructive operations.

### Autopilot mode

- May approve read-only plans automatically.
- May approve low-risk reversible sandbox actions with explicit step scope.
- Requires approval for production modifications.
- Requires approval for sensitive billing, payment, account ownership, permission, domain-transfer, and secret-rotation operations.
- Blocks destructive operations.
- Blocks critical-risk plans.
- Treats ambiguous plans conservatively and does not auto-approve them.

## Tests added

`saas/tests/supervisorCore.node.test.ts` proves invalid incidents and plans are rejected, non-serializable metadata is rejected, plaintext secrets in plan parameters are rejected while `secretRef` is accepted, browser plans require `targetOrigin`, default policy decisions are conservative, and the orchestrator fails closed on invalid Thinker output, approval-required decisions, unknown approved step IDs, verification failure, and pre-execution audit failure.

The tests also assert that Observer and Thinker contracts do not include Executor or Browser Runtime dependencies.

## Deliberately not implemented yet

- No live Vercel observation.
- No Vercel SDK/API execution.
- No LLM/Thinker provider integration.
- No Browser Runtime launch.
- No production repair autonomy.
- No durable supervisor queue.
- No UI for supervisor approvals.

Live Vercel observation and execution are deferred to the next sprint.

## Next recommended sprint

Sprint 12 should connect a read-only Vercel observer and policy-reviewed incident ingestion path while preserving the same boundaries: Observer detects facts, Thinker proposes only, Policy scopes approved steps, and any protected execution remains behind owner approval and audit controls.
