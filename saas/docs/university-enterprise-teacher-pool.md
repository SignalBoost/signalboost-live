# COS University enterprise teacher pool

The University treats teacher models as replaceable buyer-owned dependencies, not product identity.

Supported provider classes:

- Hugging Face / self-hosted open models (Qwen, DeepSeek, and future compatible models)
- OpenAI-compatible hosted APIs
- Anthropic Messages-compatible APIs
- xAI/OpenAI-compatible APIs
- buyer-supplied custom adapters for Azure, Bedrock, Vertex, on-prem vLLM, private gateways, or other approved infrastructure

## Non-negotiable contract

Every teacher path must provide deterministic provenance, exact model identity/revision when available, tenant-owned credential references, explicit enablement, bounded spend/call ceilings, audit evidence, and fail-closed behavior. The University must never silently substitute one teacher for another.

Teacher choice must be persisted with the resulting dataset/artifact so independent evaluation can correlate baseline improvement with teacher/provider and curriculum source mix.

Provider adapters may generate curriculum answers, but they cannot expand execution authority, bypass independent evaluation, authorize Production traffic, or weaken graduation thresholds.

Hosted provider support is activated only when the buyer configures the corresponding credential and adapter gate. Open-model Hugging Face teachers use the existing signed training executor and remain subject to the model-license policy before paid dispatch.

## Enterprise portability

The portable must operate after buyer handoff without SignalBoost credentials or runtime participation. Provider routing is configuration, not source migration. A customer can disable every public-cloud teacher and use only its own on-prem/private endpoint, or enable several approved teachers and compare their measured downstream results.
