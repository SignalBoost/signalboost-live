# LAB staging verification kit (for Customer-LAB-training-patch v6)

Run on a machine that has `bash`, `psql`, `curl`, `node` (18+), `git`, `zip`, and optionally the `supabase` CLI.
**Use staging only.** The scripts refuse URLs that contain "prod".

## Rules this kit enforces
- **Secrets are never collected or saved.** Database URL, service-role key and customer passwords are read from environment
  variables in your shell only. They are never written to disk or printed. Every output goes through a filter
  that removes keys, tokens and passwords before saving. `05-report.sh` checks everything again and stops if anything
  looks like a key.
- **Customer keys never pass through this kit.** The test customer types their own teacher API key and Hugging Face token
  into the LAB page (see `CUSTOMER-KEYS-IN-LAB.md`). The kit only sees IDs and metadata.
- **Database setup is separate from paid execution.** Scripts 00–03 make no provider or Hugging Face calls. Only `04-paid-run.sh`
  spends money. It refuses to start unless the approved total, approver and approval reference are set, and you type the
  approved amount by hand. It also refuses if platform keys (`OPENAI_API_KEY`, `HF_TOKEN`, …) are set in the shell.
- Each check is recorded as **passed**, **failed** or **unverified**. Anything not run shows as unverified in the report.

## Order
| Step | Script / action | Costs money? |
|---|---|---|
| 1 | Merge v6 files at their repository paths, deploy to staging, `export REPO_DIR=...` | no |
| 2 | `./00-preflight.sh` (records commit SHA, checks v6 file fingerprints, app and database reachable) | no |
| 3 | `./01-db-setup.sh` (migrations, two disposable customers A and B, workspace created twice → same workspace) | no |
| 4 | `./02-rate-card.sh` (one verified price, entered by a person from the provider's pricing page) | no |
| 5 | Customer A signs in to LAB and connects their own keys, then creates an experiment (artifact) → `CUSTOMER-KEYS-IN-LAB.md` | no |
| 6 | `./03-free-checks.sh` (connection, encryption, cross-tenant, Supervisor, budget refusals) | no |
| 7 | Get written approval for the total test budget | — |
| 8 | `./04-paid-run.sh` (teacher generation → training → progress → download → revocation) | **yes, customer A's own credit only** |
| 9 | Manual LAB checks with `./record.sh` (see CHECKLIST.md) | no |
| 10 | `./05-report.sh` → `evidence/REPORT.md` + evidence ZIP (excludes state.env) | no |
| 11 | `./90-cleanup.sh`, then revoke the test keys at each provider | no |

## Environment variables
Non-secret (fine in a file): see `config.example.env`.
Secret (set in your shell only, e.g. `read -rs STAGING_DB_URL; export STAGING_DB_URL`):
`STAGING_DB_URL`, `STAGING_SERVICE_ROLE_KEY`, `CUSTOMER_A_PASSWORD`, `CUSTOMER_B_PASSWORD`.
Pick throwaway passwords. They exist only to sign the two disposable customers in.

## What to send back
`evidence/REPORT.md` and the `staging-evidence-*.zip`. Both are already cleaned. Do **not** send `evidence/state.env` (it holds internal IDs only, but there's no need to share it).


## Corrected kit (2026-10-11)
Use this version in place of the original kit. Local checks do not prove staging readiness.
- Configure all four explicit staging allowlist values in config.example.env. Review the actual project reference, application origin and database host before setting them; never use production values.
- Apply only the intended migrations through your normal secure staging deployment process FIRST. Step 01 verifies versions; it no longer runs bulk supabase db push.
- Python 3 is required. API/password/service-key handling uses Python in-process requests, without secrets in command arguments. Database passwords use libpq environment configuration; do not run under shell tracing. Environment access by privileged local processes is still possible.
- Step 04 supplies 20 unique prompts by default and refuses fewer than 20 or more than 128 before a paid request. It requires a successful nonempty file manifest and successful size checks for every file. It does not independently prove hashes or provider invoices.
- Repository HEAD is recorded as REPO_SHA. DEPLOYED_REVISION remains unverified until independent deployment evidence is supplied; local HEAD is not the deployed revision.
- Invalid 400 responses no longer count as proof of cross-tenant denial. Supervisor/runtime isolation still requires live evidence.
- Existing redaction patterns are a backup, not a guarantee. Exact configured secret values are scrubbed too. Inspect reports before sharing. No secrets are written to config.example.env.
- Run local checks: python3 tests/test_safety.py
No staging operations or paid provider calls were performed while preparing this kit.
