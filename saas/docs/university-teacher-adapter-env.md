# University teacher adapter environment contract

All hosted teacher providers are opt-in and buyer-owned. No provider is used unless both its enable gate and adapter-ready gate are true and the required credential is present.

## OpenAI

- `COS_UNIVERSITY_TEACHER_OPENAI_ENABLED=true`
- `COS_UNIVERSITY_TEACHER_OPENAI_ADAPTER_READY=true`
- `OPENAI_API_KEY=<buyer secret>`
- `COS_UNIVERSITY_TEACHER_OPENAI_MODEL=<buyer-approved model>`
- optional `COS_UNIVERSITY_TEACHER_OPENAI_ENDPOINT=<HTTPS OpenAI-compatible endpoint>`

## Anthropic / Claude

- `COS_UNIVERSITY_TEACHER_ANTHROPIC_ENABLED=true`
- `COS_UNIVERSITY_TEACHER_CLAUDE_ADAPTER_READY=true`
- `ANTHROPIC_API_KEY=<buyer secret>`
- `COS_UNIVERSITY_TEACHER_ANTHROPIC_MODEL=<buyer-approved model>`
- optional `COS_UNIVERSITY_TEACHER_ANTHROPIC_ENDPOINT=<HTTPS Messages endpoint>`

## xAI / Grok

- `COS_UNIVERSITY_TEACHER_XAI_ENABLED=true`
- `COS_UNIVERSITY_TEACHER_GROK_ADAPTER_READY=true`
- `XAI_API_KEY=<buyer secret>`
- `COS_UNIVERSITY_TEACHER_XAI_MODEL=<buyer-approved model>`
- optional `COS_UNIVERSITY_TEACHER_XAI_ENDPOINT=<HTTPS OpenAI-compatible endpoint>`

## DeepSeek API

- `COS_UNIVERSITY_TEACHER_DEEPSEEK_API_ENABLED=true`
- `COS_UNIVERSITY_TEACHER_DEEPSEEK_API_ADAPTER_READY=true`
- `DEEPSEEK_API_KEY=<buyer secret>`
- `COS_UNIVERSITY_TEACHER_DEEPSEEK_API_MODEL=deepseek-chat`
- legacy `deepseek-flash` values are normalized server-side to `deepseek-chat` so existing Production configuration does not create a zero-output teacher lane
- optional `COS_UNIVERSITY_TEACHER_DEEPSEEK_API_ENDPOINT=<HTTPS OpenAI-compatible endpoint>`

## Google Gemini

- `COS_UNIVERSITY_TEACHER_GEMINI_ENABLED=true`
- `COS_UNIVERSITY_TEACHER_GEMINI_ADAPTER_READY=true`
- `GEMINI_API_KEY=<buyer secret>`
- `COS_UNIVERSITY_TEACHER_GEMINI_MODEL=gemini-3.8-flash`
- optional `COS_UNIVERSITY_TEACHER_GEMINI_ENDPOINT=<HTTPS models base endpoint>`

## Open/self-hosted Hugging Face teachers

- `HF_TOKEN=<buyer secret>`
- `COS_UNIVERSITY_TEACHER_QWEN_ENABLED=true` and/or `COS_UNIVERSITY_TEACHER_DEEPSEEK_ENABLED=true`

These teachers remain behind the existing signed Hugging Face training executor and model-license gate.

## Custom / enterprise gateway

- `COS_UNIVERSITY_TEACHER_CUSTOM_ENABLED=true`
- `COS_UNIVERSITY_TEACHER_CUSTOM_ADAPTER_READY=true`
- `COS_UNIVERSITY_TEACHER_CUSTOM_ENDPOINT=<buyer HTTPS endpoint>`
- `COS_UNIVERSITY_TEACHER_CUSTOM_MODEL=<buyer model identifier>`
- `COS_UNIVERSITY_TEACHER_CUSTOM_TOKEN=<buyer secret>`

This custom surface is intended for Azure OpenAI gateways, Bedrock/Vertex bridges, on-prem vLLM, private model gateways, or equivalent buyer infrastructure. The core never silently switches providers.


## Multi-provider distillation fan-out

Hosted teachers are now part of the live University curriculum replenishment path, between verified-failure remediation and the zero-cost synthetic fallback. The pipeline can fan out across every explicitly enabled hosted provider and persist the generated lesson with provider/model/request/token provenance.

Cost-bearing hosted generation remains fail-closed until this cycle budget is explicitly configured:

- `COS_UNIVERSITY_TEACHER_HOSTED_MAX_CALLS_PER_CYCLE=<1..48>`
- optional `COS_UNIVERSITY_TEACHER_HOSTED_MAX_OUTPUT_TOKENS=<128..2048>` (default 1200)
- optional `COS_UNIVERSITY_TEACHER_HOSTED_PARALLELISM=<1..6>` (default 3)

The per-provider enable, adapter-ready, credential and model settings above still apply. A failed provider call is recorded for that exact teacher; the University does not silently retry it through a different provider. Hugging Face Qwen/DeepSeek remain on the governed local/HF executor path and continue in parallel with hosted-teacher curriculum generation.

Provider-billed dollar cost is deliberately not inferred from token counts because pricing differs by provider/model and can change. The run records request/token provenance while the explicit maximum call count and output-token ceiling bound each replenishment cycle.


## Parallel mass-distillation teacher stage

The mass-distillation campaign can now use OpenAI, Claude, and Grok as the actual teacher stage, not only as curriculum replenishment sources.

Production contract:

- `COS_UNIVERSITY_MASS_HOSTED_TEACHER_ENABLED=true`
- `COS_UNIVERSITY_MASS_HOSTED_TEACHER_MAX_CALLS=20`
- `COS_UNIVERSITY_MASS_HOSTED_TEACHER_MAX_OUTPUT_TOKENS=384`
- `COS_UNIVERSITY_MASS_HOSTED_TEACHER_PARALLELISM=8`

The stage requires 20 distinct persisted teacher responses before the run advances to dataset preparation. Each row records provider, exact model, request ID, token counts, response hash, prompt identity, and batch/run identity. OpenAI, Claude, and Grok are rotated across prompts when they are credential-ready.

The fixed mass-campaign teacher ceiling remains $0.20. To preserve that ceiling, the unpriced custom gateway is excluded from this direct mass-teacher stage. Custom gateways remain available to the general hosted curriculum lane.

If no hosted provider is credential-ready, the controller records `mass_distillation_hosted_teacher_unavailable` and explicitly continues through the existing governed Hugging Face teacher job. If at least one hosted provider is active but the hosted stage cannot produce 20 valid rows, the run fails/retries; it does not silently switch providers.

The resulting hosted rows are handed to the existing Hugging Face preparation worker for deterministic train/holdout partitioning. Student training, rollback evidence, independent evaluation, canary validation, and promotion gates are unchanged.


## Plug-and-play additional providers

The University teacher pool is provider-neutral. OpenAI, Anthropic/Claude, xAI/Grok, Hugging Face, and the custom enterprise gateway are built-in reference providers, not a closed vendor list.

A buyer may add additional hosted providers through `COS_UNIVERSITY_TEACHER_PROVIDERS_JSON` without editing University or distillation code when the provider uses one of the supported transport protocols:

- `openai_responses`
- `openai_compatible`
- `anthropic_messages`
- `custom_adapter` (OpenAI-compatible by default; a portable host may inject another adapter)

Each configured provider supplies only metadata and environment-variable names: provider ID, transport, credential env name, enable gate, adapter-ready gate, model env name, endpoint env name, and optionally a default HTTPS endpoint. Secrets remain in the buyer's normal secret store and are never embedded in the provider JSON.

Example metadata shape:

```json
[
  {
    "id": "buyer-model-cloud",
    "provider": "buyer-model-cloud",
    "transport": "openai_compatible",
    "credentialEnv": "BUYER_MODEL_CLOUD_API_KEY",
    "enabledEnv": "COS_UNIVERSITY_TEACHER_BUYER_MODEL_CLOUD_ENABLED",
    "adapterReadyEnv": "COS_UNIVERSITY_TEACHER_BUYER_MODEL_CLOUD_ADAPTER_READY",
    "modelEnv": "COS_UNIVERSITY_TEACHER_BUYER_MODEL_CLOUD_MODEL",
    "endpointEnv": "COS_UNIVERSITY_TEACHER_BUYER_MODEL_CLOUD_ENDPOINT",
    "massDistillationEligible": false
  }
]
```

Additional providers are fail-closed: malformed definitions, missing credentials/models/endpoints, disabled adapters, or missing readiness gates do not become active. They never inherit authority from another provider and never trigger silent fallback.

The mass-distillation teacher stage no longer keys eligibility to the literal names OpenAI, Claude, or Grok. It reads `massDistillationEligible` from the provider definition. Built-in OpenAI, Claude, and Grok remain eligible. Buyer-added providers default to ineligible unless the buyer explicitly opts them into that bounded stage and accepts the same cost/provenance controls.
