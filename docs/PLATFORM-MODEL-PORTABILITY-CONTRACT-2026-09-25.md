# iTMounts Platform Model Portability Contract

Date: 2026-09-25
Status: active architecture invariant; full governed portability lifecycle implemented

## Objective

iTMounts must remain saleable and deployable without dependence on one LLM vendor, one model family, one tokenizer, one inference host, or one University base model.

`Universal compatible` means the product core is model-neutral and new models enter through a stable capability + transport-adapter contract. It does **not** mean an unknown future model is assumed safe or compatible without validation.

## Platform boundary

```text
iTMounts product / COS / specialists / Builder / University
                         |
                         v
              Model Capability Registry
                         |
              +----------+----------+
              |                     |
       model-family adapter   transport/provider adapter
              |                     |
       tokenizer/training      openai_compatible
       attention/artifacts     anthropic_messages
                              google_generate_content
                              native_sdk
                              local_runtime
                              custom_http
```

No single protocol above is the platform contract. They are adapters. An OpenAI-compatible endpoint is merely one common transport shape used by vLLM and many non-OpenAI models.

## Buyer-defined model profiles

Built-in validated profiles live in `saas/lib/ai/modelCapabilityRegistry.ts`.

A buyer may add additional model profiles with the server-only `ITMOUNTS_MODEL_REGISTRY_JSON` configuration. The registry accepts at most 64 buyer profiles and validates:

- unique profile key and model identity;
- model family;
- provider-facing model ID;
- revision policy (`fixed`, `resolve_and_pin_at_dispatch`, or `runtime_owned`);
- tokenizer identity when applicable;
- intended product uses (`cos_reasoner`, `builder`, `specialist`, `university_student`, `university_teacher`, `embedding`, `draft_speculator`);
- one or more transport protocols;
- explicit inference and training capability states.

Invalid JSON, duplicate identities, unsupported transport names, invalid capability states, or incomplete fixed revisions fail closed.

## Capability states

Every material capability is one of:

- `validated` — permitted for that exact registered profile;
- `experimental` — research/canary only;
- `blocked` — explicitly prohibited;
- `not_validated` — no Production permission exists.

Capabilities are never inferred from marketing names, model-family names, parameter counts, or provider claims.

## Portability rules

1. COS/product behavior must not depend on a specific model family.
2. Builder and specialists must request capabilities, not hard-code model names.
3. University may train only profiles registered for University use and must preserve exact base/tokenizer/artifact identity.
4. Serving code must check the selected profile's validated serving capabilities before activation.
5. Cross-model fallback is never automatic. A fallback to a different model family/revision is an explicit governed routing decision.
6. Provider credentials remain separate from model metadata and remain server-side.
7. Replacing a model must not require changing business logic, governance logic, data ownership rules, or UI contracts.

## Current Qwen position

Qwen3 is a current validated University model family, not an iTMounts dependency. The existing Qwen3-4B University student remains unchanged during phase 1. The registry simply makes its identity/capabilities explicit so a future Llama, Mistral, DeepSeek, Gemma, buyer-private model, or other compatible model can be added through the same contract.

## Phase 1 implementation

- Created the platform-wide registry at `saas/lib/ai/modelCapabilityRegistry.ts`.
- Moved current University student/teacher selection to that shared registry.
- Bound exact-artifact evaluation and RunPod provisioning to the registry.
- RunPod now requires the selected profile's validated `vllm` capability before provisioning.
- Added buyer-defined profile parsing through `ITMOUNTS_MODEL_REGISTRY_JSON`.
- Made transport protocols vendor-neutral rather than treating OpenAI-compatible chat as the platform abstraction.
## Phase 2 live-routing migration

`saas/lib/ai/local-inference.ts` now resolves every selected runtime model against the platform registry before issuing the existing `/chat/completions` request.

- A registered profile must have `inference.chatCompletion=validated`.
- This particular inference seam additionally requires `openai_compatible`; a profile that declares Anthropic/Google/native/custom transport is refused here rather than being sent to the wrong wire protocol.
- Existing unregistered runtime models remain available through a clearly marked `legacy_openai_compatible` migration binding so current deployments are not broken by the registry rollout.
- Buyers can set `ITMOUNTS_MODEL_REGISTRY_REQUIRE_REGISTERED=true` after all runtime models are defined. Strict mode then refuses any unregistered selected model.
- Runtime telemetry now records the resolved model-profile key and transport protocol, making portability state observable.

This migration rule applies to feature-specific model overrides too: when strict mode is enabled, an override model must also be registered.


## Next phases

Phase 2: move COS reasoner, Builder, specialist routing and graduate runtime selection to capability-based profile resolution.

Phase 3: add explicit provider/transport adapters and conformance tests so buyer deployments can plug in non-OpenAI-compatible runtimes without touching core reasoning or University code.

Phase 4: add admin/Console registration and health/certification UI for buyer-added models, keeping credentials in the existing server-side vault.

## Phase 3 transport adapters

The platform transport contract now has built-in protocol adapters for:

- `openai_compatible` chat completions;
- `anthropic_messages`;
- `google_generate_content`.

Buyer deployment bindings are supplied through server-only `ITMOUNTS_MODEL_TRANSPORTS_JSON`. Bindings reference a registered model profile and declare provider label, protocol, HTTPS endpoint when required, credential **environment-variable name**, optional API version, and timeout. Secret values remain outside registry JSON.

The canonical request/response contract supports system/user/assistant/tool messages, tool declarations, tool-call IDs, tool-result correlation, JSON-output intent/schema, token usage, provider/model identity, finish reason, and request ID.

Provider differences remain explicit:

- OpenAI-compatible adapters use function tools/tool calls and response-format controls.
- Anthropic uses Messages `tool_use`/`tool_result`; JSON schema mode requires a supplied schema compatible with Anthropic structured outputs.
- Google uses GenerateContent `functionCall`/`functionResponse` and preserves Gemini function-call IDs when present.
- `native_sdk`, `local_runtime`, and `custom_http` are intentionally not guessed by built-ins. Buyers/hosts inject those adapters behind the same canonical interface.

These adapters establish protocol execution capability. They do not by themselves authorize a model for COS/Builder/University; the model profile still needs the corresponding validated capability and routing policy.

## Phase 4a Model Console and certification

The owner Console at `/admin/models` is the operational surface for the portability registry.

It is intentionally split into two authority levels:

- **Inventory/readiness:** read-only inventory of registered profiles, intended uses, transport bindings, credential-presence metadata, declared inference/training capability states, adapter availability, and the latest durable certification receipt.
- **Certification:** an explicit owner action. The POST route requires `confirmSpend=true` because certification performs bounded live provider calls and may incur provider charges.

The transport certification suite currently proves:

1. configured transport health/readiness metadata;
2. a live chat-completion marker;
3. structured JSON when the profile declares `structuredJson=validated`;
4. tool calling when the profile declares `toolCalling=validated`.

Latency and remote request IDs are retained as metadata. Prompts, outputs, tool arguments/results, credentials, tokens, and provider response bodies are not persisted.

Certification receipts are appended to the existing immutable `supervisor_audit_events` ledger as `platform_model_certification_completed` using schema `platform-model-certification-v1`. A receipt is **evidence only**. It cannot activate a model, change routing, alter a capability declaration, expand authority, or authorize Production traffic.

If a profile declares additional validated capabilities that this suite does not yet exercise (for example streaming, vLLM, speculative decoding, EAGLE, MTP or XSA), the receipt is `partial`, never fully passed.

Phase 4a's server-configured registration remains available only as a bootstrap/migration path. Phase 4b supersedes it for ordinary buyer operation.

## Phase 4b durable registration, activation and rollback

The owner Console now implements the complete governed model lifecycle:

1. **Register/update** a buyer profile and transport binding without changing core product code.
2. **Encrypt credentials server-side** through the host vault before persistence; secret values are never returned to the browser or audit ledger.
3. **Rotate credentials** atomically; the superseded ciphertext row is deleted.
4. **Certify** the exact registered profile through its canonical transport adapter.
5. **Assign** a certified profile independently to `cos_reasoner`, `builder`, or `specialist`.
6. **Switch** by creating a new immutable assignment record linked to the previous assignment.
7. **Rollback** by creating a new active record pointing back to the previous certified profile.
8. **Disable** a registration only when it is not an active assignment.

The portable contracts are `ModelConfigurationPort` and `ModelCredentialVaultPort`. SignalBoost's host implementation uses Supabase for metadata/assignment records and the existing AES-256-GCM vault engine for credential ciphertext. A buyer may replace that host adapter with its own database and vault without modifying COS, Builder, model certification, or model routing.

Assignment is deliberately separate from certification. Certification never activates a model. Assignment requires explicit owner confirmation, exact certification evidence for the target profile, role-required certification checks, and optimistic concurrency against the currently active assignment ID. An active assigned model does not silently fall back to a different model family when execution fails.

## Host-injected transport SDK

`native_sdk`, `local_runtime`, and `custom_http` are supported by `createHostInjectedModelTransportAdapter()`. A buyer implements only the external wire/SDK driver; iTMounts retains capability checks, certification, routing authority, spend governance, exact response-model validation, and normalized tool/JSON semantics.

`runModelTransportPluginConformance()` verifies support, health, chat, structured JSON when declared, and tool calling when declared. A driver returning a different model identity than the assigned profile is rejected.

## Sale acceptance

The mandatory Production gate includes `modelPortabilitySaleAcceptance.node.test.ts`. It creates two fictional future model families unknown to the built-in registry, registers them through a host-neutral in-memory `ModelConfigurationPort`, resolves credentials only through the vault reference, certifies both via a host-injected `custom_http` adapter, activates the first, executes live routing, switches to the second, executes again, and rolls back to the first. No core model/provider code is changed during that lifecycle.

This acceptance proves the commercial portability contract: **new model family + new provider transport can be onboarded through configuration and a bounded adapter, not a rewrite of iTMounts core.**
