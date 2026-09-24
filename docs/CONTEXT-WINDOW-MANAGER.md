# Universal Context Window Manager

**Status:** platform invariant  
**Implementation:** `saas/lib/ai/context-window-manager.ts`

iTMounts has one final model-context boundary. Domain-specific layers may compact their own data first, but no model call is allowed to rely on an unbounded prompt or on a provider silently truncating input.

## Runtime invariant

```text
conversation / memory / retrieval / workspace / evidence / tool history
                         |
                         v
              source-specific compaction
                         |
                         v
             Universal Context Window Manager
        model + provider + exact deployment override
                         |
          +--------------+---------------+
          |                              |
 trusted system/tool contracts     untrusted/request context
 never silently truncated          deterministic bounded compaction
          |                              |
          +--------------+---------------+
                         |
                output + safety reserve
                         |
                         v
                 provider/model call
                         |
                         v
               token/context telemetry
```

The manager is an inference safety/quality boundary, not an authority system. Context, memory, retrieval, or text retained after compaction cannot grant execution authority, capability, spend, Production scope, promotion, or approval.

## Enforcement points

- `saas/lib/ai/local-inference.ts`: mandatory boundary for COS, Builder, active graduates, RunPod primary, DeepInfra/local OpenAI-compatible inference, and model/tool loops.
- `saas/lib/ai/cos/cosUniversityTeacherAdapters.ts`: mandatory boundary for hosted University faculty because those transports call provider APIs directly.
- `saas/lib/ai/cos/cosUniversityMassEvaluationContextBudget.ts`: the existing exact 8,192-token evaluator uses the shared output-budget primitive while preserving its stricter evaluator-specific grouping and fail-closed behavior.
- Upstream memory, conversation, retrieval, Builder workspace, and evidence compactors remain useful. They reduce noise before the final boundary; they do not replace it.

## Window resolution precedence

1. Exact `LocalInferenceConfig.contextWindowTokens`.
2. `ITMOUNTS_MODEL_CONTEXT_WINDOWS_JSON`.
3. `ITMOUNTS_<PROVIDER>_CONTEXT_WINDOW_TOKENS` (and `RUNPOD_PRIMARY_CONTEXT_WINDOW_TOKENS` for RunPod).
4. `LOCAL_AI_CONTEXT_WINDOW_TOKENS` or `ITMOUNTS_CONTEXT_WINDOW_TOKENS`.
5. Conservative built-in model-family floor for recognized modern model families.
6. Conservative 8,192-token default for an unrecognized model.

Example exact override:

```json
{
  "runpod:qwen3:30b": 32768,
  "deepinfra:deepseek-ai/DeepSeek-V4-Flash": 65536,
  "anthropic:claude-sonnet-4-6": 200000,
  "custom:*": 16384
}
```

Keys are case-insensitive. Exact `provider:model`, model-only, `provider:*`, and `*` entries are supported.

## Compaction rules

- Reserve output tokens before dispatch and keep a safety margin.
- Preserve the newest user/task context.
- For a single oversized prompt, retain the beginning and newest diagnostic/tail material with an explicit omission marker.
- For message histories, drop the oldest groups first.
- Assistant tool-call + tool-result exchanges are atomic protocol groups. A retained tool result is never orphaned from its initiating assistant tool call.
- Tool result text may be deterministically compacted, but tool IDs/schema structure stay intact.
- Trusted system instructions and tool definitions are not silently shortened. If they leave insufficient room for minimum input/output, the call fails closed with `context_window_budget_insufficient`.
- The manager never invokes another model to summarize omitted context, so compaction cannot create a hidden second reasoning/provider dependency.

## Telemetry

Every governed local/managed inference emits `[context-window-manager]` with model, provider, resolved window/source, estimated input before/after, requested/effective output, safety reserve, dropped-message count, and compaction state.

`[cos-local-inference-telemetry]` also carries the resolved context window and compaction measurements alongside provider token usage. This allows Production monitoring to distinguish:
- provider output truncation;
- local context compaction;
- chronic oversized prompts;
- incorrect context-window configuration.

## Operational rule

When a served model/artifact has a known exact context length, configure that exact value instead of depending on a conservative built-in floor. A model upgrade therefore changes context capacity through configuration/registry data rather than by adding another feature-specific truncation implementation.
