# iTMounts Platform-Owned Graduate Routing

**Date:** September 13, 2026  
**Repository:** `SignalBoost/signalboost-live`  
**Public product:** iTMounts

## Correction

`LOCAL_AI_*` is a legacy transport namespace. It is **not proof that inference is local or self-hosted**.

Production may legitimately point that OpenAI-compatible transport at a managed provider such as DeepInfra. Runtime telemetry and host classification, not the environment-variable prefix, determine the actual compute provider.

COS University distillation must therefore be evaluated on two independent axes:

1. **Model ownership** — who controls the trained artifact and its deployment lifecycle.
2. **Compute provider** — whose GPU executes a particular inference request.

An iTMounts-owned graduate may temporarily run on rented managed compute without becoming the provider's model. Telemetry must preserve both facts.

## Required lifecycle

```text
University gap
→ governed teacher/student distillation
→ iTMounts-owned immutable student artifact
→ independent evaluation / safety / transfer / retention / canary gates
→ graduate registry
→ serving binding
→ active subject-relevant iTMounts graduate
→ platform routes relevant work to graduate first
→ existing approved managed runtime is bounded fallback
→ Production outcomes feed continuing education
```

DeepInfra or another managed provider is no longer the implicit destination of the learning flywheel. It may remain compute infrastructure, teacher/evaluator infrastructure where separation is required, or bounded fallback infrastructure.

## Routing rules

- Only graduate registry rows with `status=active`, exact health evidence, exact activation evidence and `authority_expanded=false` can receive Production work.
- General COS / Chief-of-Staff / Concierge reasoning maps to `reasoning_decision_science`.
- Builder / Platform Engineer coding maps to `computer_science`.
- Security/Audit maps to `cybersecurity`.
- Quantitative/analytics work maps to `statistics_data_science`.
- Business/operations/governance work maps to `business_operations`.
- Explicit subject context overrides these heuristics only outside protected University paths.
- University practice, exams, teacher generation, grading, evaluation, fine-tuning and distillation execution are excluded from graduate routing so a student cannot teach or grade itself.
- A graduate failure permits at most one fallback to the pre-existing base runtime unless `COS_GRADUATE_AI_ALLOW_BASE_FALLBACK=false`.
- Builder does not consume a reasoning-only graduate. Future subject-specific graduates become eligible only for their own relevant scope.

## Serving profiles

Graduate registry `runtime_profile` is host-controlled:

- `graduate_ai` — separately configured iTMounts graduate endpoint.
- `local_ai` — reuses the existing OpenAI-compatible transport only when that transport is explicitly bound to the graduate runtime model.

For `graduate_ai`, runtime secrets and URLs stay in environment configuration, not Supabase:

```text
COS_GRADUATE_AI_BASE_URL
COS_GRADUATE_AI_ALLOWED_HOSTS
COS_GRADUATE_AI_PROVIDER
COS_GRADUATE_AI_API_KEY   # or HF_TOKEN for an explicitly approved protected HF endpoint
COS_GRADUATE_AI_TIMEOUT_MS
COS_GRADUATE_AI_ALLOW_BASE_FALLBACK
COS_GRADUATE_ROUTING_ENABLED
```

No active graduate is inferred from these variables alone. The exact artifact must first clear the independent promotion/activation evidence gates and be bound in the graduate registry.

## Cache and observability

The durable COS text-cache identity includes the selected graduate routing identity. Activating or replacing a graduate therefore cannot reuse an exact cached response produced by the previous DeepInfra/default model.

`provider_inference_usage` records:

- actual compute provider;
- selected model;
- `route_owner` (`itmounts` or `external`);
- graduate candidate/artifact identity when applicable;
- whether an external/base request was a fallback from an attempted owned graduate;
- provider-reported tokens and cost when available.

This makes the learning flywheel measurable: iTMounts can prove whether graduate adoption reduces managed-provider dependence rather than assuming it from configuration names.

## Current student artifact

The September 13 Reasoning & Decision Science run produced the private iTMounts-owned LoRA artifact:

```text
cadomos/itmounts-student-f993a365a01e
```

The artifact is trained and has rollback evidence, but it must not receive Production traffic until independent post-training evidence and a callable serving runtime are established. The training artifact is a PEFT/LoRA adapter, not a claim that a standard chat endpoint already serves the model.

A serving endpoint or serving-materialization job is a separate cost-bearing action and remains separately owner-approved.
