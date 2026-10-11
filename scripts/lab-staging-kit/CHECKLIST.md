# Staging checklist

Status for each check: **passed / failed / unverified**. Scripts record most checks themselves. Use `./record.sh` for the ones marked *manual*.

## A. Deployment (00)
- [ ] PREFLIGHT_CLEAN_TREE: deployed commit has no local changes
- [ ] PREFLIGHT_V6_FILES: all 22 v6 files match `v6-fingerprints.txt` (run from the repo root)
- [ ] PREFLIGHT_APP_UP, PREFLIGHT_DB_REACHABLE

## B. Database setup, no paid calls (01–02)
- [ ] DB_MIGRATION_20261009001500 / 20261012000000 / 20261012010000 applied
- [ ] DB_DISPOSABLE_CUSTOMERS: customers A and B created
- [ ] WORKSPACE_IDEMPOTENT: creating the workspace twice returns the same workspace
- [ ] WORKSPACE_SINGLE_MEMBERSHIP
- [ ] RATE_CARD_ACTIVE: one verified price with source link, verifier and date
- [ ] RATE_CARD_LOCKED: app roles cannot read or change prices

## C. Customer connects own keys (manual, LAB)
- [ ] ARTIFACT_CREATED *(manual)*
- [ ] UI_KEYS_NOT_SHOWN *(manual)*

## D. Free checks (03)
- [ ] PROVIDER_CONNECTED, PROVIDER_LIST_NO_SECRETS, CREDENTIALS_ENCRYPTED
- [ ] XTENANT_READ_PROVIDERS, XTENANT_READ_TRAINING, XTENANT_START_DENIED
- [ ] SUPERVISOR_DB_EXCLUDED, SUPERVISOR_CODE_EXCLUDED
- [ ] SUPERVISOR_MASTER_KEY_ISOLATION *(manual)*: confirm Supervisor's runtime has no `VAULT_MASTER_KEY` and no database-owner
      login. Known open gap: the database owner plus that key can still decrypt.
- [ ] BUDGET_CEILING_REFUSED: teacher budget above the approved total refused before any call
- [ ] BUDGET_UNPRICED_REFUSED: model without a verified price refused

## E. Paid run, approval required (04)
- [ ] BUDGET_APPROVED: total, approver and reference recorded before anything starts
- [ ] TEACHER_GENERATION
- [ ] BUDGET_RESERVED_BEFORE_SUBMIT: reservation, stage token and job name saved; committed cost within approval
- [ ] TEACHER_SPEND_RECORDED, TEACHER_SPEND_MATCHES_INVOICE *(manual: compare with the provider's usage page)*
- [ ] PROGRESS_VISIBLE, TRAINING_COMPLETED
- [ ] ARTIFACT_DOWNLOAD (sizes match; server checks fingerprints), DOWNLOAD_NO_PRIVATE_LINK, XTENANT_DOWNLOAD_DENIED
- [ ] CREDENTIAL_REVOCATION, CREDENTIAL_REVOKED_ROW, CREDENTIAL_HIDDEN_AFTER_REVOKE
- [ ] NO_GRADUATION_FOR_ACCESS: training and download worked with no graduation or certification step
- [ ] HF_JOB_BILLED_TO_CUSTOMER *(manual)*: the job appears in the **test customer's** Hugging Face billing, not the platform's

## F. Interface (manual)
- [ ] UI_PANEL_TRANSLATED: switch the site language to Spanish, Portuguese and Arabic. The panel text changes, and Arabic reads right-to-left.
- [ ] UI_PROGRESS_SHOWN: the panel shows the stage moving and a download button when training is done

## G. Optional (more cost, separate approval)
- [ ] CRASH_RECOVERY: stop the app right after "Start" is pressed. On restart, **Check status** reconnects to the same job, and no second job is billed.
- [ ] OVERRUN_BLOCK: only with a deliberately tiny budget. After an overrun, the run shows blocked and further starts are refused.

## Ready?
Only if every row in `REPORT.md` is **passed**. Local unit tests (42/42) are not part of this report.
