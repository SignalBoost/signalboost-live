# University graduation: pending-remediation gate

Date: 2026-09-11. Companion: root ONBOARD.md, SKILLS.md and COS-UNIVERSITY-GRADUATION-PR2125.md.

## Verified prior Production execution

PR #2125 merged as `be0505b53f0729fc7006920d01a4c70409fd5990` and deployment `dpl_Fd5uYqscTsxyzEBxSXw1QgDodBb5` produced an actual Software Specialist graduation evaluation at `2026-09-11T19:30:09.499Z`.

The append-only `cos_university_learning_assurance_events` row is `866a680f-43ac-4b93-9b65-bde4d5759d74`, event key `5103a4beb685be2ace1a8a904dd553351b7af464155366a99a0c2b38063f7eff`, evidence hash `5df70b95bc96c445a26d59e8b8685eb8616cf8516899aae8e07b01d567024f47`, verifier `host_production_verifier`.

The enabled runner read three agent-owned assessments and returned `not_eligible`, `graduated=false`, `awardEligible=false` and no capstone or credential. Academic prerequisites and minimum residence were incomplete. This is successful execution of a blocked evaluation, not graduation, passed capstone, learned capability, or proof for a later deployment. The receipt expires on 2026-09-12 at the same time.

## Additional safeguard in this change

The graduation runner now reads unresolved undergraduate remediation through a service-only database function. Queued, studying and ready-for-exam plans from failure autopsy, operational weakness or recertification block a new capstone/award. Normal subject/language rotation and completed/superseded plans are excluded. Null undergraduate program keys are supported because that is the canonical legacy schema; other agents and graduate programs are excluded.

The complete count is authoritative; the diagnostic sample is limited to 25 IDs. Missing infrastructure, missing RPC, malformed responses or wrong agent/program scope fail closed. The host rechecks before issuance, and a database BEFORE INSERT trigger performs the final veto while sharing an agent-specific transaction lock with study-plan mutations. Non-READ-COMMITTED credential creation is rejected rather than relying on a stale transaction snapshot. Existing credentials stay immutable and exact-key duplicate handling is retained.

This is an additional veto, not a replacement for current academic evidence, independent scoring, residence, execution identity or credential uniqueness. Specialist capstones and specialist Master's workers remain explicitly deferred under #2125. No model, examiner, grade, plan status, runtime permission or academic credit is changed by this implementation.

## Validation and rollout boundary

Focused local assembly: 28 tests passed (12 remediation, 14 existing runtime-policy and 2 credential-key tests). Before integration, four new source/migration contract tests failed; after integration, all passed. The runner, modified script and new TypeScript files passed Node syntax checks. Existing source snapshots were reconciled against exact Git blob hashes; this was not a complete local repository checkout.

Apply the included additive database migration before deploying the dependent runner. Validate SQL behavior with rolled-back probe plans and denied credential attempts; never manufacture learner credits or assurance receipts. Full current-head CI and Preview must pass before merge. Confirm the exact merged commit in Production and collect a real route receipt; unit tests, SQL probes and READY status are not equivalent to that receipt.
