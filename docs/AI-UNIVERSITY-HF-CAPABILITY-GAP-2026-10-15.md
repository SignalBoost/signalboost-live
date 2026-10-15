# iTMounts AI University — Hugging Face capability-gap audit (2026-10-15)

Scope: customer-facing **iTMounts AI University LAB**, not internal COS Foundational Learning, the owner University governance backend, a clone of Hugging Face Hub, or certification of customer models. This is a **source-code audit**, not production proof. Respect root ONBOARD.md, especially the public launch handoff, owner BYOI contract and explicit paid-work gates.

## Existing customer capability (do not rebuild)

- Dedicated customer entry and automatic workspace provisioning: `saas/app/university/start/UniversityStartContent.tsx`, `saas/app/dashboard/cos-university-telemetry/LabCustomerTrainingPanel.tsx`.
- Capability-tagged teacher and training provider catalog, with Hugging Face Jobs, Together fine-tuning and Fireworks SFT as training connectors: `saas/lib/ai/cos/labCustomerProviderCatalog.ts`, `labCustomerProviderTraining.ts`.
- Provider/model selection, secure key workflow, customer-billing acknowledgment, upload/generation of examples and free/open-source topic generation: `LabCustomerTrainingPanel.tsx`.
- Dataset normalization and deduplication (exact item hash and prompt identity), bounds and manifest digest: `saas/lib/ai/cos/labCustomerTraining.ts`.
- Job polling, cancellation, terminal state and artifact download: customer training UI and `saas/app/api/lab/training/{route.ts,download/route.ts}`.
- Internal University has separate immutable artifact identity, baseline/holdout evaluation and Residency policy; **do not label these automatically available to an ordinary customer LAB run without verifying its authorization and data paths**.

## HF-inspired product candidates: incremental gaps and acceptance criteria

| Candidate | Source-level disposition | Smallest worthwhile increment | Required proof |
| --- | --- | --- | --- |
| Smart Training Advisor | **Missing in customer LAB**: method is implicit/provider-dependent; Together/Fireworks executor currently fixes one epoch and LoRA-oriented settings. | Read-only, transparent recommendation based on dataset size, task, provider-supported methods and model compatibility; no autonomous paid action. | Explains unsupported cases; never changes selected provider, costs or recipe without approval; 11-language copy. |
| Side-by-side Model Comparison | **Not found in inspected customer training panel/routes**; internal independent holdout evaluation does not equal customer comparison UI. | Evaluate baseline and exact trained artifact on customer-selected fixed prompts, preserve comparable scored results. | Same prompts/evaluator version, exact model identities, tenant-safe saved results; no fake gain claims; provider charges disclosed. |
| Training Recipe Library | **Partially available as fixed back-end recipes**, not customer-configurable. | Provider-validated presets (beginner/low-cost/quality), with recipe persisted with artifact and bounded configuration. | Provider allows every offered control; rejects incompatible model/hardware/settings before paid submission. |
| Dataset Quality Assistant | **Partially present**: parse, normalization and dedup; no surfaced preflight report for malformed lines, duplicate prompt conflicts, holdout leakage, source-rights review. | No-cost preview reporting valid distinct examples, invalid rows, exact/prompt collisions, length warnings and rights reminders before paid work. | Works consistently for examples/teacher/open-source routes; no raw customer dataset leaked to analytics; preview never overrides server validation. |
| Model Passport / Registry | **Internal provenance exists; customer download exists**, but no customer-readable, verified cross-provider passport established by this audit. | Show model/revision, parent, provider, dataset digest, recipe, independent evaluation availability and precise artifact download links from server-owned records. | Cryptographically or server-verified fields only; distinguish 'not evaluated' from 'passed'; permission checks for every artifact. |
| Scheduled Improvement | **Backend University cron exists**, but customer-authorized recurring retraining not established; owner explicitly prefers deliberate experiments. | Start with scheduled **evaluation/reminder only**, not unattended external spend or model replacement. | Explicit opt-in, fixed scope, cancellation, revocation, provider quota and credit controls; no default recurring paid calls. |

## Suggested sequence

1. **No-cost dataset preflight** in the existing customer LAB, building on the current parser. It is visible, low-risk and reduces predictable failed paid training jobs.
2. **Model passport and baseline comparison** using actual customer job records, only after verifying artifact lineage and model access. Customer can see whether training helped.
3. **Provider-specific training recipes / advisor**, exposing only executable methods. Favor small approved presets before arbitrary hyperparameters.
4. **Scheduled evaluation** last, with user-controlled authorization. Never silently retrain or bill.

## Commercial release guardrails

No new provider integration or GPU hosting required for these upgrades. Customers keep provider and compute accounts, external charges stay separate from iTMounts credits, Supervisor cannot repair external customer infrastructure. No new certification requirement. Do not advertise success based on a completed job. No production rollout / paid work before the ONBOARD.md purchase, credential, region/tenant, idempotency, recovery and exact-deployed-revision acceptance checks are met.

## Status

Audit recommendations only. Feature code and production acceptance are **not** implemented by this document. Check the current branch before implementing each item: simultaneous LAB work may have advanced since this read.
