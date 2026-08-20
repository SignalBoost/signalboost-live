# COS reasoner provider port

COS already speaks an OpenAI-compatible inference protocol through the `LOCAL_AI_*` seam. The provider-neutrality work is therefore not a second inference stack; it is removing provider lifecycle assumptions from that seam and keeping embeddings separately configurable.

## Runtime contract

Reasoning is configured with:

```text
LOCAL_AI_BASE_URL=<OpenAI-compatible base URL>
LOCAL_AI_MODEL=<provider model id>
LOCAL_AI_API_KEY=<reasoner credential>
LOCAL_AI_ALLOWED_HOSTS=<exact reasoner hostname>
LOCAL_AI_TIMEOUT_MS=120000
```

The endpoint may be a SignalBoost-owned Ollama/vLLM/TGI runtime, a temporary lab inference host, or a buyer-controlled OpenAI-compatible cluster.

RunPod is now only a lifecycle adapter for endpoints whose live `LOCAL_AI_BASE_URL` is a `*.proxy.runpod.net` proxy. Leaving `RUNPOD_API_KEY` or `RUNPOD_POD_ID` configured does not wake, stop, or refresh leases for an unrelated reasoner provider.

## Embeddings are a separate port

Embeddings remain pinned to the database vector contract: 768 dimensions unless the schema is deliberately migrated and the corpus is re-embedded.

Use the dedicated overrides when the reasoner host does not serve the required embedding model:

```text
LOCAL_AI_EMBEDDING_BASE_URL=<embedding API base URL>
LOCAL_AI_EMBEDDING_MODEL=nomic-embed-text
LOCAL_AI_EMBEDDING_API_KEY=<embedding credential>
```

If `LOCAL_AI_EMBEDDING_BASE_URL` is unset, embeddings continue to follow the reasoner endpoint for backward compatibility.

Never assume an embedding provider is compatible merely because its API is OpenAI-shaped. `checkLocalEmbeddingHealth()` must return a 768-dimensional vector before writes are enabled.

## Lab migration sequence

1. Keep the existing RunPod configuration unchanged until a candidate provider is ready.
2. Configure the candidate reasoner in Preview first using `LOCAL_AI_BASE_URL`, `LOCAL_AI_MODEL`, `LOCAL_AI_API_KEY`, and `LOCAL_AI_ALLOWED_HOSTS`.
3. Configure a separate 768-dimensional embedding endpoint if the candidate reasoner host does not serve `nomic-embed-text` compatibly.
4. Run `/api/admin/cos-reasoner/diagnose`. Reasoner completion and embedding health must both pass.
5. Run the private capability benchmark and compare with the last valid RunPod baseline. Infrastructure-blocked runs do not count as capability failures.
6. Run `POST /api/admin/cos-learning/run` and then inspect `/api/admin/cos-learning/continuity`.
7. Do not promote the provider to production until retained documents and new subjects continue arriving and embedding health stays at 768 dimensions.
8. After production cutover, stale RunPod credentials may remain temporarily for lab fallback; lifecycle control is automatically dormant while `LOCAL_AI_BASE_URL` points elsewhere.

## Independence and provenance

Provider-neutral does not mean provider-opaque. A self-hosted open model, a managed open-model lab endpoint, and an external proprietary fallback have different governance meanings even when all expose `/chat/completions`.

The permanent architecture must preserve that distinction in provenance. Temporary managed open-model inference used for SignalBoost lab work must not be represented to customers as customer-owned or self-hosted compute.

## Why this matters

The GPU vendor is infrastructure, not COS memory. Enterprise Memory, the retained learning corpus, learning gaps, strategy outcomes, benchmarks, and semantic records remain durable in SignalBoost storage. Changing the reasoner endpoint changes the engine that performs inference; it does not reset what COS has learned.
