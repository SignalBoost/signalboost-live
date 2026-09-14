# iTMounts RunPod Primary / DeepInfra Fallback

**Date:** September 13, 2026  
**Repository:** `SignalBoost/signalboost-live`  
**Public product:** iTMounts

## Owner decision

RunPod is the preferred iTMounts-controlled text inference compute plane. DeepInfra remains configured as a bounded fallback/overflow provider rather than the default destination for routine text work.

The architectural order is:

```text
active iTMounts graduate (when scoped + promoted + healthy)
→ RunPod primary iTMounts runtime
→ DeepInfra fallback / difficult escalation
```

Independent University grading/evaluation and protected controlled-comparison contexts remain isolated and do not silently inherit the RunPod-primary route.

## Why

Production telemetry showed Builder and other text paths repeatedly calling DeepInfra with large prompt contexts. The per-request cost is small in isolation but accumulates rapidly across iterative Builder/COS rounds. A dedicated RunPod GPU can amortize sustained Builder/COS traffic and can also host iTMounts-owned distilled models and the pinned 768-dimensional embedding model.

This does not mean RunPod owns the model. Model/runtime ownership and compute-provider identity remain separate telemetry dimensions.

## Existing pod and stale-id recovery

The existing iTMounts reasoner Pod must be reused; do not create a second paid Pod merely because a deployment variable is stale.

A live Production account probe on September 13, 2026 proved:

- the configured deployment pod id referred to a terminated pod;
- the authenticated RunPod account still contained exactly one canonical `signalboost-cos-reasoner-v2` Pod;
- that Pod was stopped rather than deleted;
- the account had approximately $8.41 in remaining RunPod credit at the time of the probe;
- the stopped Pod reported a $0.22/hour compute rate when running.

The runtime therefore supports a fail-closed recovery rule: if the configured pod id is absent, it may adopt a replacement only when the authenticated account proves exactly one canonical SignalBoost COS reasoner Pod. The selected id is held only as an in-process verified override; it is not hard-coded into source. Ambiguous account state fails closed to DeepInfra fallback.

## Vercel configuration boundary

DeepInfra fallback variables remain unchanged:

```text
LOCAL_AI_BASE_URL
LOCAL_AI_ALLOWED_HOSTS
LOCAL_AI_API_KEY
LOCAL_AI_MODEL
DEEPINFRA_BUILDER_MODEL
LOCAL_AI_EMBEDDING_MODEL
```

RunPod primary uses separate settings:

```text
RUNPOD_API_KEY                  # secret RunPod control credential
RUNPOD_PRIMARY_POD_ID           # preferred explicit existing Pod id; stale values can be safely recovered at runtime
RUNPOD_PRIMARY_ENABLED=true
RUNPOD_PRIMARY_MODEL=qwen3:30b
RUNPOD_PRIMARY_BUILDER_MODEL=qwen3:30b
RUNPOD_PRIMARY_EMBEDDING_MODEL=nomic-embed-text
RUNPOD_PRIMARY_TIMEOUT_MS=120000
RUNPOD_PRIMARY_MAX_CREDIT_SPEND_USD=20
RUNPOD_LIFECYCLE_ENABLED=true
COS_RUNPOD_AUTO_STOP_ENABLED=false
COS_RUNPOD_ORPHAN_GUARD_ENABLED=true
```

`RUNPOD_API_KEY` must remain only in protected runtime configuration. Never place it in GitHub, documentation, logs, chat, or source.

## Credential separation

The RunPod control API key is not used as the inference-gateway credential. The application derives a deterministic HMAC inference-only gateway token from the control credential and the verified Pod id. The derived token is installed into `/workspace/cos-api-key` when the Pod startup contract is applied. The RunPod account key therefore never travels to the model gateway.

## Reproducible startup

On every Pod start, the startup contract downloads `saas/scripts/runpod-cos-reasoner.sh` from the exact Vercel Git commit, installs the derived inference-only gateway token, then launches Ollama with:

- primary text/coding model;
- `nomic-embed-text` embeddings;
- authenticated public proxy on port 11434;
- persistent models under `/workspace`.

A stale script left on the Pod volume is not trusted as the canonical boot implementation.

## Warm-capacity policy

The previous aggressive idle-stop policy is not restored. Stopping the Pod can release its GPU reservation and later resume may fail when capacity is unavailable.

Therefore:

- healthy primary compute defaults to warm;
- `COS_RUNPOD_AUTO_STOP_ENABLED` must be explicitly `true` to enable idle stop;
- the unhealthy orphan guard remains enabled by default so a broken running Pod cannot bill indefinitely;
- DeepInfra remains the operational fallback if RunPod cannot start, become ready, or return usable inference.

## Runtime routing

Ordinary text inference uses the same policy at the shared `callLocalModel` seam, so core COS, Council/challenge reasoning, audit/synthesis callers, Builder and shared Platform AI do not silently bypass RunPod merely because they call the lower-level inference helper.

Routing is:

1. active scoped graduate where applicable;
2. RunPod primary;
3. DeepInfra/`LOCAL_AI_*` bounded fallback;
4. explicit closed-model escalation only where separately governed.

Builder additionally retains `DEEPINFRA_BUILDER_MODEL` as its specialized fallback model.

Protected independent University assessment is excluded from the shared RunPod preference. Training/practice may use primary platform compute, but evidence-generating independent exams/controlled comparisons must preserve evaluator separation.

## Embeddings

Embeddings remain an independently governed transport because the database vector contract is fixed at 768 dimensions. The RunPod startup contract already provisions `nomic-embed-text`, but the separate embedding path must be moved only after a live RunPod canary proves the Pod boots and serves the expected 768-dimensional vectors. Until that canary closes, `LOCAL_AI_EMBEDDING_*` remains the embedding source of truth; do not silently mix vector spaces.

## Definition of complete cutover

The text-inference cutover is complete when Production telemetry shows routine COS/Builder/Platform text requests on `provider=runpod`, with DeepInfra rows occurring only after an explicit RunPod failure/fallback or deliberate escalation.

The full compute cutover is complete after the embedding canary also proves 768-dimensional RunPod embeddings and the embedding endpoint is moved without changing vector-space identity.
