# COS / Concierge Coding-Model Routing — 2026-09-02

## Status

**Workstream:** active on `feat/cos-deepseek-coding-router-20260902`; not Production-accepted.

## Owner decision

Keep the normal COS / Concierge reasoner on the current DeepInfra Qwen baseline. Route authenticated coding, debugging, Builder, and COS Platform Engineer model-control work to a coding-specialist model on the same managed DeepInfra transport.

Initial coding specialist:

`deepseek-ai/DeepSeek-V4-Flash-0731`

The purpose is to improve coding/tool-loop quality without paying for a more expensive model on ordinary COS traffic. DeepSeek V4 Pro is **not** enabled as an automatic escalation in this phase; a higher-cost escalation requires measured Builder quality/cost evidence and a separate promotion decision.

## Routing contract

```text
normal conversation / research / support
→ COS / Concierge
→ existing Qwen primary reasoner

explicit coding / create / debug / repair objective
→ existing Concierge coding-intent gate
→ Builder or owner-only Platform Engineer as already authorized
→ DeepSeek V4 Flash model-control port
→ existing inspect / edit / run / verify loop
```

Model selection is compute specialization only. It must not grant a model any additional tool, workspace, repository, deployment, merge, secret, approval, tenant, or external-action authority.

## Provider / secret boundary

- Keep the existing DeepInfra OpenAI-compatible base URL and server-side `LOCAL_AI_API_KEY`.
- Add only a server-side Builder model selector, `BUILDER_AI_MODEL`.
- Default it to `deepseek-ai/DeepSeek-V4-Flash-0731`.
- Do not expose arbitrary model selection in browser/user input.
- Do not add another provider credential.
- Do not reintroduce RunPod.

## Implementation requirements

1. Add a dedicated Builder coding-model port instead of replacing the general COS model.
2. Route both ordinary durable Builder jobs and SignalBoost Platform Engineer repository-repair loops through that port.
3. Keep Concierge's existing coding-intent and authorization gates; no new execution authority is created by this change.
4. Avoid cross-model stale reuse. Builder control turns must not reuse a Qwen result as though it came from DeepSeek.
5. Preserve truthful model telemetry from the existing local-inference transport.
6. Add deterministic regressions proving the general COS port stays unchanged and both Builder execution lanes use the coding-specialist port.
7. Keep rollback bounded: removing `BUILDER_AI_MODEL` uses the code-owned DeepSeek Flash default for this workstream; reverting this feature restores the prior shared Qwen port.

## Acceptance gate

A branch or green compile is not Production acceptance. Promotion requires:

- deterministic coding-model routing regressions;
- existing Builder/security/regression suite still green;
- exact Preview TypeScript/build and Vercel gate green;
- current-main synchronization and main-write token discipline;
- merged Production deployment READY;
- a fresh authenticated Builder coding/repair observation showing successful tool-loop verification and truthful model provenance.

Do not claim the specialist route Production-accepted before the runtime observation exists.
