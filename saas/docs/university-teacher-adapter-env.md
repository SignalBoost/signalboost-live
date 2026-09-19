# University teacher adapter environment contract

All hosted teacher providers are opt-in and buyer-owned. No provider is used unless its enable gate, adapter-ready gate, required credential, explicit model, contractual distillation-rights gate, and explicit token pricing are all present. A missing field fails closed; the University never silently substitutes another provider.

## OpenAI

- `COS_UNIVERSITY_TEACHER_OPENAI_ENABLED=true`
- `COS_UNIVERSITY_TEACHER_OPENAI_ADAPTER_READY=true`
- `OPENAI_API_KEY=<buyer secret>`
- `COS_UNIVERSITY_TEACHER_OPENAI_MODEL=<buyer-approved model>`
- optional `COS_UNIVERSITY_TEACHER_OPENAI_ENDPOINT=<HTTPS OpenAI-compatible endpoint>`
- `COS_UNIVERSITY_TEACHER_OPENAI_DISTILLATION_RIGHTS=contractually_authorized` only when the buyer's provider agreement expressly permits this training/distillation use
- `COS_UNIVERSITY_TEACHER_OPENAI_INPUT_USD_PER_MILLION=<verified rate>`
- `COS_UNIVERSITY_TEACHER_OPENAI_OUTPUT_USD_PER_MILLION=<verified rate>`

## Anthropic / Claude

- `COS_UNIVERSITY_TEACHER_ANTHROPIC_ENABLED=true`
- `COS_UNIVERSITY_TEACHER_CLAUDE_ADAPTER_READY=true`
- `ANTHROPIC_API_KEY=<buyer secret>`
- `COS_UNIVERSITY_TEACHER_ANTHROPIC_MODEL=<buyer-approved model>`
- optional `COS_UNIVERSITY_TEACHER_ANTHROPIC_ENDPOINT=<HTTPS Messages endpoint>`
- `COS_UNIVERSITY_TEACHER_ANTHROPIC_DISTILLATION_RIGHTS=contractually_authorized` only when the buyer's provider agreement expressly permits this training/distillation use
- `COS_UNIVERSITY_TEACHER_ANTHROPIC_INPUT_USD_PER_MILLION=<verified rate>`
- `COS_UNIVERSITY_TEACHER_ANTHROPIC_OUTPUT_USD_PER_MILLION=<verified rate>`

## xAI / Grok

- `COS_UNIVERSITY_TEACHER_XAI_ENABLED=true`
- `COS_UNIVERSITY_TEACHER_GROK_ADAPTER_READY=true`
- `XAI_API_KEY=<buyer secret>`
- `COS_UNIVERSITY_TEACHER_XAI_MODEL=<buyer-approved model>`
- optional `COS_UNIVERSITY_TEACHER_XAI_ENDPOINT=<HTTPS OpenAI-compatible endpoint>`
- `COS_UNIVERSITY_TEACHER_XAI_DISTILLATION_RIGHTS=contractually_authorized` only when the buyer's provider agreement expressly permits this training/distillation use
- `COS_UNIVERSITY_TEACHER_XAI_INPUT_USD_PER_MILLION=<verified rate>`
- `COS_UNIVERSITY_TEACHER_XAI_OUTPUT_USD_PER_MILLION=<verified rate>`

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
- `COS_UNIVERSITY_TEACHER_CUSTOM_DISTILLATION_RIGHTS=contractually_authorized`
- `COS_UNIVERSITY_TEACHER_CUSTOM_INPUT_USD_PER_MILLION=<verified rate>`
- `COS_UNIVERSITY_TEACHER_CUSTOM_OUTPUT_USD_PER_MILLION=<verified rate>`

This custom surface is intended for Azure OpenAI gateways, Bedrock/Vertex bridges, on-prem vLLM, private model gateways, or equivalent buyer infrastructure. The core never silently switches providers.

## Runtime behavior

Eligible teachers are sharded deterministically by curriculum batch, so multiple batches can synthesize in parallel across different providers. Hosted-provider prompt outputs are durable and resumable; a retry stays on the originally assigned provider/model. Hosted calls are generated concurrently within a batch, then materialized into a private Hugging Face dataset for the existing governed preparation/training/evaluation chain. Provider/model/request-id/token/cost and manifest evidence are retained; credentials and hidden reasoning are not.
