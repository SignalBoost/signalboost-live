# COS Reasoning Control Plane — Phase 1

Date: 2026-08-21

## Goal

Move COS from "a system that directly calls a model" toward "an intelligence system that owns reasoning and uses replaceable workers."

The control plane owns the reasoning plan and worker selection. Model/provider identity is implementation detail and provenance, not the definition of COS.

## Phase 1 architecture

`COS -> reasoning plan -> selected worker -> result/provenance`

Worker roles are bounded to `primary`, `coder`, `critic`, `verifier`, and `researcher`.

The existing COS primary reasoner is adapted as the first `primary` worker. Today that may resolve to DeepInfra/Qwen or another approved open-model runtime through the existing `LOCAL_AI_*` seam. No production model change is required by this phase.

## Independence rule

Closed-model workers are excluded by default. A failed open-model worker does not silently fail over to Claude, OpenAI, Gemini, or another closed model. External escalation requires an explicit `allowExternalEscalation` decision from a higher COS policy layer.

## Behavior preservation

Phase 1 installs one primary worker. If a specialist role is requested before a specialist is registered, COS may use its primary worker for that role. This preserves current capability while making future specialization additive.

## Validation

`cosReasoningControlPlane.node.test.ts` covers:

- COS owns the plan while models remain replaceable workers.
- provider/model labels do not control routing.
- specialist worker selection.
- primary fallback when a specialist is not installed.
- closed-model exclusion unless escalation is explicit.
- no silent boundary crossing after a failed open-model call.
- deterministic worker priority.
- duplicate worker-ID rejection.
- blank-request fail-closed behavior.

Local Node type-stripping run: 9/9 passing.

## Next phases

1. Migrate production COS call sites from direct `callCosReasoner()` invocation to `reasonThroughCosControlPlane()` without changing answers or provider configuration.
2. Add deterministic role classification and bounded multi-step plans: retrieve/plan, worker draft, critic, verifier, accept/reject.
3. Register specialist open-model workers and record per-role cost, latency, confidence, and outcome.
4. Let COS learn worker selection from measured outcomes, with promotion gates and rollback.
5. Keep external closed models as explicit, attributable escalation workers rather than hidden primary reasoning dependencies.
