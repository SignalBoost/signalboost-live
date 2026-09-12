# University response-feedback disclosure boundary

This corrects the feedback projection described in
`docs/COS-UNIVERSITY-RESPONSE-FEEDBACK-20260912.md`; the existing response-limit disclosure,
canonical examination cases, independent scorer and numeric limits are unchanged.

## Observed defect

PR #2150 merged as `c63a544ab191036b1d58af01e09211565330baa1` and its exact Production
deployment `dpl_87Nx94D2rJzUj7TvnHyG8Cq9BbYR` is READY. The final review identified that
length coaching still treated historical undisclosed ceilings as learner mistakes.
Read-only Production checks on September 12 at 14:47 UTC confirmed that the Specialist's
failed examination `cac380db-e46f-4435-bafc-e84aab2d1219` had no responseContract in its
matching host assessment, but its active remediation objective already contained the
host-added instruction to obey a stated word limit. COS's historical law assessment also
lacked disclosure evidence. These are not proof of ignoring a disclosed instruction.

## Corrected behavior

The host adapter reads the exact agent/run and the matching independent host assessment.
It projects only responseContract, trace/source identity and assessment metadata; it never
loads the complete assessment evidence, hidden case, expected concepts or answers.
Length coaching requires the recorded `university_response_contract_v1`, a positive integer
word ceiling, whitespace-token counting, entire-response scope, and matching agent,
assessment key, source reference, trace, response source, authority and failed outcome.

A verified matching historical assessment without the contract yields
`response_contract_unverified`, not a learner length weakness. That category withdraws
only the exact previously appended host coaching suffix. The existing planner applies
its same-agent/source/old-objective and queued-or-studying update guards. Subject work,
remediation state, accepted study evidence, attempts, grades and history are preserved.
Ready, completed, superseded, concurrently changed or owner-amended objectives are not
rewritten. Missing rows, malformed observations and failed reads yield unknown and
preserve existing guidance rather than confusing infrastructure failure with nondisclosure.

No new migration, privileged endpoint, authority, provider or direct Production data edit
is introduced. The scheduled planner performs any eligible objective correction normally.
The historical failed examinations remain failed; no backfilled contract or rescoring.

## Verification

Reconstructed baseline helper, adapter and feedback tests match their original Git blobs.
The same nine new disclosure regressions produced 1 pass / 8 failures on baseline and
9 passes / 0 failures on the repair. The isolated feedback suite, including all nine
pre-existing feedback tests and three new actual-planner cases, passes 21/21 with no skips.
The actual adapter and planner functions execute with injected database I/O in these tests.
The pure helper passes strict TypeScript checking and changed runtime/tests pass Node
syntax checking. All four uploaded source/test blobs match the tested bytes.

The existing mandatory post-remediation gate imports the feedback suite, which preserves
its response-contract test import and now imports the additional disclosure cases.
Local isolation excludes the unchanged response-contract suite; full repository CI and
Preview must execute it before merge. Local proof is not Production acceptance.

After green expected-head integration, verify exact Production and a scheduled correction
of the historical active objective. A fresh disclosed-limit examination and successful
academic progression remain separate requirements; no degree or mastery is claimed here.
