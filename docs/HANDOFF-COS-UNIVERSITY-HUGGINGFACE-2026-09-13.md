# COS University Hugging Face Training Adapter — 2026-09-13

## Status

Implementation branch: `feat/itmounts-huggingface-training-adapter-20260913`.

This increment connects the existing governed COS University training-executor contract to Hugging Face Jobs while preserving every existing approval, evidence, and promotion boundary.

## What this adds

- `HF_TOKEN` can back an internal iTMounts Hugging Face Jobs executor without requiring a second manually copied provider credential.
- A separate HMAC callback key is deterministically derived from `HF_TOKEN`; the provider token itself is never used as a callback header value or emitted to logs.
- Explicit custom executor configuration still takes precedence over Hugging Face auto-wiring.
- The existing global `COS_UNIVERSITY_TRAINING_EXECUTOR_DISPATCH_ENABLED` flag remains fail-closed and is never enabled automatically.
- Every cost-bearing dispatch still requires the existing owner-authenticated per-request `confirmDispatch=true` intent.
- Dataset preparation accepts only explicit `hf://datasets/<owner>/<repo>[@revision]#<split>` source references and runs on CPU hardware by default.
- Training accepts only immutable/materialized Hugging Face dataset references produced by the governed partition path.
- The default training flavor is one L4 (`l4x1`) and remains configurable by environment policy before any paid run.
- The worker performs QLoRA/LoRA adapter training and reports only executor-owned evidence: partition manifests, trained artifact identity/hash, and rollback artifact reference.
- Independent evaluation, safety regression, unseen transfer, delayed retention, Production canary, and promotion remain controlled by their existing independent authorities.
- Models and prepared datasets are created private by default under the authenticated Hugging Face namespace.

## Cost boundary

This branch does **not** enable paid dispatch and does not launch a Hugging Face Job. Code/CI/Preview are non-training acceptance only.

A real run remains impossible until all of the following are true:

1. a genuine University fine-tune/distillation candidate exists;
2. an approved Hugging Face dataset source is attached to the candidate;
3. partition evidence is materialized;
4. host dataset/training approvals pass the existing controlled fine-tuning gate;
5. `COS_UNIVERSITY_TRAINING_EXECUTOR_DISPATCH_ENABLED=true` is deliberately configured; and
6. the owner explicitly confirms the individual dispatch request.

## Current Production evidence

At implementation time Production contains no active `fine_tune_candidate=true` study plan in `queued`, `studying`, or `ready_for_exam`, and no prior training-executor dispatch/artifact evidence. The adapter therefore cannot accidentally spend credits merely because `HF_TOKEN` and account credits exist.

## Training material boundary

Existing teacher-lesson rows are **not** silently reclassified as distillation data. Their current records do not carry explicit distillation training-rights/privacy assertions. This adapter therefore requires a separately governed, approved Hugging Face dataset source rather than manufacturing permission from historical lesson storage.

## Verification

Mandatory University fine-tuning regression imports `cosUniversityHuggingFaceJobs.node.test.ts`, covering:

- fail-closed installation;
- custom-executor precedence;
- derived-secret separation;
- strict Hugging Face dataset references;
- CPU-only preparation defaults;
- bounded L4 training defaults;
- token placement in encrypted Job secrets rather than plain environment values;
- owner confirmation, dispatch switch, signed callbacks, and executor claim separation.

No trained model, Production canary, or distillation promotion is claimed by this implementation increment.
