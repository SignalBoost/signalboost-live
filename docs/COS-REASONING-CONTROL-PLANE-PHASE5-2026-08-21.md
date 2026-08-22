# COS Reasoning Control Plane — Phase 5

Date: 2026-08-21

## Goal

Generate clean comparative evidence for the Phase 4 outcome learner without duplicating ordinary production traffic.

## What Phase 5 adds

- Owner-only `POST /api/admin/cos-reasoning-comparison`.
- Exactly two worker-role candidates per run.
- Exactly one private held-out capability case per run.
- Maximum two billable reasoner evaluations per run.
- Cache-disabled execution through the same full COS answer pipeline used by the existing private capability benchmark.
- Request-scoped role forcing via `AsyncLocalStorage`; ordinary production routing cannot see or inherit the override.
- Preflight reasoner probe before any scored comparison.
- Independent result audit rows in `cos_reasoning_comparison_runs` and `cos_reasoning_comparison_results`.
- Verified Phase 4 outcome evidence only when a turn id exists, local reasoning was actually invoked, and external AI was not invoked.
- No raw prompt or full answer persistence in the new comparison tables.

## How this teaches Phase 4

Each successful candidate execution already produces a `cos_reasoning_worker_metrics` row keyed by `turn_id`. Phase 5 then attaches the held-out score to `cos_turn_outcomes` only when the execution is valid local COS reasoning. Phase 4 joins those two sources and can derive a worker/model preference after enough independently verified evidence exists.

The comparison harness does not write weights or force a preference. The Phase 4 evidence floor still applies: at least two alternatives with at least eight verified outcomes each for the same problem class, plus the existing quality/efficiency margin rules.

## Comparing Qwen versions

Phase 5 intentionally does not allow a request body to swap the production model. That would create a second ungoverned provider-selection path.

Model comparison is still supported by the same data model:

1. Run a controlled held-out comparison on the current model and accumulate verified results.
2. During a governed model migration or staging evaluation, point the approved `LOCAL_AI_*` reasoner seam at the candidate model.
3. Run the same held-out case and worker roles again.
4. `cos_reasoning_worker_metrics.reasoner_label` records the actual model label for every turn.
5. Phase 4 compares the old and new model labels as separate candidates once both have sufficient verified evidence.

This is slower than an arbitrary per-request model override, but it preserves the COS independence and provider-governance boundary.

## Cost behavior

Comparisons are never scheduled and never triggered by normal user traffic. Each POST can issue at most two reasoner evaluations and is therefore intentionally billable. The endpoint GET response states this explicitly.

Estimated monetary cost continues to use the Phase 4 provider-neutral environment variables in effect for the model being evaluated:

- `LOCAL_AI_INPUT_COST_PER_MILLION`
- `LOCAL_AI_OUTPUT_COST_PER_MILLION`

When migrating models, update those values with the governed reasoner configuration so the newly recorded metrics use the correct pricing basis.

## Failure handling

- Preflight failure: run fails before any comparison outcome is attached.
- Candidate execution failure: audit result is stored, but no verified negative capability outcome is attached unless valid local execution occurred.
- External fallback: score may show failure, but it is not admitted as Phase 4 learning evidence.
- Missing durable outcome write: result is tagged `verified_outcome_not_recorded` and does not count toward the learning evidence floor.

## Example request

```json
{
  "caseId": "database-index-diagnosis-variant-a",
  "roles": ["primary", "critic"]
}
```

Use `GET /api/admin/cos-reasoning-comparison` to inspect active case ids, the server-suggested deterministic role, recent runs, and recent candidate results without revealing private held-out prompts.
