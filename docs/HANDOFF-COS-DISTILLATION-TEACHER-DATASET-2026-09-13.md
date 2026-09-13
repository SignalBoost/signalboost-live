# COS Distillation Teacher Dataset — Handoff

**Date:** September 13, 2026  
**Repository:** `SignalBoost/signalboost-live`  
**Public product:** iTMounts

## Current status

The governed distillation candidate is now real in Production for the Software Specialist's `reasoning_decision_science` remediation lane.

Production evidence at qualification time:

- unresolved failed unseen exams: **9**
- distinct unseen exam manifests: **9**
- later passing unseen exam: **none**
- `fine_tune_candidate`: **true**
- `autoExecuteTraining`: **false**
- authority expansion: **false**

Candidate qualification is metadata/evidence only. No Hugging Face Job was launched by qualification.

## Teacher-dataset design

This increment adds a cost-gated teacher-dataset generation stage before ordinary train/holdout materialization.

The host builds **64 public synthetic Reasoning & Decision Science practice cases** from eight reasoning skill families crossed with eight generic public scenarios. The prompts intentionally contain none of the following:

- hidden University exam prompts or rubrics
- Production user prompts or conversation text
- private memory or retained customer material
- incident payloads or repository secrets
- failed exam source references or candidate UUIDs

The teacher is instructed to provide a final answer with concise support and not disclose chain-of-thought. The worker also disables Qwen thinking mode when supported and strips/rejects hidden `<think>` material defensively before writing a training row.

## Initial model topology

The default first experiment uses:

- teacher: `Qwen/Qwen3-8B`
- student: `Qwen/Qwen3-4B`

At dispatch time iTMounts queries Hugging Face model metadata, requires an immutable 40-character model commit SHA, and requires both selected model repositories to report `apache-2.0`. The exact resolved revisions are then bound into the signed dispatch and callback evidence.

The callback requires case-exact model IDs and exact immutable revisions. A moving model reference cannot satisfy the evidence gate.

## Dataset output

The teacher worker:

1. loads the exact pinned teacher revision in 4-bit mode;
2. generates one final-answer example per public practice prompt;
3. requires at least 20 unique usable examples;
4. hashes each complete `<user> ... <assistant> ...` training item;
5. creates a **private** Hugging Face dataset repository;
6. pushes only the synthetic prompt/final-answer rows and provenance metadata;
7. resolves the immutable dataset commit SHA;
8. returns a signed `teacher_dataset_registered` callback;
9. registers a separate distillation training plan without overwriting remediation provenance.

The registered training plan remains candidate-only. It does not automatically prepare partitions or train a model.

## Cost boundary

Teacher generation is cost-bearing GPU work and therefore uses the same explicit owner confirmation and global dispatch kill switch as model training.

Controls added by this increment:

- default teacher hardware: `t4-small`
- default teacher timeout: 1,800 seconds
- live Hugging Face hardware price lookup immediately before submission
- owner hardware ceiling: **$1.00/hour maximum**
- environment configuration may lower the ceiling but cannot raise it
- no automatic GPU escalation after failure or OOM
- `HF_TOKEN` remains an encrypted Job secret, never a plain Job environment variable

At the September 13, 2026 Hugging Face rate of roughly $0.40/hour for T4 Small, the 30-minute timeout corresponds to a maximum compute exposure of about $0.20 for this teacher-dataset job. The implementation does not hard-code that price; it reads the current provider rate before submission.

## What this increment does not do

It does **not**:

- enable `COS_UNIVERSITY_TRAINING_EXECUTOR_DISPATCH_ENABLED`
- infer owner approval from authentication
- launch the teacher Job without per-request `confirmDispatch=true`
- upload private Production data
- start train/holdout partition preparation automatically
- train the student model automatically
- promote a trained artifact
- waive independent evaluation, safety, transfer, delayed retention, Production canary, or rollback proof

## Next boundary

After this code is Production-ready, the next action is the first real teacher-dataset GPU Job.

That individual dispatch must receive explicit owner cost approval. After its signed callback registers a private immutable teacher dataset, CPU partition preparation can proceed under its own existing cost-confirmed dispatch path, followed later by the separately approved QLoRA student-training Job.
