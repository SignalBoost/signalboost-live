# iTMounts Platform-Owned Graduate Routing

**Date:** September 13, 2026  
**Repository:** `SignalBoost/signalboost-live`  
**Public product:** iTMounts

## Correction

`LOCAL_AI_*` is a legacy OpenAI-compatible transport namespace. It is **not evidence that inference is local or self-hosted**.

Production currently uses that transport with a managed provider. Runtime host classification and inference telemetry determine the actual compute provider; the environment-variable prefix does not.

COS University distillation must therefore track two independent facts:

1. **Model ownership** — iTMounts controls the trained graduate artifact and its deployment lifecycle.
2. **Compute provider** — DeepInfra, Hugging Face, self-hosted hardware, or another approved runtime may execute a particular request.

An iTMounts-owned graduate may temporarily run on rented compute without becoming the provider's model.

## Required lifecycle

```text
University gap
→ governed teacher/student distillation
→ immutable iTMounts-owned student artifact
→ independent evaluation / safety / unseen-transfer / retention / Production-canary gates
→ graduate registry
→ exact serving binding + model health proof
→ active role/problem-scoped graduate
→ COS control-plane worker + Platform AI/Builder port adoption
→ ordinary approved runtime remains deterministic fallback
→ Production outcomes feed continuing education
```

DeepInfra is therefore not the destination of the learning flywheel. It may remain teacher/evaluator infrastructure where separation is required, compute infrastructure for an owned artifact, or fallback infrastructure.

## Runtime routing

PR #2271 establishes the governed graduate runtime registry and COS worker routing. This follow-up extends adoption to shared platform ports:

- COS graduate workers keep priority 200 with ordinary workers directly behind them.
- Platform AI Portables consult an active `primary` graduate before the ordinary platform gateway.
- Builder / Platform Engineer consult only an active `coder` graduate before the existing coding model.
- Graduate selection continues to use registry `workerRoles` + `problemClasses`; a reasoning graduate is not silently treated as a coding graduate.
- University / controlled-comparison evaluation context is excluded from Platform-port graduate routing, matching the COS control-plane isolation rule.
- Visual generation remains on its separately approved model path; a text graduate is never repurposed as an image model.

## Serving profiles

The graduate registry supports host-controlled profiles:

- `local_ai` — reuses the approved `LOCAL_AI` transport with the graduate runtime model.
- `graduate_ai` — uses a separately configured graduate transport.

The `graduate_ai` environment remains outside Supabase so URLs and secrets are not persisted in the registry:

```text
COS_GRADUATE_AI_BASE_URL
COS_GRADUATE_AI_ALLOWED_HOSTS
COS_GRADUATE_AI_API_KEY
COS_GRADUATE_AI_MANAGED_PROVIDER
COS_GRADUATE_AI_TIMEOUT_MS
```

Activation is bound to the exact candidate, immutable artifact hash, runtime model identity, worker roles and problem classes. Endpoint provisioning remains a separate cost-bearing owner boundary.

## Ownership and provider telemetry

`provider_inference_usage` records actual provider usage without prompts or responses. Graduate routing adds:

```text
route_owner                 itmounts | external
graduate_candidate_id
graduate_artifact_id
graduate_artifact_hash
fallback_from_owned
```

This prevents a misleading statement such as "local inference" when the request actually ran on DeepInfra, while also preventing the opposite mistake: treating an iTMounts-owned student model as if it belonged to the rented GPU provider.

Examples:

```text
provider=deepinfra   route_owner=external   model=deepseek-ai/DeepSeek-...
provider=huggingface route_owner=itmounts   model=<iTMounts graduate serving id>
provider=self_hosted route_owner=itmounts   model=<iTMounts graduate serving id>
```

Provider telemetry is now written for all inference providers, not only DeepInfra. Managed graduate endpoints therefore remain measurable after the platform starts reducing DeepInfra dependence.

## Current Reasoning & Decision Science student

The September 13 run produced the private iTMounts-owned PEFT/LoRA artifact:

```text
cadomos/itmounts-student-f993a365a01e
```

It currently has trained-artifact and rollback evidence. It is **not yet independently promoted or active**, so this routing change does not send Production traffic to it prematurely.

The artifact is an adapter, not a claim that a standard chat endpoint already serves it. A serving/materialization deployment that creates additional cost remains separately owner-approved.
