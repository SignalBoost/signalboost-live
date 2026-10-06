# Enterprise Phases 3–5: acceptance evidence gate

**Status: NOT CERTIFIED.** Green builds and merged migrations do not prove deployed isolation, ledger economics, or enterprise launch readiness.

## Phase 3 — tenancy and portability

Required independently recorded evidence:
- Two separate organizations with distinct University → Project → Experiment → Cohort → Artifact chains.
- Reject cross-organization references and unauthorized reads/writes, including direct SQL, API, storage, exports, logs, and telemetry.
- Exercise each privacy tier (PRIVATE, AGGREGATE_METRICS, RESEARCH_OPT_IN) across every data egress.
- Run the same approved job with buyer-owned compute credentials; prove credentials and artifacts do not cross tenants.
- Validate customer-owned deployment, rollback, and recovery in an isolated customer environment.

## Phase 4 — ledger and economics

Required independently recorded evidence:
- Run `saas/tests/sql/lab-credit-ledger-acceptance.sql` against a disposable database with all Lab migrations applied.
- Test simultaneous reservations, retries, over-budget attempts, partial capture/release, eligible platform-fault refunds, and replay conflicts.
- Demonstrate account and event reconciliation with actual provider receipts and measured token/compute/teacher costs.
- Show that a failed or canceled job releases unused reservations without charging another tenant.
- Verify immutable event history, role restrictions, backup/restore, and financial discrepancy alerting.

## Phase 5 — enterprise launch

Required independently recorded evidence:
- At least 2–3 private enterprise design partners; signed scope and acceptance evidence.
- Teacher-output and training-data rights clearance, retention, privacy and deletion terms.
- Tenant security review, independent penetration testing, recovery drills, audit logs, operational ownership, support and incident response.
- Legal/commercial approvals and documented launch/rollback decision.
- No self-service commercialization or marketplace launch until prior phase evidence is signed off.

## Evidence record

For every test: commit, migration versions, environment, timestamp, tenant IDs (redacted), actor authority, inputs, expected/actual outcome, artifacts/receipts, reviewer, and verdict. **Do not mark a phase certified without reproducible evidence.**
