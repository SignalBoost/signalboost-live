# iTMounts Lab enterprise acceptance register — 2026-10-06

Status: **NOT CERTIFIED**. This register is an evidence checklist, not a declaration of passing acceptance.

## Phase 3 — tenancy, portability, customer-owned infrastructure

- [ ] Execute `saas/tests/sql/lab-enterprise-adversarial-acceptance.sql` against a disposable migrated database and archive signed CI logs (cross-tenant parent and artifact denial).
- [ ] Demonstrate tenant-scoped identity/authority enforcement at **every API, queue, trace, export, learning, logging and storage boundary**, not just composite database foreign keys. Include malicious tenant A accessing tenant B's artifact, job, receipt and PRIVATE trace.
- [ ] Prove PRIVATE data and telemetry do not cross tenant boundary, AGGREGATE_METRICS exports contain only authorized anonymized statistics, and RESEARCH_OPT_IN is explicitly granted and revocable.
- [ ] Exercise customer-owned ComputeAdapter, TeacherAdapter and ToolAdapter under the existing Platform Harness: invalid signatures, cross-tenant capabilities, over-budget and self-granted authority must fail closed. Customer code must not execute in core control plane.
- [ ] Reproduce the same exact-artifact experiment on a clean portable deployment with customer-owned infrastructure; record dependency versions, secrets boundary, data residency, rollback, recovery and evidence hashes.

## Phase 4 — BYOI experiment budget ledger and measured economics

**Commercial boundary (owner direction, 2026-10-08):** iTMounts licenses governed Lab software. Customers bring and pay for their own teacher APIs, compute, models and tools. The experiment microcredit ledger is an **internal budget/authorization-hold accounting mechanism**, not a prepaid iTMounts compute wallet, customer currency, guaranteed provider spend cap, or proof of iTMounts resale. It uses reserve → capture/release and eligible platform-fault refund events; do not relabel it double-entry. iTMounts does not need the owner's personal AI-provider invoices to certify customer BYOI functionality. Customer provider invoices remain customer-owned, and usage exports must honor the experiment privacy tier.

**Financial authority boundary:** A scoped customer-approved experiment budget limits execution initiated by the governed Harness; no provider receipt, customer adapter, model, or CI process can grant additional spending authority. Provider-side costs incurred independently of iTMounts, provider lag, billing adjustments, failed cancellation, and undisclosed minimums are outside a guaranteed external spend ceiling. Fail closed on missing rate approval, unverifiable usage provenance, mismatched tenant, changed receipt, or incomplete telemetry. Never imply that shadow microcredits are actual USD costs, that a customer's provider charges equal iTMounts software fees, or that synthetic receipts establish real financial reconciliation.

**Acceptance evidence (all applicable items must be independently verified):**

- [ ] Run the SQL adversarial test, `lab-credit-ledger-acceptance.sql`, `lab-experiment-budget-acceptance.sql`, and rate/provenance suites in CI on disposable PostgreSQL with actual ordered migrations; archive exact SHA and passing logs.
- [ ] Run **concurrent** same-key reservations and different-key competing reservations under real transactions; prove one capture and no overspend, deterministic idempotency conflict on changed payload, and cross-tenant isolation.
- [ ] Demonstrate one complete **customer-owned BYOI** experiment using an isolated test tenant and capped, test-owned provider/compute credentials (not the owner's personal provider account). Record adapter identity, job, provider/teacher/token/compute/evaluator measured usage and customer-controlled rate versions; preserve provider receipt references, source provenance and privacy controls. Reconcile captures with measured usage; do not infer USD cost from microcredits.
- [ ] Verify platform-fault-only refunds of eligible Lab credits, customer-infrastructure release of unused authorization, partial capture/release, retry after a network timeout, zero/negative rejection, append-only events, deterministic reconciliation, and detection of forged or unrated captures.
- [ ] Independently reconcile measured usage from the BYOI test adapter with provider usage/billing evidence **where that provider exposes such records**, or explicitly classify and surface absent/unverifiable provider evidence as uncertified. A complete experiment must have transparent terminal outcome, evidence hashes and an owner-reviewed cost discrepancy report. Never require iTMounts-owner personal provider bills; do not require reseller invoices in BYOI mode.
- [ ] Demonstrate that iTMounts license/subscription billing, if offered, is separately accounted for and cannot be represented as provider pass-through spend. Optional managed-provider/reseller mode requires a **separate future** rate-card, billing, contractual and financial acceptance gate; none is approved here.

**Gate:** Production BYOI financial certification remains **NOT CERTIFIED** until the live bounded experiment and independent evidence above pass. Green synthetic CI, schema existence, a preview deployment, or a PR merge alone is insufficient. No automatic public charging.

## Phase 5 — private enterprise launch readiness

- [ ] Obtain independently reviewed security/tenancy penetration-test report and remediation closure; verify customer-controlled keys, data-use rights and teacher-output licensing.
- [ ] Conduct 2–3 **private design-partner** end-to-end factory pilots: creation → curriculum → distillation → training → independent evaluation → Builder Residency → graduation or legitimate rejection. Archive reproducible evidence for failures as well as successes.
- [ ] Prove portable installation, customer-owned compute, backup/restore, upgrade/rollback, incident response and SLA observability with customer acceptance signoff.
- [ ] Complete commercial agreements, data processing/privacy terms, support runbooks, pricing backed by measured economics, and explicitly approved claims. Do not claim SOC 2/ISO certification without independent attestation.

**Release decision:** FAIL CLOSED until all applicable evidence is linked, independently reviewed and approved. Green build or migration presence alone is insufficient. Step 1 remains the customer-facing factory; Production workforce dispatch is a separate future project.
