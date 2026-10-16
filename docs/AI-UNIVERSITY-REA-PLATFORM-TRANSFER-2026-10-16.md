# AI University: REA cross-platform behavioral transfer

This work combines **independently implemented functionality** from proven public patterns; it does not copy proprietary source or claim that a competitor's private internals have been inspected.

## Targets and executable building blocks

| Platform examples | Behavior to examine | Candidate independent implementation |
|---|---|---|
| Hugging Face, ModelScope, Kaggle | curated datasets, revisions, provenance, model artifacts | existing LAB dataset pipeline + artifact passport |
| Together AI, Fireworks AI, Replicate, RunPod | fine-tuning and managed GPU execution | reuse existing HF/Together/Fireworks customer-key connectors; only add new vendors with a tested executor |
| Weights & Biases, MLflow, Databricks Mosaic AI | experiment metrics, side-by-side evaluation, lineage | MLflow tracking and model registry where deployable |
| SageMaker AI, Vertex AI, Microsoft Foundry | scalable training jobs and model serving | Ray Train / DeepSpeed, vLLM / Triton after compatibility and isolation review |
| Modal, Kubeflow, Flyte | distributed job lifecycle and recovery | governed tenant-aware checkpoints, reconciled jobs and lease fencing |
| Label Studio, Apache Arrow, HF Datasets | annotation and dataset quality checks | no-cost preflight, deduplication, rights and split-leakage checks |
| lm-evaluation-harness, LightEval, Evidently | quality benchmarking and drift | customer-authorized holdout evaluation, versioned evaluator results and observability |

## What exists already

The current LAB has customer BYOI provider selection, Hugging Face Jobs, Together and Fireworks fine-tuning, dataset parsing/dedupe, job status/cancellation and artifact downloads. See `docs/AI-UNIVERSITY-HF-CAPABILITY-GAP-2026-10-15.md`. Do **not** replace or duplicate these without a measured failure. Customer LAB is not COS Foundational Learning.

## Transfer workflow

1. Gather authorized findings from public documentation, open-source reference implementations, or controlled synthetic probes. Avoid uploading proprietary code, keys or raw customer datasets.
2. Store metadata in a **private local** `findings.json`:
   `{"findings":[{"platform":"Hugging Face","capability":"dataset_preflight","method":"official-docs","version":"docs-review-1","evidence_location":"https://huggingface.co/docs","observation":"Public docs describe dataset validation","limitations":"No behavioral probe yet"}]}`
3. Run `node scripts/rea-university-transfer.mjs findings.json transfer.json`; verify with `node --test scripts/rea-university-transfer.test.mjs`. Keep private evidence outside the public repository.
4. Implement separately under the existing LAB authentication/tenant/budget contracts; verify UI, background worker, provider response, result record and artifact against a real disposable account before claiming it works.

## First product increments

1. Read-only dataset preflight across all three supported training routes.
2. Immutable customer experiment record plus model passport from server-owned job records.
3. Identical-prompt baseline/trained-model comparisons with clearly versioned evaluators.
4. Provider-valid recipe presets and advisor (no silent provider/model change).
5. New training/serving backends only after end-to-end probe, credential/residency checks and rollback tests.

No new customer-facing provider is enabled by this evidence tool. No external spend, recurring retrain, independent certification, or customer-system repair is authorized by this document.
