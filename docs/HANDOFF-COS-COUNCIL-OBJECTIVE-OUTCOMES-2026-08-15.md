# COS Council Objective Outcome Ingestion — Handoff — 2026-08-15

## Purpose

This slice closes the first automatic feedback loop from real governed execution back into COS Council.

The invariant is deliberately conservative:

```text
objective operation outcome != specialist correctness
```

A deployment/read-back/tool result may prove that an operation succeeded or failed. It does not, by itself, prove every root-cause theory stated by Council members. Therefore objective outcomes are ingested automatically, but specialist credibility changes only through the existing verified-role-verdict path when external evidence can actually resolve a participating role's claim.

## Runtime flow

```text
incident / execution request
→ COS primary reasoning
→ Council if metacognitive trigger fires
→ exact correlation ids bound to Council session
→ governed Agent Gateway execution
→ deterministic/read-back result
→ bounded objective facts
→ cos_council_objective_outcomes
→ exact Council session match
→ NO automatic credibility change
```

## New COS objective-outcome service

File:

- `saas/lib/ai/cos/councilObjectiveOutcome.ts`

It provides:

- exact correlation extraction for `incident_id`, `trace_id`, `execution_id`, `recovery_key`, and `deployment_id`;
- binding those identifiers to an existing Council session;
- validation and recording of objective outcomes;
- bounded fact extraction so arbitrary provider/tool payloads and secrets do not enter cognitive memory;
- deterministic classification:
  - explicit `verified=true`, `healthy=true`, or equivalent verification state → `success`;
  - explicit verification failure or execution failure → `failure`;
  - successful execution without an explicit verification predicate → `observed`.

Automatic source classes are restricted to:

- `deterministic_tool`
- `production_outcome`
- `authoritative_record`

Model/Council/LLM/consensus references are rejected as objective sources.

## Council correlation binding

`saas/lib/ai/cos/cosReasoner.ts` now calls `bindCouncilSessionCorrelations(...)` after a Council session is created.

The bind uses only stable identifiers already present in the governed reasoning prompt. It does not perform semantic or fuzzy matching.

This matters for Self-Healing because the diagnostic prompt contains the normalized `incident_id`. Later deterministic repair evidence can therefore be attached to the exact Council session that reasoned about the incident.

Failure to bind correlation does not fail the answer path; it only prevents later automatic correlation for that session.

## Self-Healing bridge

New file:

- `saas/self-healing-host/council-outcome-bridge.ts`

`saas/self-healing-host/native-autonomous-loop.ts` now sends actual Agent Gateway `execute` outcomes through this bridge.

Rules:

- `halt_for_approval` / staged PRs are governance state, not proof of repair, so they are not ingested as objective repair outcomes;
- an executed step with explicit read-back verification is recorded as `success` or `failure`;
- an executed step without explicit verification is only `observed`;
- only bounded verification facts are retained;
- the raw execution/provider payload is not copied into Council memory;
- a failure in the learning/outcome-write path does not block or roll back an otherwise governed repair.

The current system-owned observation-policy recovery is already a strong producer because it performs:

```text
trusted scheduler-derived target
→ optimistic DB write
→ separate DB read-back
→ rollback on mismatch
→ result.verified = true
```

That result can now become objective Council outcome evidence automatically.

## Database migration

Migration:

- `saas/supabase/migrations/20260815_cos_council_objective_outcomes.sql`

New Council session fields:

- `correlation_refs jsonb`
- `objective_outcome_count`
- `last_objective_outcome_at`

New table:

- `public.cos_council_objective_outcomes`

New service-role-only RPC:

- `public.cos_record_council_objective_outcome(...)`

Important behavior:

1. validates source/correlation/status;
2. rejects model/Council source references;
3. matches the newest Council session using exact `correlation_refs ->> key = value` only;
4. stores the objective outcome even when no Council session is found, so evidence is not discarded;
5. idempotency is enforced by source + source_ref + correlation;
6. increments a matched session's objective outcome count only on first insert;
7. does **not** mark the Council session `verified`;
8. does **not** update specialist credibility;
9. does **not** change answer confidence.

The existing `cos_record_council_verified_outcome(...)` remains the only path that can update specialist credibility, and it still requires explicit externally supported/refuted role verdicts.

## Regression coverage

Added:

- `saas/tests/cosCouncilObjectiveOutcome.node.test.ts`

It covers:

- exact incident/trace/execution correlation extraction;
- explicit deterministic read-back success;
- non-verified successful execution staying `observed`;
- explicit verification failure;
- rejection of model references as objective evidence sources.

The repository's legacy `npm test` command manually enumerates tests, so do not claim this test ran in CI unless the test runner is separately updated. The production build does type-check all imported runtime code.

## Known follow-on

The stale open PR #1173 contains an older Vercel deployment sweep, but it is not on current main and its production table/RPC were not applied at the start of this slice. Do not report that sweep as active.

The new provider-neutral objective-outcome ledger is the correct target for a future Vercel deployment verifier. When one is added, it should call `recordCouncilObjectiveOutcome(...)` with the real deployment id/state rather than inventing a separate learning system.

The next cognitive step after enough objective outcomes exist is **pre-registered machine-verifiable Council predictions**. Only those predictions should allow an automatic verifier to convert an objective outcome into per-role `supported`/`refuted` credibility evidence.
