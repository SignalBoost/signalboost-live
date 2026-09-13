# P0 — Production undergraduate acceptance

Date: 2026-09-13
Status: implementation pack, read-only
Scope: undergraduate University paths on the exact live Production commit and deployment

This increment does not teach, grade, admit, fine-tune, merge, or deploy.
It classifies whether undergraduate learning paths already have host-verified
Production execution receipts. Missing receipts stay missing.

## Why this is P0

Architecture for study, practice, exams, A-range, languages, Master's, PhD,
and fine-tuning is ahead of live proof. Later gates read this ledger.
A green Preview or a receipt from a previous commit is not acceptance.

## In-scope paths

| path_id | feature flag |
| --- | --- |
| `registered_agent_cycle` | `COS_UNIVERSITY_AUTONOMOUS_AGENT_CYCLE_ENABLED` |
| `continuous_learning` | `COS_UNIVERSITY_CONTINUOUS_ENABLED` |
| `deliberate_practice` | `COS_UNIVERSITY_PRACTICE_ENABLED` |
| `independent_exams` | `COS_UNIVERSITY_EXAMS_ENABLED` |
| `subject_a_range_evidence` | `COS_UNIVERSITY_A_RANGE_ENABLED` |
| `language_a_range_evidence` | `COS_UNIVERSITY_A_RANGE_ENABLED` |
| `delayed_retention` | `COS_UNIVERSITY_RETENTION_ENABLED` |
| `graduation` | `COS_UNIVERSITY_GRADUATION_ENABLED` |

Out of scope until those eight verify on the same commit and deployment:

- `masters_*`
- `phd_*`
- `controlled_fine_tuning`

## Acceptance predicate

A path is `verified` only when all of the following hold:

1. `VERCEL_ENV=production`
2. receipt `commit_sha` equals `VERCEL_GIT_COMMIT_SHA`
3. receipt `deployment_id` equals `VERCEL_DEPLOYMENT_ID`
4. `verifier = host_production_verifier`
5. `expires_at` is in the future
6. evidence `featureEnabled === true`
7. evidence `invocationSucceeded === true`
8. `universityProductionExecutionBlocker(path, evidence)` returns `null`

Academic paths (`independent_exams`, `subject_a_range_evidence`,
`language_a_range_evidence`, `delayed_retention`) additionally require a
fresh scored attempt. A genuine fail still proves execution. Skip, idle,
`not_due`, and `runnerInvoked=false` do not.

## Files in this pack

Copy these onto the matching paths in `signalboost-live`:

```
docs/P0-PRODUCTION-UNDERGRAD-ACCEPTANCE.md
saas/lib/ai/cos/cosUniversityUndergraduateAcceptance.ts
saas/app/api/cron/cos-university-undergrad-acceptance/route.ts
saas/tests/cosUniversityUndergraduateAcceptance.node.test.ts
saas/scripts/p0-production-undergrad-readout.sql
```

## Operator sequence

1. Merge this pack. Do not enable new University feature flags to manufacture proof.
2. On Production, call
   `GET /api/cron/cos-university-undergrad-acceptance`
   with `Authorization: Bearer $CRON_SECRET`.
3. Optionally run `saas/scripts/p0-production-undergrad-readout.sql`
   bound to the live commit and deployment.
4. Classify each path. Repair idle or crashing runners. Do not insert ledger rows.
5. Wait for the next genuine cadence. Re-query.
6. Done when `accepted === true` and at least one academic path has a scored attempt.
7. Only then open the Master's exam worker.

## Non-goals

- Do not enable `COS_UNIVERSITY_TRAINING_EXECUTOR_DISPATCH_ENABLED`.
- Do not lift Master's admission deferral.
- Do not add specialist families.
- Do not write `cos_university_learning_assurance_events` from this route.
- Do not treat English-only exams as language A-range.

## Definition of done

- Eight undergraduate paths `verified` on the current Production commit and deployment.
- At least one academic path contains a scored attempt (`passed` or `failed`).
- No row was inserted by hand.
- ONBOARD records the exact deployment id, commit, and observation time after
  the evidence exists, not before.
