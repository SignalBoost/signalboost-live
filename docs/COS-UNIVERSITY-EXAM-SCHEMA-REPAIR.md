# University independent-exam schema repair

## Observed Production blocker — 2026-09-11

At 22:03:37 UTC, Production Supabase had neither `agent_id` nor `execution_provenance` on `cos_university_exam_runs`. Migration `20260911235500` was not applied. Its checked-in constraint referenced `agent_id` without creating it, so applying the original migration could not supply the deployed bound-exam runner's required schema.

The verified application deployment was `dpl_BcEhhhgLuiN4V21HagFujbUzqxk2`, commit `779286d163962d090745195ae9761f344db65fdd`. Its 22:02 agent-cycle receipt reported zero independent exams and the Software Specialist in remediation. The database had three historical Specialist exam failures sourced from `local_cos_reasoning`; these are not evidence of the Specialist's own execution. No new Specialist assessments had been written since 20:40 UTC and no credentials existed.

## Repair boundary

The previously unapplied migration now creates generated exam ownership from the host-generated `run_key` before the provenance constraint references it. Explicit agent namespaces are preserved; only the recognized pre-multi-agent daily key grammar maps to legacy COS. Malformed identities fail closed. The generated column cannot be independently supplied with a contradictory agent label.

Existing provenance checks, role/agent/run/turn/manifest binding, local execution requirements, RLS and grants are unchanged. Existing academic records, study plans, enrollment/residence and credentials are not rewritten. Derived ownership metadata does not manufacture execution provenance or validate historical borrowed answers. No academic runner is unblocked by this patch.

## Validation before application

- Exact baseline migration blob: `a25a1bb60a0ce7dd5521168ece6ca453a81e4099`.
- Three focused migration regressions: two fail on the baseline; all three pass on the repair.
- The new suite is imported by the existing registered academic-execution-policy suite; its existing assertions remain unchanged.
- Ten read-only PostgreSQL identity-expression cases passed, including legacy COS, Specialist remediation and malformed keys.
- The exact expression recognized all 20 existing exam keys: 17 COS, including six legacy daily keys, and three Specialist keys. No evidence was mutated by these checks.

These are schema/predicate checks, not academic results, full-repository test coverage or Production execution receipts. Required current-head CI and Preview remain mandatory before merge. Recheck the live schema/migration history before application, then verify the generated-column definition and reject invalid bindings with rollback-only probes. Do not manufacture study prerequisites, change cadence or award credit to obtain runtime proof.

The separate subject A-range schema and actual eligible Specialist execution still require their own verification. Record post-application and exact-deployment findings in the PR release notes rather than claiming them from these preflight checks.

## Preview dependency reconciliation — 2026-09-11

Vercel Preview `dpl_CLyfYxPYF8CgiNvoXveBF3A4Bhay` failed on PR head `b94251a7bb00e8eccf957503b77d2d15aeca7a2e`: the existing language academic-execution test expected a bound executor that was not yet present in that head's language runner. The newer main commit `1784f0975acf72c4c383ac1cb67ebe68e18d4748` supplies that implementation. Reconcile it into the task branch rather than deleting or relaxing the assertion.

The exact failing language wiring assertion was reproduced locally against baseline blob `07763654b5689b01726a08b59dc1d4260afabfe0` (one failure), then passed unchanged against main's language runner blob `4ea47e7610f1a3ee92e8058937848c37d7a3a93f`. Both assembled source hashes were verified; the new source also passed Node TypeScript syntax checking. This is one focused source-contract test, not a full local checkout, end-to-end learner execution or database migration proof.

The merge preserves current main's language implementation byte-for-byte, all existing test assertions, and this PR's original independent-exam schema repair. The integration token must name the reconciled main SHA. Current-head CI and Vercel Preview remain required before integration; no Production data or academic records were changed by this dependency repair.
