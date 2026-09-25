# iTMounts Platform Model Portability Contract

Date: 2026-09-25
Status: active architecture invariant; phase 1 implementation

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

## Next phases

Phase 2: move COS reasoner, Builder, specialist routing and graduate runtime selection to capability-based profile resolution.

Phase 3: add explicit provider/transport adapters and conformance tests so buyer deployments can plug in non-OpenAI-compatible runtimes without touching core reasoning or University code.

Phase 4: add admin/Console registration and health/certification UI for buyer-added models, keeping credentials in the existing server-side vault.
