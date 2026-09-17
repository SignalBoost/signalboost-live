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
