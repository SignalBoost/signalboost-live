# iTMounts RunPod Primary / DeepInfra Fallback

**Date:** September 13, 2026  
**Repository:** `SignalBoost/signalboost-live`  
**Public product:** iTMounts

## Owner decision

RunPod is restored as the preferred iTMounts-controlled text inference compute plane. DeepInfra remains configured as a bounded fallback/overflow provider rather than the default destination for every request.

The architectural order is:

```text
active iTMounts graduate (when scoped + promoted + healthy)
→ RunPod primary iTMounts runtime
→ DeepInfra fallback / difficult escalation
```

University independent grading/evaluation and other protected controlled-comparison contexts remain isolated and do not silently inherit the RunPod-primary route.

## Why

Production telemetry showed Builder repeatedly calling DeepSeek V4 Pro on DeepInfra with large prompt contexts. The per-request cost is small in isolation but accumulates rapidly across iterative Builder rounds. A dedicated RunPod GPU can amortize sustained Builder/COS traffic and also host iTMounts-owned distilled models and the pinned 768-dimensional embedding model.

This does not mean RunPod owns the model. Model/runtime ownership and compute-provider identity remain separate telemetry dimensions.

## Existing pod

The previously used RunPod Pod still exists in the owner's RunPod console and is currently stopped. Reuse it; do not create a second paid Pod unless the existing Pod is proven unusable.

Historical repository evidence identifies the prior Pod as `yvj6e9zboi7ofo`, but Production must use the explicit Vercel setting `RUNPOD_PRIMARY_POD_ID` (or the legacy `RUNPOD_POD_ID`) rather than hard-coding an infrastructure identifier.

## Vercel configuration boundary

DeepInfra fallback variables remain unchanged:

```text
LOCAL_AI_BASE_URL
LOCAL_AI_ALLOWED_HOSTS
LOCAL_AI_API_KEY
LOCAL_AI_MODEL
DEEPINFRA_BUILDER_MODEL
```

RunPod primary uses separate settings:

```text
RUNPOD_API_KEY                  # secret RunPod control credential
RUNPOD_PRIMARY_POD_ID           # existing stopped Pod id
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

`RUNPOD_API_KEY` must be added only through Vercel's protected environment settings. Never place it in GitHub, documentation, logs, chat, or source.

## Credential separation

The RunPod control API key is not used as the inference-gateway credential. The application derives a deterministic HMAC inference-only gateway token from the control credential and Pod id. The derived token is installed into `/workspace/cos-api-key` when the Pod startup contract is applied. The RunPod account key therefore never travels to the model gateway.

## Reproducible startup

On every Pod start, the startup contract downloads `saas/scripts/runpod-cos-reasoner.sh` from the exact Vercel Git commit, installs the derived inference-only gateway token, then launches Ollama with:

- primary text/coding model;
- `nomic-embed-text` embeddings;
- authenticated public proxy on port 11434;
- persistent models under `/workspace`.

A stale script left on the Pod volume is not trusted as the canonical boot implementation.

## Warm-capacity policy

The previous aggressive idle-stop policy is not restored. Repository evidence showed that stopping the Pod released its GPU reservation; later resume attempts could fail when another RunPod customer took that host capacity.

Therefore:

- healthy primary compute defaults to warm;
- `COS_RUNPOD_AUTO_STOP_ENABLED` must be explicitly `true` to enable idle stop;
- the unhealthy orphan guard remains enabled by default so a broken running Pod cannot bill indefinitely.

## Routing phase 1

After the account/pod probe passes:

1. active scoped graduate first;
2. Builder and shared Platform AI use RunPod primary;
3. on RunPod readiness/inference failure, existing DeepInfra execution remains available;
4. fallback telemetry is marked explicitly;
5. protected University evaluation contexts remain on their controlled path.

This first phase targets the largest observed DeepInfra cost source without making the deepest COS reasoning path depend on an unproven reactivated Pod.

## Phase 2

After a real Production canary proves the existing Pod can boot the pinned model and serve sustained traffic:

- add RunPod workers ahead of the existing DeepInfra COS reasoning workers;
- move foreground embeddings to RunPod primary while preserving the 768-dimensional vector contract;
- bind promoted iTMounts graduates to the RunPod serving plane when compatible;
- leave DeepInfra as bounded fallback/overflow and deliberate high-end escalation.

## Cost boundary

The owner explicitly authorized reuse of the approximately $20 RunPod credit balance for this migration. Code deployment itself starts no GPU when `RUNPOD_API_KEY` is absent. Restoring that protected Vercel secret is the activation boundary.

Before starting/resuming compute, Production must successfully read RunPod account/pod status. A missing/invalid credential fails closed and leaves DeepInfra active.
