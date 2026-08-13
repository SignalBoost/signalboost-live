# COS Retention & Consolidation Handoff — 2026-08-13

## Purpose

This increment extends the Optimus-style COS learning roadmap beyond initial practice/held-out validation. A skill must continue to work after time passes and after real-world use; historical success counters are not permanent competence.

North-star extension:

```text
experience
→ reflection
→ generalized skill
→ practice
→ independent holdout validation
→ delayed retention
→ production outcomes
→ strengthen / revalidate / weaken / quarantine
```

## Implemented in this branch

Branch: `feat/cos-retention-consolidation-20260813`

Canonical files:

- `saas/lib/ai/cos/cognitiveRetentionPolicy.ts`
- `saas/lib/ai/cos/cognitiveConsolidation.ts`
- `saas/lib/ai/cos/cognitiveProductionOutcome.ts`
- `saas/lib/ai/cos/cognitiveLearningLifecycle.ts`
- `saas/app/api/cron/cos-mining/route.ts`
- `saas/supabase/migrations/20260813_cos_cognitive_retention_consolidation.sql`
- `saas/supabase/migrations/20260813_cos_cognitive_retention_guard.sql`
- `saas/tests/cosCognitiveRetention.node.test.ts`

## Retention semantics

Default delayed re-test cadence:

- `validated`: 14 days;
- `learned`: 21 days;
- `mastered`: 30 days;
- `weakened`: re-check after 1 day.

The 30-day maximum aligns with the existing validation-freshness window. These are policy defaults, not claims about universal human learning intervals.

A delayed retention check may replay a previously independent holdout. This tests whether capability persists after time, but **does not** create a new unseen variant and therefore **does not increment holdout attempts, holdout successes, or distinct holdout breadth**.

One retention failure schedules a rapid confirmation check. Two consecutive retention failures weaken a currently validated/learned/mastered skill.

A successful delayed retention check refreshes validation time and clears `weakened_at`; the existing deterministic lifecycle evaluator can then restore only the strongest status still justified by the original evidence counters.

## Staleness / forgetting

The daily consolidation cycle marks a strong skill `weakened` when its validation freshness exceeds the configured 30-day window without successful retention evidence.

A weakened skill is excluded from the strong live-use statuses (`validated|learned|mastered`). Database guard logic makes weakened/quarantined states sticky: old historical counters cannot silently revive the skill while `weakened_at` or `quarantined_at` remains set.

## Production evidence and quarantine

`cos_record_cognitive_production_outcome(...)` records real verified production outcomes separately from practice/retention evidence.

Ordinary production failure and contradiction are not equivalent:

- one production failure: evidence only;
- two consecutive ordinary production failures: weaken a strong skill and force revalidation;
- explicit verified contradiction: quarantine immediately.

`contradiction=true` must only be supplied by a deterministic verifier, trusted operator/human judgment, or equivalently explicit evidence. Model disagreement alone is not a verified contradiction.

`recordVerifiedCognitiveProductionOutcome(...)` is the server-side helper for verified callers. Do not wire arbitrary model self-critique into the contradiction flag.

## Scheduler / cost control

No new Vercel cron was added. `runCognitiveConsolidationCycle()` is batched into the existing daily `/api/cron/cos-mining` job after active learning.

Default bounds per daily cycle:

- stale skills examined: 4;
- due retention checks scheduled: 4;
- retention checks executed: 2.

Environment overrides are bounded:

- `COS_COGNITIVE_CONSOLIDATION_ENABLED=false` disables the layer;
- `COS_COGNITIVE_STALE_SKILLS_PER_CYCLE`;
- `COS_COGNITIVE_RETENTION_SCHEDULE_PER_CYCLE`;
- `COS_COGNITIVE_RETENTION_CHECKS_PER_CYCLE`.

Retention replay uses the local/private COS reasoner. It does not require a frontier teacher and does not alter answer-confidence formulas.

## Database additions

`cos_cognitive_skills` gains retention/production persistence including:

- retention attempts/successes;
- consecutive retention failures;
- last/next retention timestamps;
- production failure streak;
- last production outcome timestamp.

New table:

- `cos_retention_checks`

New/updated RPCs:

- `cos_record_cognitive_retention_result(...)`
- `cos_record_cognitive_production_outcome(...)`

`cos_cognitive_experiences.experience_kind` now includes `retention` so delayed re-tests remain distinguishable from promotion holdouts.

## Non-negotiable evidence boundaries

- Retention replay is not new held-out breadth.
- Practice remains separate from held-out validation.
- Lifecycle status never directly raises answer confidence.
- A provider/model disagreement is not automatically a contradiction.
- Quarantine is stronger than weakening.
- Old counters cannot bypass an explicit weakened/quarantined state.
- A skill can recover from weakened only through fresh successful revalidation evidence that clears the weakened marker.

## Next recommended cognitive slice

After production-verifying this layer, implement **skill composition / transfer**:

1. represent prerequisites and compatible skill outputs explicitly;
2. retrieve multiple validated skills for a genuinely novel problem;
3. have COS construct a bounded composite plan without merging factual evidence with procedural guidance;
4. test the composite on unseen cases;
5. record whether composition succeeds more often than any one skill alone;
6. promote reusable composite procedures only after independent evidence.

That is the next step from individual learned behaviors toward a general digital worker that combines capabilities instead of memorizing benchmark answers.
