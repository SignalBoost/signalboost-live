# COS Independence Training & Continuous Learning Handoff — 2026-08-16

## Status

This increment advances COS from a system that mainly learns after external-teacher escalation into one that records ordinary runtime experience continuously and can measure whether external-AI dependence is actually declining.

**Evidence level at this handoff:** implementation branch, not yet production-runtime verified. Do not call the new encounter recorder or independence report production-proven until the exact merge SHA is deployed and a real COS turn is observed in `cos_cognitive_experiences`.

## North star

The underlying model is replaceable compute. COS is the learner.

```text
Observe
→ Attempt
→ Measure
→ Identify Gap
→ Investigate
→ Learn
→ Practice
→ Validate
→ Use
→ Measure Outcome
→ Retain / Strengthen / Weaken / Quarantine
→ Compose
→ Repeat
```

The desired end state is not "COS has a good model." It is a persistent learning agent whose memory, experiences, validated facts, procedural skills, capability map, outcome history and governance survive an underlying model/provider swap.

The mature workload target remains approximately **85% independent pass rate on a separately held-out SignalBoost workload**. Runtime traffic must never be relabeled as that certification set.

## Gap this increment closes

Before this change, durable cognitive experience was strongest on explicit teacher/escalation paths. Ordinary successful local reasoning, answer reuse and ordinary failed COS attempts did not consistently become bounded episodic evidence.

That created a measurement and learning blind spot:

- COS could succeed locally without preserving evidence that the class had been handled;
- cache reuse could save compute without showing up as a distinct operational-independence signal;
- repeated failed/low-confidence attempts could be visible in immediate provenance but not consistently available as durable encounter evidence;
- teacher dependency could not be compared cleanly with ordinary runtime completion from the same episodic evidence layer.

## Continuous turn experience capture

Canonical file:

- `saas/lib/ai/cos/cognitiveTurnExperience.ts`

`decideCosTurnExperience(...)` converts a meaningful COS attempt into a deterministic bounded episodic signal.

Routes are classified separately:

- `local` — accepted local/private COS reasoning;
- `cache` — answer reuse without a new reasoner invocation;
- `fresh` — current/live verification path;
- `external_required` — COS could not independently clear its evidence/confidence gate;
- `other` — other governed runtime result.

The stored evidence contains bounded execution metadata such as route, confidence, model invocation flags, cited-system counts, live-source count, escalation reason and cache-origin presence.

### What is deliberately NOT stored

The model answer is not copied into the episodic experience and is not promoted as factual truth.

The recorder explicitly labels its semantics:

```text
episodic_turn_signal_not_factual_truth
```

and success semantics:

```text
cos_gate_acceptance_not_verified_business_outcome
```

This distinction is load-bearing. A locally accepted answer is evidence that COS cleared its current answer gate; it is not proof that a campaign succeeded, a repair worked, a customer converted or a factual claim deserves durable promotion.

## Volatile/current facts

A current fact may create an episodic routing/outcome record, but the current answer is not retained as timeless semantic truth.

Fresh-route retention is explicitly labeled:

```text
routing_outcome_only_no_volatile_fact_retention
```

The existing live-first current-data policy remains authoritative. Current public facts still require fresh evidence on every request.

## Repeat encounters

The encounter hash is derived from prompt hash, response source and accepted/not-accepted outcome. Repeated identical outcomes increment `occurrence_count` instead of creating unlimited duplicate rows.

This is recurrence evidence only. Frequency alone does not promote a fact or skill.

## Runtime independence metrics

Canonical files:

- `saas/lib/ai/cos/cognitiveIndependenceMetrics.ts`
- `saas/lib/ai/cos/cognitiveIndependenceReport.ts`
- `saas/app/api/admin/cos-learning/independence/route.ts`

Owner-only report:

```text
GET /api/admin/cos-learning/independence?days=30&limit=2000
```

The report is read-only and bounded. It reads recent `encounter` and `teacher` episodic rows and reports:

- observed turn attempts;
- independently accepted turns;
- observed independent-acceptance rate;
- local accepted turns;
- cache reuse turns;
- fresh verified turns;
- other accepted turns;
- external-required turns;
- teacher interactions;
- teacher dependency rate;
- skill-grounded accepted turns;
- factual-grounded accepted turns;
- per-subject attempts / independent acceptance / external requirement / teacher interactions.

### Metric interpretation

The report semantics are explicitly:

```text
observed_runtime_learning_metrics_not_heldout_certification
```

Important boundaries:

- cache reuse counts as operational independence from an external AI call, but is separately visible and is not new reasoning competence;
- fresh-data verification may be independent from external-AI reasoning while still depending on an external data source;
- a COS-gate-accepted turn is not a verified real-world business outcome;
- teacher rows are not counted as ordinary COS turn attempts;
- an encounter explicitly marked `externalAiInvoked=true` cannot count as independently completed;
- the runtime report cannot certify the ~85% target.

## Existing learning systems this increment builds on

This change does not replace the existing learning architecture:

- teacher lesson capture;
- cognitive experiences;
- procedural candidate extraction;
- independent holdouts;
- active practice queue;
- promotion evidence;
- retention / delayed re-test;
- weakening and quarantine;
- skill composition / transfer;
- metacognitive capability map;
- Knowledge Graph / learned corpus factual promotion;
- production outcome hooks;
- governed Self-Healing diagnosis/action/verification.

The purpose is to feed those systems with a more complete stream of ordinary experience and give operators measurable evidence of whether dependency is declining.

## CI contract

`.github/workflows/saas-ci.yml` adds:

```text
COS continuous independence learning
```

It runs:

- `tests/cosContinuousTurnLearning.node.test.ts`
- `tests/cosIndependenceMetrics.node.test.ts`

The isolated gate verifies:

- local accepted work becomes episodic evidence, not factual truth;
- cache reuse remains distinct from local inference;
- failed/local-escalation attempts remain learning signals without becoming successes;
- volatile answers are not retained as durable fact content;
- runtime metrics separate local/cache/fresh/teacher paths;
- external-AI-invoked encounters never count as independent;
- teacher rows do not masquerade as turn attempts.

## Production acceptance required after merge

Do not call this increment production-proven until all of the following are observed on the exact merge SHA:

1. exact production deployment is `READY`;
2. send a stable ordinary prompt through the real `/api/concierge` path;
3. verify a new `cos_cognitive_experiences` row with `experience_kind = 'encounter'`;
4. verify its evidence says `episodic_turn_signal_not_factual_truth`;
5. verify no answer text was stored as durable episodic truth;
6. repeat the same stable prompt and verify cache/local routing is represented truthfully;
7. verify repeated identical outcome evidence increments occurrence count rather than creating unbounded duplicates;
8. query the owner-only independence report and confirm the runtime metrics reflect the observed encounters;
9. inspect Vercel telemetry to confirm the reported route/model usage agrees with execution logs.

## Next COS independence increments

After this slice is production-proven, prioritize:

1. **User feedback/correction ingestion** — durable `feedback` experiences with explicit positive/negative/correction semantics; never silently treat user text as verified fact.
2. **Verified production outcome wiring** — Self-Healing, campaign, sales, CRM, tool and workflow outcomes should feed the existing production-outcome layer so COS learns what actually worked.
3. **Autonomous curriculum prioritization** — repeated external-required attempts, teacher cost, business importance and weak/untested/conflicted metacognition should determine what COS practices next.
4. **Factual reconsolidation/pruning** — active facts/corpus knowledge need ongoing staleness, supersession, contradiction, duplicate and low-value lifecycle management analogous to procedural weakening/quarantine.
5. **Skill-library expansion** — acquire many real validated skills across SRE, Postgres, cloud, networking, security, software, AI, business, marketing and sales.
6. **Composition/transfer at scale** — exercise the already-built composition engine once at least two strong real skills exist in overlapping work.
7. **Teacher-dependency trend by problem class** — verify external calls fall after learning while quality remains stable or improves.
8. **Broad hidden workload certification** — only this separate suite may establish progress toward the ~85% independent-pass target.
9. **Model-swap validation** — prove accumulated COS intelligence remains useful when Qwen or another underlying model changes.

## Non-negotiable guardrails

- Experience is not knowledge.
- Acceptance is not verified outcome.
- Frequency is not truth.
- Teacher output is not authority merely because it came from a frontier model.
- Local-generated practice is not independent holdout evidence.
- Current facts are never made timeless by episodic retention.
- Cache reuse is not new reasoning competence.
- Capability status does not manufacture factual confidence.
- No learning mechanism widens execution authority or bypasses approvals.
- All promotions must remain auditable, reversible/quarantinable and evidence-based.

## 2026-08-16 production acceptance update for PR #1253

PR #1253 is now merged. Exact merge SHA: `3efccc51c10630c4eabb83f5288912c2edcf02bf`. Exact production deployment: `dpl_CQ5EEpGXhUU5aFpUgXc599xaxCxh` — `READY`.

Production has real post-merge normal-turn evidence:

- encounter id `c2953516-436a-4e3e-8fa7-dfc978d272c3`;
- `experience_kind = encounter`;
- `source_kind = cos_local_escalation`;
- two identical failed/local-escalation outcomes reconciled to `occurrence_count = 2`;
- evidence semantics `episodic_turn_signal_not_factual_truth`;
- no `answer` key and no `response` key retained;
- success semantics `cos_gate_acceptance_not_verified_business_outcome`;
- route `external_required`;
- local model attempted: true;
- external AI invoked at the COS-first decision boundary: false.

Matching Vercel telemetry showed the interactive request was authorized to wake RunPod, but RunPod returned `There are not enough free GPUs on the host machine to start this pod.` The local attempt therefore failed safely and the outer governed fallback later reached Gemini after Anthropic/OpenAI billing/quota failures.

**Evidence status:** normal-turn persistence, bounded semantics and repeat reconciliation are production-proven for the external-required failure route. An accepted local/cache ordinary encounter remains pending because the observed request could not obtain RunPod capacity. Do not relabel this partial proof as a complete acceptance matrix.

## Explicit user feedback / correction increment

Current branch: `feat/cos-user-feedback-learning-20260816`.

This increment uses the already-existing `experience_kind = feedback` instead of creating a parallel memory system.

Contract:

- assistant feedback is accepted only for an authenticated user's persisted conversation/assistant response;
- the learning prompt/subject is derived from the server-owned transcript, not trusted from client input;
- supported signals are `positive`, `negative`, and `correction`;
- correction text is bounded and explicitly labeled `unverified_user_correction_requires_validation`;
- no feedback automatically creates KG facts, learned-corpus knowledge, procedural skills, confidence bonuses or new execution authority;
- repeated identical feedback reconciles by deterministic experience hash;
- negative/correction feedback is only a future curriculum signal, not automatic learning/promotion;
- independence reporting exposes positive/negative/correction quality counts separately without rewriting independent-acceptance or teacher-dependency metrics;
- assistant UI exposes localized helpful / not-helpful / correction controls in EN/ES/PT/PL/RU.

Production proof required after merge:

1. exact deployment READY;
2. submit one positive feedback item on a persisted assistant response;
3. verify a durable `feedback` experience with no assistant answer text retained;
4. submit one bounded correction and verify its unverified semantics / promotion-deny flags;
5. repeat identical feedback and verify occurrence reconciliation;
6. verify independence quality metrics count feedback but capability/teacher metrics do not change merely because feedback exists.

After this, the next independence increment remains verified production-outcome wiring and autonomous curriculum prioritization from repeated failures, external-teacher dependence/cost, business importance, and weak/untested/conflicted capability classes.

