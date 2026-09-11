# University execution receipts: no-op rejection

Date: 2026-09-11. Companions: ONBOARD.md and SKILLS.md.

## Defect and scope

The live receipt mapper previously dropped the runner payload. Successful, enabled, current-commit scheduler receipts could therefore appear verified even when their payload explicitly said dailyCadence=not_due and runnerInvoked=false. These receipts are useful scheduler observations, not academic execution proof.

The pure receipt contract now carries the original executionEvidence. Both per-path and aggregate evaluation apply the same execution, identity and time checks. Missing/malformed payloads, explicit no-ops, policy blocks and disabled/error results cannot verify a path. The four undergraduate academic lanes also require positive integral attempted counts and consistent fresh terminal outcomes; replayed already_complete results and duplicate or missing run identities are insufficient. A genuinely scored failure proves execution without becoming a passing grade. A real blocked graduation evaluation remains distinct from capstone execution or graduation.

This is an additional verification veto, not complete end-to-end proof of all 18 capabilities. Other lanes retain their existing invocation semantics after the new no-op/payload checks. It does not prove actual fine-tuning, graduate completion, improvement, practical success or retention. Further path-specific runtime acceptance remains required.

## Boundaries

No receipt is rewritten or inserted by this repair. No grade, credential, academic execution policy, residence date, cron cadence, model, migration or permission changes. The concurrent agent-bound independent-exam and Master's learning work on main is preserved. Tests use local synthetic fixtures only; no academic prerequisites or Production receipts are manufactured.

## Validation and release

Sixteen focused tests pass: ten new execution-receipt regressions, two live-mapper/owner-GET tests and four selected existing assurance/fine-tuning/real-world-learning tests. Seven new tests fail against the exact pre-change sources and all ten pass after the repair. Six changed source/test/script files pass Node syntax checks. Baseline and uploaded blob hashes were reconciled. This is a focused local source assembly, not a full checkout or full repository test run.

The existing GET-only test is scoped to the GET function rather than prohibiting the already-implemented, separately owner-gated fine-tuning approval POST. The approval implementation is unchanged. New receipt regressions are added to the existing Vercel test list without removing or duplicating any existing test registration.

Require current-head CI and Preview before merge. Then verify exact merged-commit deployment and real runtime receipts. CI, READY, authentication success or absence of newly awarded grades do not by themselves prove academic execution.
