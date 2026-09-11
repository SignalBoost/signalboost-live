# University graduation runtime — PR #2125 repair

Date: 2026-09-11
Base: 040ef411b7f18fa23e62c068a341d23726580da1

This supplements the current root ONBOARD.md and SKILLS.md. It is implementation documentation, not Production acceptance.

Graduation evaluation reads each registered agent's own enrollment, academic evidence, capstones and credential. Subject/language, retention and minimum-residence rules remain unchanged. Hourly scheduling rotates the starting identity using the absolute hour, preserving one agent batch per invocation and preventing one persistent failure from starving later agents.

The existing capstone executor is COS-only. This repair does not pretend that changing a database agent_id changes the executing learner: non-COS execution, capstone creation and new credential issuance fail closed with agent_capstone_runtime_unavailable. Non-COS capstone rows are not accepted as fresh execution evidence. A genuine agent-bound executor and verifiable agent provenance are still required before enabling specialist capstones; no such support or degree completion is claimed here.

Master's workers are also COS-only. The graduation route explicitly defers non-COS admission with agent_masters_runtime_unavailable instead of creating an enrollment no worker can consume. Disabled or failed graduation cannot invoke admission. Existing COS same-tick admission is preserved. This is a deferral, not completion of specialist graduate education.

Missing database access throws instead of becoming empty successful evidence. Capstone execution errors, in-progress runs and failed claims propagate as errors rather than successful Production-path receipts. Credential issuance requires both a persisted credential and a verified read-back before reporting credential_awarded. Legacy COS keys and duplicate-safe inserts remain intact; no schema, feature flag, residency date or authority is weakened.

The repair includes targeted runtime-policy regressions and the Preview test-gate entry. The branch integrates current main without discarding the concurrent Guardian changes and updates the shared main-write token and exact PR acknowledgements. CI, Preview and exact-merged-commit Production execution remain separately verifiable release gates. Do not infer learning, degrees or Production receipts from these tests.
