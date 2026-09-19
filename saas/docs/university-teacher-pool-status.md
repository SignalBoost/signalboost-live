# Teacher pool rollout status

The enterprise provider abstraction is wired into the mass-distillation execution path. Eligible prepared batches are deterministically sharded across Qwen/DeepSeek (governed Hugging Face Jobs), OpenAI-compatible, Anthropic/Claude, xAI/Grok, and buyer custom adapters so teacher synthesis can progress in parallel rather than through one teacher pipeline.

Hosted providers require explicit enablement, buyer-owned credentials, an explicit model, adapter readiness, verified token pricing, and an explicit contractual distillation-rights gate. Missing or unknown authorization fails closed. Once a batch is assigned, retries resume the same provider/model and never silently fall back.

Hosted prompt outputs are stored durably with provider/model/request/token/cost provenance and then materialized into a private Hugging Face dataset. Open-model teachers remain behind the signed Hugging Face executor and the Apache-2.0/MIT model-license gate. Preparation, student training, independent evaluation, safety, transfer, retention, exact-artifact canary, rollback, and graduation remain provider-independent.
