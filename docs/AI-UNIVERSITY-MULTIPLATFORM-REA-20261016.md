# AI University — multi-platform REA capability study (2026-10-16)

This study treats Hugging Face as **one** reference, not a product template. It documents observed public behavior and its transferable customer outcomes; it does **not** assert access to proprietary internals or working iTMounts integrations.

| Reference | Public capability to study | iTMounts transfer target | Current status |
| --- | --- | --- | --- |
| Hugging Face | Model discovery, datasets, training jobs, artifacts | Portable model/data records and discoverable workflows | Existing LAB functionality varies by provider; do not assume parity |
| Together AI | Managed fine-tuning and serving | Authorized provider-specific training, status, artifact retrieval | Training connector exists; no live provider proof in this study |
| Fireworks AI | Managed tuning and inference | Capability-gated provider job execution and outcomes | Training connector exists; no live provider proof in this study |
| Replicate | Model/version endpoints and hosted execution | Version-pinned reusable customer artifacts and inference adapters | Research candidate; connector not validated |
| Runpod | Self-managed GPU training and worker runtimes | Optional customer-controlled compute lifecycle and cleanup | Research candidate; not equivalent to managed fine-tuning |
| Baseten | Deployment and model serving workflows | Explicit deployment capability, status and revision tracking | Research candidate; no live proof |
| Modal | Code-defined elastic GPU tasks | Bounded task execution and job recovery | Research candidate; not inherently managed fine-tuning |
| Weights & Biases | Experiment comparison and artifact lineage | Tenant-safe provider-neutral metrics and provenance | Research candidate; not customer model certification |

## Implementation rule

Build behavior behind capability contracts: `training.execute`, `inference.execute`, `dataset.inspect`, `artifact.retrieve`, `evaluation.score`, `deployment.manage`. Adapter discovery does not imply any executable connector. Never ask for infrastructure-admin permissions to repair the customer's external platform, and never start customer-paid work without explicit consent.

## First provider-neutral safety improvement

Reject repeated normalized evaluation prompts before computing holdout scores. Repeated questions otherwise overweight arbitrary samples, regardless of which provider produced the answers. This is local validation, **not** independent evaluation or proof of model improvement.

## Reference evidence

- https://huggingface.co/docs/hub/index
- https://docs.together.ai/docs/fine-tuning-overview
- https://docs.fireworks.ai/fine-tuning/fine-tuning-models
- https://replicate.com/docs
- https://docs.runpod.io/
- https://docs.baseten.co/
- https://modal.com/docs
- https://docs.wandb.ai/

These documentation links are research starting points, not an assertion that every advertised feature is present or supported today. Verify exact documented contract and a scoped test before shipping each adapter.
