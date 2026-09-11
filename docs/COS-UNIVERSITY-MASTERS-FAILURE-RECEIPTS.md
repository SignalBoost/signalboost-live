# Master's study: failed invocation receipts

Date: 2026-09-11. Follow-up to PR #2135 and COS-UNIVERSITY-AGENT-MASTERS-LEARNING.md.

A review found that exceptions during registry enumeration or scheduling returned HTTP 500 without a negative assurance receipt. When the receipt database remained writable, this could leave a previous successful receipt as the path's latest evidence.

The authenticated route now makes one bounded attempt to record invocationSucceeded=false in its catch path. Host-captured failurePhase identifies registry, scheduling or assurance failure, and runnerInvoked records whether a worker was dispatched. Unknown partial acquisition is deliberately not described as false or complete. A receipt-write failure never retries study, changes grades, or hides the original HTTP 500; if the failure ledger is also unavailable, the secondary error is logged. No claim of a persisted receipt is made without a successful write.

Authentication remains before every registry and ledger action, so unauthenticated callers cannot poison assurance status. Returned worker errors keep their existing single negative receipt. No admission, enrollment, academic score, credential, cadence or runtime authority is changed.

Six additional tests execute the actual checked-in GET route with isolated host ports. Combined with the thirteen agent-learning tests, 19 focused tests pass. Four new regression tests fail against the previous route and pass after this fix; source syntax checks pass. These tests use no live database, provider or academic fixture. Full current-head repository checks and Preview remain required before merge.

Production READY, old receipts, and these local tests do not prove that a failure occurred or was recorded by this new code in Production. Verify the exact deployed commit and actual path evidence separately. Do not corrupt registry data, fabricate failure events or bypass academic gates to create a receipt.
