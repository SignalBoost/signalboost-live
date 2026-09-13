# COS University Distillation Candidate Preparation — 2026-09-13

## Status

This increment closes the non-spending gap between repeated independent University failures and the already-merged Hugging Face training executor.

It does **not** launch a Hugging Face Job, upload a teacher dataset, enable paid dispatch, train a student model, or claim model promotion.

## Production evidence that motivated the repair

The Production University ledger contains repeated unresolved unseen failures for the Software Specialist in `reasoning_decision_science`, while the active remediation study plan is still stored with `fine_tune_candidate=false`.

The defect was lifecycle-related: study strategy knew the existing threshold (`repeatedFailures >= 3` and `independentRetestFailures >= 2`), but active remediation rows were created before those counters accumulated and duplicate-safe persistence did not later promote the existing row.

A second source-identity gap also existed: remediation `source_ref` points to the failed exam/run lineage, while Hugging Face dataset preparation correctly requires a governed `hf://datasets/...@revision#split` reference. Overwriting remediation provenance would be wrong.

## What this increment changes

- Reconciles active recertification plans against durable `cos_university_unseen_v1` exam history.
- Counts repeated failures only inside the unresolved episode after the most recent pass.
- Requires at least three failed runs and at least two distinct hidden exam manifest hashes.
- A newer passed unseen exam resets the episode and prevents old failures from manufacturing a candidate.
- A replay of the same hidden manifest cannot count as an independent retest.
- Promotes only `fine_tune_candidate=false` rows that satisfy the existing threshold; it never automatically downgrades or trains them.
- Stores the qualification evidence, failed run IDs and manifest hashes without storing hidden exam content.
- Registers a separately governed distillation training plan rather than rewriting the remediation row.
- Requires an immutable Hugging Face dataset revision, at least 20 unique teacher-output item hashes, explicit training rights, provenance, a buyer-controlled student and explicit exclusion of private Production material.
- Keeps dataset identity bound to the exact pinned training source.
- Keeps `autoExecuteTraining=false` and `authorityExpanded=false` throughout preparation.

## Cost and authority boundary

Candidate reconciliation and dataset metadata registration are non-spending operations.

The existing global `COS_UNIVERSITY_TRAINING_EXECUTOR_DISPATCH_ENABLED` gate remains authoritative and fail-closed. Dataset preparation and training still require an explicit owner-confirmed dispatch. The Hugging Face adapter remains configured to use NVIDIA T4 Small (`t4-small`) by default and does not auto-upgrade after OOM/failure.

No paid GPU run is authorized by this increment.

## What remains before the first real distillation run

1. create a rights-safe teacher-output dataset outside private Production data;
2. publish it privately to the authenticated Hugging Face namespace and pin its immutable revision;
3. register that dataset against a genuinely qualified University candidate;
4. run governed CPU train/holdout partition preparation;
5. inspect the exact expected GPU cost;
6. obtain explicit owner confirmation for the individual paid training dispatch;
7. train the LoRA/QLoRA student;
8. complete independent evaluation, safety regression, unseen transfer, delayed retention, Production canary and rollback proof before any promotion.
