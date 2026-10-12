# Phase 1–5 LAB launch acceptance — evidence-first

Use the existing `00`–`05` staging-kit workflow without overwriting it. Scripts `06`–`09` are *additional* checks. They use the existing shell helpers and their staging allowlist; do not execute against production. Every check is **passed**, **failed**, or **unverified**. An HTTP success, presence of a database column or green build alone is not launch evidence.

## Execution order

1. Configure all four explicit staging allowlist values, including project ref and preview origin. Verify no production credentials are selected.
2. Run `00-preflight.sh`, `01-db-setup.sh`, `02-rate-card.sh`, the customer-key setup, then `03-free-checks.sh`.
3. Only with distinct, explicit approved customer provider spend, run `04-paid-run.sh`.
4. Run `06-artifact-integrity.sh`, `07-credit-accounting.sh`, `08-factory-acceptance.sh`, `09-commercial-readiness.sh` and `05-report.sh`.
5. Preserve the redacted report; compare deployed revision to repository commit. Inspect evidence manually before sharing and clean up disposable customers.

## Phase 1
- Repeated unattended University orchestrator/evaluator/Residency runs, recovery from interrupted jobs: FACTORY_RUNS_SURFACE, FACTORY_RECOVERY, ORCHESTRATOR_EVALUATOR_RESIDENCY.
- Customer A and B independently complete authorized signup, workspace, BYOK, training, download, retraining and isolation: TWO_CUSTOMER_ACCEPTANCE, RETRAINING.
- Experiment and exact artifact lineage: LINEAGE_RECORDED.

## Phase 2
- Deterministic artifact manifest and actual downloaded-byte digest comparison: ARTIFACT_IDENTITY_DETERMINISTIC, ARTIFACT_HASH_RECORDED, ARTIFACT_DOWNLOAD.
- Independent signature validation, rejected evaluation sample and privacy rollback: ARTIFACT_BIRTH_CERTIFICATE, EVALUATION_GATE, PRIVACY_ROLLBACK.

## Phase 3
- Cross-tenant credential, run, storage and export denial; credential encryption and revocation: existing 01–04 customer checks. Regional routing requires separate EU-specific validation.

## Phase 4
- Authenticated concurrent reserve/capture/release, overrun block, true replay idempotency, fault refund and provider statement reconciliation: CREDIT_RESERVATION_ATOMIC, OVERRUN_RECORDED_AND_BLOCKED, DUPLICATE_CALLBACK_NO_DOUBLE_CHARGE, SPEND_LIMIT_AFTER_BLOCK, PLATFORM_FAULT_REFUND, COST_RECONCILIATION.
- *Do not* send a stored stage-token hash as a callback token or treat an HTTP 404 as evidence of replay protection.
- Columns deployed on customer_training_runs include `teacher_reserved_usd`, `teacher_spent_usd`, `committed_max_cost_usd`, `stage_token_hash` and `spend_blocked_at`. The outdated names in the submitted archive are incorrect.

## Phase 5
- Terms, privacy, consent, provider/customer rights and unaided onboarding require human review; HTTP 200 proves reachability only.
- Validate actionable errors, exact production release/rollback and operational monitoring.
- Design partners are future commercial validation, not an external operating-permission authority.

**Launch gate:** all advertised user journeys and required security/spend/legal controls must have positive live evidence. Explicitly disable or label unverified capabilities. Do not claim certification from metadata or passing static scripts. Delete the temporary billable staging project once testing and evidence capture finish.
