# University Specialist-owned practice repair

## Observed defect

At 2026-09-12 03:04 UTC, all 20 persisted practice experiences assigned to
software-specialist named cos_local_reasoner as their execution source. The
Production worker unconditionally called COS, despite agent-scoped queue metadata.
Those rows are historical training records, not evidence of the Specialist's work.

## Repair boundary

Non-COS practice now uses the existing registered Software Specialist executor,
its configured model, and its own validated procedures. The worker validates the
learner/run/manifest/trace binding and hashes the actual reply before scoring.
Execution provenance is stored in the existing cognitive-experience evaluation.
Unknown roles, unavailable execution, changed identity, invalid bindings, and
storage failures cannot produce a successful practice result or invoke COS as fallback.

New Specialist skill keys and practice variants are execution-version scoped.
Queue recovery, claims, reconciliation, and owned-procedure loading use that same
scope; old COS-produced records remain unchanged and are not reused as new work.
Existing restudy requirements remain in force. COS retains its existing practice
identity, prompt, and limits. Default independent assessment prompts and limits
are unchanged. Rubrics, admission standards, and academic credit are unchanged.

## Atomic persistence follow-up

Review identified the repository's older COS-only atomic recorder. Direct
Production inspection then found an earlier unfenced recorder instead, with no
practice migrations in the migration history. The new
20260912034000_university_bound_practice_atomic_result.sql supersedes both:
queue-owned learner identity selects the exact locked study plan, current accepted
study is mandatory, non-COS execution and owned skill context are checked against
the registered role, and terminal failure reopens study in the result transaction.
The existing RPC remains service-only and its search path is empty. No historical
practice, assessment, credential or study record is rewritten by applying it.

## Verification and release boundary

The actual pre-repair executePractice function reproduces the defect under
injected I/O: one COS call for software-specialist where zero is required.
The patched function passes the same regression. Eleven focused tests cover
routing, role changes, invalid evidence, rubric failure, persistence failure,
queue identity, study revocation, and historical namespace isolation. The pure
execution modules also pass standalone strict TypeScript checking.

Old structural tests now check the new function signatures without dropping their
original ordering, SQL locking, failure, role restriction or no-credit assertions.
Two further tests guard the new atomic RPC. A separate SQL proof exercises fifteen
valid/invalid database cases and deliberately rolls back every fixture write.
That proof must actually run after schema application; its presence is not a pass.

Current-head CI and Vercel Preview must pass before merge. Production acceptance
requires the applied migration, new deployment-bound Specialist practice evidence,
and its own independently scored exam/remediation transition. None of these local
tests, SQL fixtures or successful deployments is academic attainment by itself.
