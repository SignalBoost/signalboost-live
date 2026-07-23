# Mission 002 Phase 5: durable manual-review routing

Phase 5 replaces the transient `manual_review_routed` result with one durable `mission_manual_reviews` record. A record contains the mission/revision, decision and three Phase 4 fingerprints, an immutable `routed` status, bounded operator-facing title/summary, timestamps, and schema version.

`mission_route_manual_review` is a single `security definer` service-role RPC. In its database transaction it locks and reloads the mission, requires the exact revision, rejects terminal/canceled/failed/blocked missions, requires the exact approved policy outcome, checks both expirations, cross-checks the supplied decision and binding identifiers/fingerprints, and inserts idempotently. Unique binding and `(decision_id, mission_revision)` constraints ensure concurrent or replayed delivery returns the existing review rather than creating another.

RLS is enabled and `anon`/`authenticated` have no table privileges and no RPC execute grant. The TypeScript store invokes only the RPC for routing and provides a minimal `get` method; it exposes no review listing, approval, resolution, retry, update, or delete operation.

`NonMutatingMissionExecutor` retains its Phase 4 validation before calling the store. It publishes execution feedback only after routing succeeds, attaches `reviewId`, and suppresses duplicate feedback for the same binding in its process. Production execution remains disabled: routing neither invokes a provider nor repairs CI, GitHub, browser, shell, network, or production state. **Routing a failure to review does not repair the failure.**

Limitations: this phase deliberately has no review UI, approval workflow, resolution/retry action, remediation engine, or cross-process execution-feedback ledger. The durable database record is the idempotency boundary for review routing itself.
