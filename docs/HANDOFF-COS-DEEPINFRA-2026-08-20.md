# COS DeepInfra managed open-model migration handoff — 2026-08-20

## Status

The DeepInfra migration has been proven end-to-end in a dedicated Vercel Preview. Production has **not** been switched yet at the time this handoff is written.

Permanent cutover work is in PR #1318 (`feat/cos-deepinfra-production-cutover-20260820`). The temporary validation branch is `test/deepinfra-preview-20260820`; do not merge that branch into `main` because it contains Preview-only validation routes and temporary provider pins.

## Architecture

COS remains the durable learner/governance/memory system. DeepInfra is replaceable inference compute hosting an open Qwen model. `/v1/openai` in the DeepInfra URL means OpenAI-compatible protocol only; it does not mean OpenAI provides the model or compute.

Validated runtime:

```text
COS
→ LOCAL_AI_* OpenAI-compatible seam
→ DeepInfra
→ Qwen/Qwen3.6-35B-A3B
```

Validated embedding runtime:

```text
COS semantic retrieval / learning
→ LOCAL_AI embedding seam
→ DeepInfra
→ BAAI/bge-base-en-v1.5
→ 768 dimensions
→ existing pgvector schema
```

## Preview acceptance evidence

Final hardened validation response:

- reasoner verdict: `ok`
- model: `Qwen/Qwen3.6-35B-A3B`
- base URL: `https://api.deepinfra.com/v1/openai`
- reasoner health response: `ready` in ~404 ms
- embeddings: 768/768 dimensions
- held-out benchmark: 2 attempted / 2 passed / 100%
- tracks: `provenance`, `memory-governance`
- `responseSource = local_cos_reasoning`
- `localModelInvoked = true`
- `externalAiInvoked = false`
- benchmark result persistence disabled for the migration validation (`persisted = false`)

The earlier acceptance probe also returned `ready` in ~345 ms and confirmed the same 768-dimensional embedding candidate.

## Latency finding

The hardened benchmark remained 2/2 but case latency was uneven:

- provenance: ~36.988 s
- memory-governance: ~201.575 s

Runtime logs showed the 201 s case was **not** one 201-second DeepInfra request. COS activated Cognitive Council for a repeated unresolved problem class and issued several additional Qwen calls, including calls in roughly the 30–65 second range. Therefore the long tail is currently COS orchestration/council expansion, not a DeepInfra connectivity or authentication failure.

Do not disable Council merely to make a benchmark look faster. Improve deadline/budget awareness and provider-specific latency estimates so optional Council/challenge/repair phases cannot consume the full turn budget.

## Embedding context-window finding and fix

`BAAI/bge-base-en-v1.5` is 768-dimensional and passed the schema gate, but DeepInfra rejected an observed 513-token input because this model's input window is 512 tokens. The permanent runtime now handles embedding-provider context-window overflow with bounded truncation/retry while preserving exact 768-dimensional validation.

The current implementation can still perform several retries on long inputs before fitting the provider window. A follow-up optimization should make the truncation estimate more direct so most oversized requests need at most one retry.

## RunPod lifecycle detachment

RunPod pod id `yvj6e9zboi7ofo` may remain configured as historical/fallback lab state, but when `LOCAL_AI_BASE_URL` points outside RunPod the live provider is authoritative and RunPod lifecycle control must be disabled.

Validated log after hardening:

```text
[cos-runpod-detached] ... selectedPodId:null ... LOCAL_AI_BASE_URL points outside RunPod
[cos-local-inference-telemetry] ... runpodLifecycleEnabled:false
```

This prevents stale RunPod flags/credentials from starting or stopping RunPod while DeepInfra is the selected reasoner.

## Provenance semantics

Permanent cutover code distinguishes:

- `independent-local:<model>` — self-hosted/local runtime such as RunPod/Ollama
- `managed-open-model:deepinfra:<model>` — DeepInfra managed open-model inference

DeepInfra must never be described as self-hosted or as OpenAI. Closed-model OpenAI/Anthropic/Gemini routes remain external fallback/teacher paths under their existing governance.

## Production environment contract

After PR #1318 is merged, Production should be configured explicitly in Vercel with:

```dotenv
LOCAL_AI_BASE_URL=https://api.deepinfra.com/v1/openai
LOCAL_AI_ALLOWED_HOSTS=api.deepinfra.com
LOCAL_AI_MODEL=Qwen/Qwen3.6-35B-A3B
LOCAL_AI_EMBEDDING_MODEL=BAAI/bge-base-en-v1.5
LOCAL_AI_REASONING_EFFORT=none
LOCAL_AI_MANAGED_PROVIDER=deepinfra
LOCAL_AI_API_KEY=<DeepInfra production secret>
```

`LOCAL_AI_API_KEY` is a Vercel secret and must never be committed. The connected Vercel tooling used during this work can inspect deployments/logs but cannot read or change secret environment values, so the Production secret/config switch requires the Vercel environment UI (or another authorized secret-management path).

`saas/vercel.json` in PR #1318 removes provider-specific RunPod reasoner pins so source control no longer overrides the selected Vercel runtime provider.

## Production cutover gate

Do not declare the migration complete until all of these are observed after the Production environment switch:

1. PR #1318 merged and Production deployment `READY`.
2. Production reasoner diagnose/probe returns the managed Qwen model successfully.
3. Production embedding health returns exactly 768 dimensions.
4. A bounded capability benchmark completes with local COS reasoning and no external AI.
5. Normal COS request provenance reports `managed-open-model:deepinfra:Qwen/Qwen3.6-35B-A3B`.
6. RunPod lifecycle telemetry is detached/false for the managed reasoner.
7. Learning continuity remains operational after a real retention cycle.
8. No temporary unauthenticated Preview validation route exists on `main`.

## Learning continuity snapshot

Migration validation read the production-backed continuity report as:

- status: `amber`
- corpus documents: 152
- documents retained in last 7 days: 77
- new subjects in last 7 days: 21
- silent days in last 7 days: 1
- last retention: ~24.5 hours before the check
- open gaps: 0
- finding: `no_open_gaps`

This amber state is **not evidence that DeepInfra stopped learning**. The continuity policy intentionally treats zero open learning gaps as suspicious because a genuinely reasoning system should normally have unresolved questions. Learning volume/expansion is present; follow up on gap-generation/resolution hygiene rather than weakening the watchdog.

## Rollback

If Production cutover fails, restore the prior Production `LOCAL_AI_*` RunPod values and redeploy. The last known RunPod reasoner configuration before migration was:

```dotenv
RUNPOD_POD_ID=yvj6e9zboi7ofo
LOCAL_AI_BASE_URL=https://yvj6e9zboi7ofo-11434.proxy.runpod.net/v1
LOCAL_AI_ALLOWED_HOSTS=yvj6e9zboi7ofo-11434.proxy.runpod.net
LOCAL_AI_MODEL=qwen2.5-coder:32b
```

RunPod health/GPU/model availability must be re-verified before relying on rollback inference; historical configuration is not proof that the pod can currently serve the model.

## Follow-up priorities

1. Complete Production environment switch and post-cutover acceptance.
2. Improve Council/optional-phase latency budgeting for managed reasoners using observed model-call latency rather than a static estimate.
3. Reduce BGE oversized-input handling to a single predictable truncation in the common case.
4. Investigate why all learning gaps are closed while the corpus is still expanding; preserve the amber watchdog until the cause is understood.
5. Remove the temporary DeepInfra Preview test branch/routes after Production acceptance.
6. Update operational dashboards/labels so managed open-model vs self-hosted provenance is visible everywhere it matters.
