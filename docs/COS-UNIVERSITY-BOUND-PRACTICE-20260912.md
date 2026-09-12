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

## Verification

The actual pre-repair executePractice function reproduces the defect under
injected I/O: one COS call for software-specialist where zero is required.
The patched function passes the same regression. Eleven focused tests cover
routing, role changes, invalid evidence, rubric failure, persistence failure,
queue identity, study revocation, and historical namespace isolation. The pure
execution modules also pass standalone strict TypeScript checking.

These are local implementation tests, not a full repository build or academic
attainment. Current-head CI and Vercel Preview must pass before merge. Production
acceptance requires new deployment-bound Specialist practice evidence followed by
its own independently scored exam and correct remediation transition. No fixture
results, direct database score edits, or credentials are introduced by this repair.
