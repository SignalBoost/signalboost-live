# iTMounts Continuous Local Distillation

**Date:** September 14, 2026  
**Repository:** `SignalBoost/signalboost-live`  
**Canonical product:** iTMounts

## Decision

Distillation is not complete when a training provider produces an artifact. The purpose of paying for a teacher/training job is to transfer reusable capability into iTMounts-owned models that can run on iTMounts-controlled compute.

The canonical flywheel is:

```text
University / verified Production capability gap
→ governed teacher examples
→ controlled distillation
→ iTMounts-owned local artifact library
→ independent evaluation + safety + transfer + retention
→ RunPod/local runtime canary
→ scoped Production activation
→ DeepInfra only for unsupported work / escalation / fallback
→ observed remaining gaps feed the next distillation cycle
```

Hugging Face may be used as a training workshop. DeepInfra may be used as a teacher, evaluator where independence is preserved, or bounded runtime fallback. Neither provider is the destination of the learning flywheel.

## Local model shape

The first scalable local architecture is **one canonical open base plus many scoped LoRA adapters**, not repeated destructive rewrites of one monolithic checkpoint.

- Canonical student base: `Qwen/Qwen3-4B`.
- Distilled outputs: private iTMounts-owned LoRA adapters.
- Runtime target: iTMounts/RunPod.
- Runtime fallback: DeepInfra.
- Adapter selection: role/problem/subject scope from the governed graduate registry.
- Consolidation: mature, compatible adapters may later be merged or used to train a new base generation after separate evaluation.

This pattern allows reasoning, customer support, business, coding and specialist capability to grow independently without one domain fine-tune erasing another. It also permits rollback per capability.

## Ownership begins at training completion

`cos_local_distillation_artifacts` is the durable local-model artifact library. A signed `trained_artifact_registered` event with `trainingMode=distillation` creates a local-runtime candidate immediately. A matching rollback event advances it to `evaluation_pending`.

This is ownership/adoption tracking only. It does **not** grant Production traffic.

Lifecycle:

```text
trained_pending_rollback
→ evaluation_pending
→ runtime_pending
→ active
```

Independent graduate controls may instead move an artifact to `quarantined` or `retired`.

Only the independently authorized graduate runtime can cause `active`. The local artifact table mirrors that state; it does not manufacture it.

## Existing September 13 student

The previously trained reasoning/decision-science artifact:

```text
cadomos/itmounts-student-f993a365a01e
```

is backfilled from authoritative training-executor evidence into the local artifact library. Its current state remains `evaluation_pending` until independent promotion evidence exists. It is therefore no longer conceptually a stranded Hugging Face result, while still being barred from Production traffic until the required gates pass.

## Massive distillation policy

The long-term goal is to reduce external inference dependency, not merely reduce one bill.

1. Candidate discovery should run broadly across registered University agents and specialists.
2. Training examples must remain provenance-bound and privacy-safe.
3. Repeated external fallback areas should become high-priority University/distillation targets.
4. Distillation should produce scoped adapters for the local base.
5. Every adapter must be independently evaluated before Production use.
6. Runtime telemetry must measure local-owned handling rate, fallback rate, external-provider cost, and quality regression.
7. As local coverage grows, DeepInfra becomes teacher/escalation/fallback rather than default compute.

## Cost boundary

Large-scale distillation is intentionally **not** an unlimited auto-spend loop. Code may autonomously discover candidates, package evidence, reconcile artifacts and prepare campaigns. Provider dispatch must remain bounded by an explicit owner-approved campaign budget or the existing per-job approval mechanism.

A campaign authorization should bind at minimum:

- total dollar ceiling;
- per-job dollar ceiling;
- maximum concurrent jobs;
- exact student/base model family;
- allowed training hardware/rate ceiling;
- expiration;
- no automatic hardware upgrade;
- no automatic Production promotion;
- no authority expansion.

This allows iTMounts to distill aggressively without giving an autonomous learning loop an open-ended financial authorization.

## Success metrics

The project should be measured by:

- percentage of suitable requests served by iTMounts-owned local models;
- DeepInfra request substitution rate;
- DeepInfra cost avoided;
- local fallback/error rate;
- independent quality delta versus the teacher/baseline;
- number of active scoped adapters;
- retained transfer performance over time;
- rollback/canary health.

The desired end state is not zero external calls at any cost. It is **maximum practical independence with quality, safety, and cost evidence**.
