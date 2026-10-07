# iTMounts Lab enterprise acceptance register — 2026-10-06

Status: **NOT CERTIFIED**. This register is an evidence checklist, not a declaration of passing acceptance.

## Phase 3 — tenancy, portability, customer-owned infrastructure

- [ ] Execute `saas/tests/sql/lab-enterprise-adversarial-acceptance.sql` against a disposable migrated database and archive signed CI logs (cross-tenant parent and artifact denial).
- [ ] Demonstrate tenant-scoped identity/authority enforcement at **every API, queue, trace, export, learning, logging and storage boundary**, not just composite database foreign keys. Include malicious tenant A accessing tenant B's artifact, job, receipt and PRIVATE trace.
- [ ] Prove PRIVATE data and telemetry do not cross tenant boundary, AGGREGATE_METRICS exports contain only authorized anonymized statistics, and RESEARCH_OPT_IN is explicitly granted and revocable.
- [ ] Exercise customer-owned ComputeAdapter, TeacherAdapter and ToolAdapter under the existing Platform Harness: invalid signatures, cross-tenant capabilities, over-budget and self-granted authority must fail closed. Customer code must not execute in core control plane.
- [ ] Reproduce the same exact-artifact experiment on a clean portable deployment with customer-owned infrastructure; record dependency versions, secrets boundary, data residency, rollback, recovery and evidence hashes.

## Phase 4 — credit ledger and measured economics

- [ ] Run the SQL adversarial test, existing `lab-credit-ledger-acceptance.sql`, and `lab-experiment-budget-acceptance.sql` in CI on disposable PostgreSQL with the actual ordered migrations.
- [ ] Run **concurrent** same-key reservations and different-key competing reservations under real transactions; prove one capture and no overspend, and deterministic idempotency conflict on changed payload.
- [ ] Link actual provider/teacher/token/compute/evaluator receipts to captures. Prove unit conversion to microcredits against an approved immutable rate card; do not infer USD cost from credit amounts.
- [ ] Verify platform-fault-only refunds, customer-infrastructure unused reservation releases, partial captures, retry after network timeout, zero/negative rejection, append-only events, reconciliation and alerting on tampering.
- [ ] Validate invoice/shadow-price reconciliation with actual measured cost across at least one complete experiment; no invented margins or public charging.

## Phase 5 — private enterprise launch readiness

- [ ] Obtain independently reviewed security/tenancy penetration-test report and remediation closure; verify customer-controlled keys, data-use rights and teacher-output licensing.
- [ ] Conduct 2–3 **private design-partner** end-to-end factory pilots: creation → curriculum → distillation → training → independent evaluation → Builder Residency → graduation or legitimate rejection. Archive reproducible evidence for failures as well as successes.
- [ ] Prove portable installation, customer-owned compute, backup/restore, upgrade/rollback, incident response and SLA observability with customer acceptance signoff.
- [ ] Complete commercial agreements, data processing/privacy terms, support runbooks, pricing backed by measured economics, and explicitly approved claims. Do not claim SOC 2/ISO certification without independent attestation.

**Release decision:** FAIL CLOSED until all applicable evidence is linked, independently reviewed and approved. Green build or migration presence alone is insufficient. Step 1 remains the customer-facing factory; Production workforce dispatch is a separate future project.
