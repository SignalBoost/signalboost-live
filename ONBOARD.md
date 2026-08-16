# ONBOARD.md

# SignalBoost Engineering Blueprint
## Cognitive Operating System (COS)

**Version:** 1.11  
**Updated:** 2026-08-16  
**Overall engineering progress estimate:** ~98% — not an Enterprise Release Candidate declaration  
**COS Independence / Autonomous-Intelligence Architecture:** COMPLETE  
**COS Independent Runtime:** ACTIVE on the current local RunPod reasoner (`qwen2.5-coder:32b`); `qwen3:30b` is the intended durable default but is not yet live on the existing pod  
**COS Cognitive Learning:** ACTIVE LEARNING / RETENTION / COMPOSITION / METACOGNITION MERGED; NORMAL-TURN EXPERIENCE CAPTURE PARTIALLY PRODUCTION-PROVEN; USER FEEDBACK MERGED WITH PRODUCTION ACCEPTANCE PENDING; VERIFIED PRODUCTION-OUTCOME WIRING IN PR #1259  
**Marketing & Sales Core Architecture:** COMPLETE  
**Self-Healing Supervisor:** NATIVE PROACTIVE MONITORING PRODUCTION-VERIFIED; NATIVE INCIDENT → COS → GOVERNED AGENT GATEWAY/MCP LOOP MERGED  
**Enterprise Release Candidate:** EVIDENCE-BASED — never infer from architecture or a green deployment

---

## Mandatory first-read rule

This file is the canonical starting point for every developer, AI coding agent, reviewer, operator, contractor, and infrastructure assistant working on this repository.

1. Read `ONBOARD.md`.
2. Read `docs/HANDOFF-COS-INDEPENDENCE-TRAINING-2026-08-16.md` for the current COS continuous-learning / independence program and its exact evidence level.
3. Read `docs/HANDOFF-2026-08-13.md` for the broader dated engineering takeover state.
4. For COS active learning, read `docs/HANDOFF-COS-ACTIVE-LEARNING-2026-08-13.md`.
5. For Self-Healing, read `docs/portables/self-healing-monitoring-current-state-20260813.md`.
6. Scan current `main`.
7. Read the exact files related to the task.
8. Verify implementation/runtime from code and live evidence before diagnosing, changing, or reporting status.
9. Never report behavior from memory alone.

`AGENTS.md` and `CLAUDE.md` are entry-point summaries. `docs/ONBOARD-full.md` is the deeper historical/operational reference. Current repository evidence and the newest dated handoff win over stale documentation.

---

# 2026-08-16 CURRENT COS LEARNING / INDEPENDENCE OVERRIDE

The primary COS development objective is now **continuous independence training and capability expansion**: COS must keep learning from normal work and measurably reduce dependence on replaceable external AI teachers without weakening evidence, confidence, safety or approval gates.

North-star loop:

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

The underlying model is replaceable compute. **COS is the learner.** The durable asset is COS-owned memory, experiences, facts, procedural skills, metacognitive capability state, outcome history, source/provenance knowledge and governance.

PR #1253 (`feat/cos-continuous-independence-learning-20260816`) is merged and has partial production proof. It provides:

- bounded episodic capture of meaningful normal COS turns in `cos_cognitive_experiences`;
- explicit separation of local reasoning, answer-cache reuse, fresh verification, external-required failure and other runtime routes;
- no model answer text automatically retained as factual truth;
- volatile/current requests retain only routing/outcome learning, never the current answer as timeless semantic fact;
- repeated identical turn outcomes increment occurrence evidence rather than creating unlimited duplicates;
- owner-only read-only runtime independence report at `/api/admin/cos-learning/independence`;
- metrics for local accepted work, cache reuse, fresh verification, external-required attempts, teacher interactions, teacher dependency and grounded reuse by problem class;
- an isolated `COS continuous independence learning` CI gate.

PR #1255 added governed explicit helpful / not-helpful / correction feedback as episodic learning evidence and was merged as `429bfd5a750ba7c6804cb13773bc0a4708cc0f7c`. Production acceptance of real feedback events remains pending; do not infer it from merge/deploy status alone.

Current increment PR #1259 (`feat/cos-verified-production-outcomes-20260816`) adds a generic, idempotent verified production/business outcome recorder, wires the already-authoritative Self-Healing tool/read-back and exact Vercel terminal-verification paths into it, and extends independence reporting with verified production success/failure/observed metrics by problem class and domain. At this point it is an open implementation PR; CI/merge/production runtime proof are still required.

The runtime independence report is deliberately labeled `observed_runtime_learning_metrics_not_heldout_certification`. Runtime traffic is not a hidden benchmark. Cache reuse is useful operational independence but not new reasoning competence. A COS-gate-accepted answer is not the same thing as a verified business/production outcome.

The mature target remains roughly **85% independent pass rate on a separate held-out SignalBoost workload**. Never lower the 0.72 confidence/evidence gate, inflate scores, fabricate skills, or count self-generated practice as holdout evidence to improve that number.

Next COS independence increments:

1. production-prove the merged explicit user feedback/correction increment (#1255);
2. merge and production-prove verified Self-Healing production-outcome learning (#1259), then connect campaign, sales and CRM authoritative outcome producers to the same generic recorder;
3. autonomous curriculum prioritization from repeated failures, teacher dependency/cost, business importance and weak/untested/conflicted capability areas;
4. factual reconsolidation/pruning for stale, superseded, contradictory, duplicate and low-value knowledge;
5. broad real skill-library expansion and composition/transfer;
6. teacher-dependency trend by problem class;
7. separate hidden held-out certification toward the ~85% independent target;
8. model-swap validation proving COS intelligence survives replacement of Qwen or another underlying reasoner.

Full current handoff: `docs/HANDOFF-COS-INDEPENDENCE-TRAINING-2026-08-16.md`.

### 2026-08-16 continuous-learning production evidence

PR #1253 merged and exact production deployment `dpl_CQ5EEpGXhUU5aFpUgXc599xaxCxh` for merge `3efccc51c10630c4eabb83f5288912c2edcf02bf` reached `READY`. A real ordinary `/api/concierge` request after the merge created durable encounter `c2953516-436a-4e3e-8fa7-dfc978d272c3`; the same failed/local-escalation outcome occurred twice and reconciled to `occurrence_count = 2` rather than creating duplicate rows. The evidence is explicitly `episodic_turn_signal_not_factual_truth`, contains no `answer` or `response` key, and records local Qwen attempted / external AI not yet invoked at the COS-first decision boundary. Matching Vercel telemetry showed RunPod could not start because the host reported insufficient free GPUs, after which the governed external fallback eventually used Gemini.

Therefore normal-turn capture/deduplication is production-proven for a real external-required failure path. **Accepted local/cache encounter acceptance remains pending** because the observed production request could not obtain RunPod capacity; do not claim the full #1253 acceptance matrix complete until a real accepted local/cache turn is observed.

PR #1255 adds explicit helpful / not-helpful / correction signals as `feedback` episodic experiences. User correction text remains bounded unverified evidence; it cannot automatically promote a fact or skill, raise confidence, or widen execution authority. Negative/correction signals become eligible inputs for the later autonomous curriculum prioritizer only after this evidence layer is production-accepted.

### 2026-08-16 verified production-outcome increment — PR #1259

PR #1259 introduces `saas/lib/ai/cos/cognitiveVerifiedOutcome.ts` as the generic bridge from objective real-world evidence into `production_use` episodic memory. The recorder:

- accepts only `deterministic_tool`, `production_outcome`, or `authoritative_record` source classes;
- rejects model/Council output as verified outcome authority;
- records `success`, `failure`, or non-terminal `observed` separately;
- uses deterministic idempotency so duplicate delivery of one authoritative event is not counted as new proof;
- preserves the bounded COS problem-class taxonomy and records a small domain class (`self_healing`, `campaign`, `sales`, `crm`, `governed_tool`, `workflow`, `other`);
- bounds retained facts/summary and labels the experience `verified_production_outcome_signal_not_factual_promotion`;
- never promotes a fact or skill, increases answer confidence, or widens execution authority merely because an outcome exists.

The first real producer wiring is Self-Healing because it already has authoritative evidence boundaries: governed Agent Gateway deterministic tool/read-back results and the exact Vercel deployment terminal verifier. Specific procedural skill credit remains on the pre-existing deterministic Council prediction attribution path; a problem-class success alone is not causal proof that one skill produced it.

The owner independence report now has separate verified production outcome totals, success/failure/observed counts, terminal production success rate, per-domain buckets and per-problem-class outcome counts. Observed/non-terminal rows are excluded from the success-rate denominator, and these metrics do not alter independent-answer or teacher-dependency math.

**Evidence level at this line:** implementation PR only. CI, merge, deployment and real `production_use` row evidence are still required. Campaign/sales/CRM have the generic recorder contract available after merge, but their authoritative producers are not yet wired and must not be reported as such.

---

# Mission

SignalBoost is a Cognitive Operating System that powers specialized business modules and Portables. COS owns reusable intelligence, memory, learning, planning, governance, cost control, verification, provider selection and reusable operational knowledge.

External AI/data providers are replaceable compute, teacher, or enrichment resources. They do not own SignalBoost intelligence.

```text
Observe → Remember → Learn → Reason → Act → Verify → Improve
```

The commercial asset is not Qwen, RunPod, OpenAI, Anthropic, Gemini or any single provider. The asset is the COS system, its accumulated validated memory/skills/tool competence and the governed runtime that can move between models/providers.

---

# COS execution order

```text
Request / Goal
→ deterministic business rules
→ exact / semantic / durable reuse
→ Enterprise Memory
→ Knowledge Graph
→ Continuous Learning / bounded context
→ validated procedural skills
→ local/private COS reasoning
→ confidence/evidence gate
→ bounded research or replaceable external teacher/provider only when justified and permitted
→ verification
→ learning / episodic memory / skill practice / ROI telemetry
```

Primary answer path: `saas/lib/ai/cos/cosFirstAnswer.ts`.

Current live development reasoner at this handoff: `qwen2.5-coder:32b` on the existing RunPod pod. Do **not** report Qwen3 as live until production telemetry proves the pod was updated and `LOCAL_AI_MODEL` points to it.

Typical configuration:

```dotenv
COS_LOCAL_FIRST_ENABLED=true
LOCAL_AI_BASE_URL=https://<private-open-model-endpoint>/v1
LOCAL_AI_MODEL=<served-model-name>
LOCAL_AI_API_KEY=<server-side-secret>
LOCAL_AI_ALLOWED_HOSTS=<exact-hostname>
LOCAL_AI_ALLOW_CLOUD_FALLBACK=false
```

Remote private inference must use HTTPS, authentication and exact-host allowlisting. The repository also contains a self-hosted open-model stack under `appliance/local-ai/`.

---

# Core principles

- COS is the reusable intelligence/governance layer; Portables must not create provider-owned reasoning silos.
- AI is the last resort when deterministic code, known knowledge, cache, durable reuse or validated skills suffice.
- Prefer local/private compute before approved commercial AI providers.
- Never pay twice for knowledge or work SignalBoost already owns with sufficient confidence and freshness.
- Providers are replaceable edges around a provider-neutral core.
- Preserve tenant isolation, auditability and explicit execution boundaries.
- Consequential actions remain behind applicable approval controls.
- A provider/model answer is not trusted truth because of provider prestige.
- Capability/lifecycle status and answer confidence are separate quantities.

---

# 2026-08-13 production/current-state checkpoint

At the time this onboarding was refreshed:

- current `main`: `85e53a2e6699837147ab816bdda1f2f540b6a62e` (PR #1160 merge) before this documentation-only update;
- latest PR #1160 production deployment observed: `dpl_CSfDedRPuYas6SjbsdnqyGP4TC2Y`, `READY`;
- production database snapshot: 1 Continuous Learning row, 5 Knowledge Graph facts, 5/5 facts embedded, 1 teacher lesson, 1 cognitive experience, 1 cognitive skill, 0 active-practice queue rows, 0 promotion rows at the instant queried;
- validated skill: `diagnose-tenant-specific-tail-latency`, with 2/2 practice, 3/3 distinct holdouts and 0 failures;
- native Self-Healing monitoring remains production-runtime-verified;
- PR #1159 and #1160 are merged on `main`.

Counts are dated operational evidence, not product guarantees. Re-query production before using them in a status report.

Full takeover detail: `docs/HANDOFF-2026-08-13.md`.

---

# COS knowledge, cache and provenance — authoritative doctrine

The live COS-first answer path has distinct layers that must not be conflated:

1. **Answer reuse** — exact/semantic cached answers are policy-versioned and age-bounded.
2. **Structured Knowledge Graph / Enterprise Memory facts** — `cos_knowledge_facts` supports 768-dimensional local embeddings and nearest-neighbor retrieval through `cos_match_knowledge_facts`.
3. **Continuous Learning corpus** — retained source material must be substantive enough to justify learning; metadata/discovery snippets are not equivalent to source content.
4. **Procedural Cognitive Skills** — reusable methods/procedures are separate from factual evidence and use `[SK#]` provenance.
5. **Teacher/Episodic signals** — external escalation outcomes and experiences are evidence for reflection/training, not automatically factual memory.

Authoritative provenance reports the real funnel:

```text
retrieved → relevant → selected → injected → cited
```

A component is called `USED` only when the answer demonstrably cites/uses it. Retrieval or injection alone is not use.

For cached answers, the current request must not claim a fresh local-model/evidence execution. Generating-turn origin evidence is retained separately.

COS confidence does not receive extra factual evidence credit merely because many internal items were injected. The higher evidence ceiling is earned from cited factual grounding. Procedural skill status does not create factual evidence credit. The model-only ceiling remains 0.78, above the default 0.72 escalation gate.

## Cache policy rule

`saas/lib/ai/cos/cosAnswerPolicy.ts` partitions cached answers by prompt/model/threshold/gate revision. Bump the manual gate revision whenever the acceptance/citation/evidence-accounting semantics change in a way not already represented by the hashed inputs.

PR #1158 exposed a real stale-cache defect during production verification: a pre-citation-policy answer could otherwise bypass the new skill-provenance contract. The answer-policy revision was bumped so old rows become unreachable instead of silently reused.

---

# COS factual-learning pipeline — current state

Production previously retained 262 low-substance rows with confidence clustered near ~0.8 and `cos_knowledge_facts = 0`. Average summary lengths strongly indicated metadata/abstract/discovery snippets rather than real source content, including `video_transcript` rows averaging roughly 161 characters.

A corrective production purge removed 261/262 obsolete rows and reopened resolved learning gaps. The following existing repository migrations were applied in production:

- `saas/supabase/migrations/20260813_cos_learning_fact_promotion_state.sql`
- `saas/supabase/migrations/20260813_cos_knowledge_fact_embeddings.sql`
- `saas/supabase/migrations/20260813_cos_teacher_lessons.sql`
- `saas/supabase/migrations/20260813_cos_cognitive_learning_lifecycle.sql`
- `saas/supabase/migrations/20260813_cos_active_learning_queue.sql`

Current production snapshot at this handoff shows 5 structured facts and all 5 have embeddings. Do not infer that a given answer used them; inspect provenance.

Primary files:

- `saas/lib/ai/cos/knowledgeFactExtraction.ts`
- `saas/lib/ai/cos/autoPromoteLearning.ts`
- `saas/lib/ai/cos/knowledgeFactSemantic.ts`
- `saas/app/api/cron/cos-knowledge-promotion/route.ts`
- `saas/lib/cos-core/storage/supabase.ts`
- `saas/lib/cos-core/layers/knowledge/persistent.ts`
- `saas/lib/ai/cos/localEmbeddings.ts`

---

# Real YouTube transcript doctrine

PR #1140 added `saas/public/cos-runpod-transcript.sh` and transcript-runtime derivation in `liveSources.ts`.

The installer is designed to:

- reuse the existing `/workspace/cos-api-key` without printing/replacing it;
- leave Ollama/Qwen untouched;
- create an isolated transcript venv/service under `/workspace`;
- serve authenticated transcript requests on port 8888;
- return real caption text, not discovery metadata;
- reject caption fragments under 200 chars;
- distinguish datacenter/IP blocking/429 from no-caption conditions.

If `YOUTUBE_TRANSCRIPT_API_URL` is absent, `liveSources.ts` may derive the transcript endpoint only from the exact trusted HTTPS RunPod reasoner proxy pattern (`-11434.proxy.runpod.net` → `-8888.proxy.runpod.net/transcript`) and reuse `LOCAL_AI_API_KEY`.

**Merged code is not runtime proof.** The service must actually be running in the pod and port 8888 reachable. Do not ask the user to expose `/workspace/cos-api-key`.

---

# COS cognitive-learning doctrine and implementation

The north star is a continuously learning cognitive system, not a perfect single model.

Use empirical workload-relative targets:

- roughly **85% independent pass rate** is the mature target on the defined SignalBoost workload;
- roughly **92–95%** is a longer-term ambition only if held-out evidence supports it;
- external frontier models belong primarily in the genuinely difficult/novel/disputed/high-consequence tail.

These percentages are capability targets, not confidence targets.

Human-inspired learning loop:

```text
PERCEIVE
→ RECALL
→ THINK
→ INVESTIGATE / USE TOOLS
→ TEST
→ ANSWER / ACT
→ FEEDBACK
→ REFLECT
→ LEARN
→ PRACTICE ON UNSEEN VARIANTS
→ CONSOLIDATE
→ FORGET / WEAKEN / QUARANTINE BAD ASSOCIATIONS
```

Canonical lifecycle:

```text
encountered
→ evaluated
→ understood
→ practiced
→ validated
→ learned
→ mastered
```

A source document, teacher answer, or one successful retry is not automatically learned.

COS models/should model:

- **episodic memory** — attempts, evidence, outcomes, corrections, disagreements;
- **semantic memory** — validated generalized facts/concepts;
- **procedural memory** — skills with prerequisites, observables, falsifiers and failure modes;
- **metacognition** — strong/weak/untested/repeatedly-failed classes and escalation need;
- **consolidation** — bounded review/cluster/contradiction resolution/practice scheduling;
- **forgetting/reconsolidation** — weakening, expiry, supersession or quarantine of stale/misleading knowledge.

External providers are teachers/escalation resources, not automatic authorities.

Teacher loop:

```text
COS attempts
→ internal tools/specialists investigate
→ external teacher only when justified
→ capture local attempt + teacher result + disagreement/evidence
→ evaluate
→ extract generalized procedural candidate
→ practice
→ independent unseen holdout validation
→ promote only after evidence
→ measure whether future external calls decline
```

---

# First validated cognitive-skill proof

Current skill: `diagnose-tenant-specific-tail-latency`.

Production DB snapshot:

- status: `validated`;
- evaluator approved: true;
- understanding approved: true;
- practice 2/2;
- holdout 3/3;
- distinct holdout variants: 3;
- failures: 0.

One holdout deliberately favored an enterprise-only SAML/audit middleware path. COS re-ranked it above the stored template, demonstrating generalization rather than rote copying.

Fresh production-path proof after cache invalidation showed:

- local reasoner invoked: yes;
- reasoner: `independent-local:qwen2.5-coder:32b`;
- confidence: 0.78;
- external AI: no;
- cognitive skill funnel: 1 retrieved → 1 relevant → 1 selected → 1 injected → 1 cited;
- authoritative provenance: cognitive skill `USED`;
- no false KG/corpus evidence credit.

PR #1158 added a citation-only local-model repair. It accepts only supplied `[SK#]` labels and only if removing those labels leaves answer substance unchanged. Production telemetry confirmed the repair was attempted and accepted for `[SK1]`.

`recordCitedCognitiveSkillReuse()` exists but current `reuse_count` remained 0 at this handoff. Wire reuse accounting only on actual cited use, never mere retrieval/injection.

---

# Durable active-learning loop — PR #1160

PR #1160 merged as `85e53a2e6699837147ab816bdda1f2f540b6a62e` and its production deployment was observed `READY`.

Canonical files:

- `saas/lib/ai/cos/cognitiveActiveLearning.ts`
- `saas/lib/ai/cos/cognitiveSkillCandidate.ts`
- `saas/lib/ai/cos/cognitiveLearningLifecycle.ts`
- `saas/lib/cos/aiPort.ts`
- `saas/app/api/cron/cos-mining/route.ts`
- `saas/supabase/migrations/20260813_cos_active_learning_queue.sql`
- `saas/tests/cosCognitiveActiveLearning.node.test.ts`

Behavior:

- captured teacher lessons can be reflected on by local COS into generalized procedural candidates;
- candidates require procedure, discriminating signals, observables, falsifiers, failure modes and prohibited actions;
- memorization-shaped/non-falsifiable candidates are rejected;
- local-generated exercises are practice only and are structurally prohibited from counting as holdout evidence;
- independent holdouts may come only from allowed independent sources (teacher/evaluator, curated, production replay);
- `cos_active_practice_queue` stores durable work;
- `cos_learning_promotions` stores promotion evidence;
- `cos_record_cognitive_practice_result(...)` atomically records episodic result + counters;
- lifecycle eligibility is recomputed by deterministic policy after exercises;
- active learning is batched into the existing daily COS mining cron;
- external evaluation is optional behind `COS_COGNITIVE_EXTERNAL_EVALUATION_ENABLED=true` and `CosAiPort`;
- active learning does not change answer-confidence formulas.

Full current subsystem handoff: `docs/HANDOFF-COS-ACTIVE-LEARNING-2026-08-13.md`.

---

# Qwen3 cutover — do not misreport

`qwen3:30b` is the durable intended bootstrap/default model in code, but the live existing pod still serves `qwen2.5-coder:32b` at this handoff.

The ~19 GB Qwen3 pull could not be completed through the current authenticated RunPod HTTPS/Ollama gateway because the intermediate gateway buffers long upstream pulls and the request path times out. Ollama streaming cannot help when the intermediary buffers the stream. RunPod's management API does not provide arbitrary remote shell execution.

Remaining cutover requires legitimate pod shell access (RunPod Web Terminal or SSH/another supported shell path), then explicit verification:

1. model appears in `ollama list`;
2. authenticated direct inference succeeds;
3. production model configuration is switched;
4. COS health/provenance reports the new model;
5. held-out quality/latency/cost is benchmarked before declaring improvement.

Never expose local API keys while performing the cutover.

---

# Enterprise BYOM/BYOA requirement

PR #1157 made AI portability an enterprise release requirement.

Required properties:

- no mandatory Qwen/RunPod/OpenAI/Anthropic/Gemini dependency;
- buyer-owned credentials/compute where desired;
- replaceable model/agent adapters;
- models are not governance authorities;
- COS-owned memory/skills/provenance survive model swaps.

A buyer can deploy COS alongside its existing OpenAI, Anthropic, or other agent. The development stack does not define the product identity.

Reference: `docs/portables/cos-byom-byoa-enterprise.md` and `saas/lib/release-candidate/cos-enterprise-ai.ts`.

---

# Self-Healing Supervisor — authoritative doctrine

The Self-Healing Supervisor is proactive, not merely reactive to incidents delivered by an external monitoring product.

Native monitoring is a first-class capability and should be default-capable for a plug-and-play installation. Buyer monitoring may coexist in `hybrid` mode or intentionally replace native monitoring in `external` mode.

Canonical monitoring files:

- `saas/self-healing-host/native-monitoring-policy.ts`
- `saas/self-healing-host/native-monitoring-runtime.ts`
- `saas/self-healing-host/native-proactive-monitoring.ts`
- `saas/app/api/cron/native-proactive-monitoring/route.ts`
- `saas/supabase/migrations/20260812_self_healing_native_proactive_monitoring.sql`

Native coverage includes:

- Vercel deployment/provider health;
- SignalBoost platform-health conditions such as queue growth, scheduler/provider failures, resource pressure, stale leases/heartbeats, verification/audit failures;
- API p95/5xx probes with durable baselines;
- database connection pressure/latency probes;
- storage reachability/usage/capacity probes;
- TLS certificate-expiry probes.

Probe samples persist in `self_healing_native_probe_samples`. Database/storage collectors use bounded aggregate service-role paths rather than exposing sensitive query/object content.

Existing external adapters include Datadog, PagerDuty, AWS CloudWatch/EventBridge, Prometheus Alertmanager, Splunk, Azure Monitor, Grafana Alerting and Google Cloud Operations. They remain `staged` until live-provider validation promotes them to `certified`.

Native proactive monitoring was production-runtime-verified before this refresh: migration applied, scheduled cron observed, samples persisted repeatedly across all four proactive probe families.

---

# Self-Healing native anomaly → COS → governed remediation — PR #1159

PR #1159 merged as `aadb940d9074c9ed19c7913b5cbea83eae37811e`.

It closes the prior gap where native proactive monitoring could detect incidents but stop at the response.

Canonical loop:

```text
Native monitor / probe
→ detect anomaly
→ collect bounded evidence through Portable Connector Runtime
→ normalize incident
→ COS-first diagnosis
→ registered repair plan
→ Agent Gateway / MCP governance
→ execute if explicitly permitted
   OR stage / require approval / fail closed
→ verify
→ audit
→ learn
```

Canonical file: `saas/self-healing-host/native-autonomous-loop.ts`.

`/api/cron/native-proactive-monitoring` only invokes the expensive diagnosis/remediation path when anomalies/incidents exist. It remains `CRON_SECRET` protected and fails closed when required monitoring storage/schema is unavailable.

PR #1159 does **not** add new mutation authority. Unknown/consequential/destructive/financial/security actions remain governed/approval-gated.

Current Self-Healing handoff: `docs/portables/self-healing-monitoring-current-state-20260813.md`.

---

# Remediation workflow

```text
Monitor / Observe
→ detect degradation, risk or incident
→ collect bounded evidence
→ diagnose / reason
→ select registered repair capability
→ policy / risk classification
→ routine + explicitly pre-authorized bounded repair may execute automatically
→ consequential action requires approval
→ verify
→ audit
→ learn
```

Automatic routine repair never means arbitrary mutation. The action must remain inside an explicitly registered capability with allowed provider/resource/method/parameter scope, reversibility and execution limits.

---

# Cost / ROI governance

Track provider calls avoided, cache/reuse hits, knowledge hits, local executions, external fallbacks, provider cost, avoided cost, latency, retries, successful outcomes and learning reuse/effectiveness.

For cognitive learning also track:

- independent pass rate;
- external escalation rate by domain/problem class;
- held-out validation rate;
- retention/delayed re-test;
- paraphrase/generalization robustness;
- skill success/failure/revalidation/decay;
- teacher-call avoidance after learning;
- actual cited skill reuse;
- verified production success/failure/observed outcomes by problem class and operating domain.

The best evidence that COS learned a class is improved held-out behavior plus fewer repeat external escalations **and** stable/improving verified real-world outcomes, not more rows in a database.

---

# Marketing & Sales state

Marketing & Sales core architecture is complete, including Enterprise Memory, Knowledge Graph, Continuous Learning, Goal Engine, Prospect Intelligence, Business Intelligence Corpus, Communication Hub, CRM production paths, Revenue Intelligence, Universal Adapter seams, campaign/outreach queues, approval gates, audit, telemetry, cost governance and localization guardrails.

The 5,000-company Business Intelligence Corpus is a data-population target, not unfinished architecture. Always use live status rather than a historical count.

Owner/admin route: `/dashboard/data/business-intelligence-corpus`  
Status API: `/api/admin/business-intelligence-corpus/status`

---

# Enterprise Release Candidate

A green Vercel deployment is necessary but not sufficient to declare Enterprise RC. The fail-closed profiles under `saas/lib/release-candidate/` require real evidence for deployment, tenant isolation, security, resilience, load/soak, observability, end-to-end integration, documentation currency and the applicable AI portability profile.

Missing evidence is `not_run`, not pass.

---

# Security / secrets

- Never hard-code or expose secrets.
- Never print full provider keys/tokens.
- Never expose `/workspace/cos-api-key`.
- Use approved Vault/environment/server-side storage boundaries.
- Preserve tenant/org scoping and RLS/server-role assumptions.
- Keep owner/admin routes server-gated.
- Keep cron routes `CRON_SECRET` protected.
- Remote private inference must be HTTPS, authenticated and exact-host allowlisted.
- Do not create temporary unauthenticated production triggers merely to accelerate verification.

---

# Localization

Core supported languages: English (`en`), Spanish (`es`), Portuguese (`pt`), Polish (`pl`), Russian (`ru`). New user-facing copy must follow repository i18n guardrails.

---

# Build / test / deploy rules

- Prefer coherent batches of related changes.
- Read files before changing them.
- Preserve existing behavior unless the task requires change.
- Reuse existing real collectors/adapters instead of duplicating them.
- Do not add placeholders merely to increase feature/adapter counts.
- Run/observe relevant typecheck, build and tests before calling a batch successful.
- Never claim CI/build/deployment passed unless it actually did.
- Never call a branch commit production.
- Re-check current `main` after concurrent work.
- Production database state must be verified separately from a green Vercel build.

---

# Documentation map

**Current COS independence / continuous learning:**
- `docs/HANDOFF-COS-INDEPENDENCE-TRAINING-2026-08-16.md`

**Current master handoff:**
- `docs/HANDOFF-2026-08-13.md`

**COS cognitive/active learning:**
- `docs/HANDOFF-COS-ACTIVE-LEARNING-2026-08-13.md`
- `docs/HANDOFF-COS-COGNITIVE-LEARNING-2026-08-12.md` — earlier design/north-star handoff; useful history, not the latest state

**Self-Healing Supervisor:**
- `docs/portables/self-healing-monitoring-current-state-20260813.md`
- `docs/portables/self-healing-monitoring-current-state-20260812.md` — earlier verification snapshot
- `docs/portables/self-healing-monitoring-connections.md`
- `docs/portables/self-healing-technical-walkthrough.md`
- `docs/portables/self-healing-operations-runbook.md`
- `docs/portables/self-healing-integration-guide.md`
- `docs/portables/self-healing-evaluation-brief.md`

**Enterprise COS portability:**
- `docs/portables/cos-byom-byoa-enterprise.md`
- `saas/lib/release-candidate/cos-enterprise-ai.ts`

**Marketing & Sales:**
- `docs/marketing-sales-current-state.md`
- `saas/docs/marketing-sales-module-design.md`
- `docs/business-intelligence-corpus.md`
- `docs/enterprise-release-candidate.md`

**COS / enterprise architecture:**
- `saas/lib/ai/cos/`
- `saas/lib/ai/local-inference.ts`
- `saas/lib/cos/`
- `saas/lib/cos-core/`
- `saas/lib/enterprise/`
- `saas/lib/enterprise-ai-os/`
- `appliance/local-ai/`

**Historical/operational detail:**
- `docs/ONBOARD-full.md`
- `docs/HANDOFF-2026-08-12.md`

---

# Recent merged sequence to know before touching COS/Self-Healing

Historical foundation:

- #1132 — native proactive Self-Healing probes;
- #1133–#1136 — evidence funnel, cache/provenance and cited-grounding confidence hardening;
- #1138 — semantic filtering/generic diagnostic-quality repair;
- #1140 — RunPod transcript installer + secure transcript endpoint derivation;
- #1141 — learning-source pacing/circuit/reuse hardening;
- #1152 — Gemini fallback + teacher lesson capture + Qwen3 durable default;
- cognitive lifecycle/experience/skill work preceding #1156;
- #1156 — only validated procedural skills can enter live reasoning;
- #1157 — BYOM/BYOA enterprise release requirement;
- #1158 — citation-safe procedural skill provenance;
- #1159 — native Self-Healing incident-to-governed-remediation loop;
- #1160 — durable active-learning/practice/holdout loop;
- #1162 — retention, consolidation, weakening and quarantine;
- subsequent composition/transfer and metacognition increments are merged and must be preserved.

Current Aug-16 hardening/knowledge sequence includes the live-current-data policy, structured real-time data, source governance, cache lineage, semantic embedding transport/shared query work, reviewed prospect-history corpus seeding, verified platform self-knowledge through #1252, continuous ordinary-turn experience capture in #1253, and explicit user-feedback learning in #1255. PR #1259 is the current verified production-outcome learning increment and is not merged at this documentation point. Always scan current `main` because parallel agents continue to advance it.

---

# Next engineering priorities

1. Complete the remaining accepted local/cache production proof for #1253 when RunPod capacity permits; preserve the already verified external-required encounter evidence.
2. Production-prove explicit user helpful / not-helpful / correction ingestion from #1255 and verify feedback appears in the independence quality report without changing capability math.
3. Merge and production-prove #1259 verified Self-Healing outcome learning, then wire authoritative campaign, sales and CRM outcome producers to the same generic recorder rather than building parallel learning stores.
4. Build autonomous curriculum prioritization from repeated external-required attempts, teacher cost/dependency, business importance, negative/correction feedback, verified production failures and weak/untested/conflicted metacognitive classes.
5. Extend consistent pruning/reconsolidation from procedural skills to factual KG/corpus knowledge: staleness, supersession, contradiction, duplication, weakening/quarantine and bounded pruning.
6. Expand the real validated skill library across SRE, Postgres, cloud, networking, security, software, AI, business, marketing and sales, then exercise composition/transfer on genuine overlapping skills.
7. Track teacher dependency, independent completion and verified production success by problem class and verify the trend improves without reducing quality.
8. Build/maintain a broad hidden held-out suite; only held-out evidence may establish progress toward ~85% independent pass.
9. Validate that accumulated COS intelligence survives a model swap; Qwen3 cutover remains separate and must be runtime-proven before claiming it live.
10. Preserve BYOM/BYOA, provenance, source authority, tenant isolation, approval boundaries and Enterprise RC evidence requirements throughout learning expansion.

---

# Status language

Use precise actual states. A plan is not execution; a queue row is not a sent email; an attempted publish is not a published asset; a branch is not production; a green deployment is not Enterprise RC acceptance; architecture support is not proof of configured runtime; a staged adapter is not certified; a policy signal is not proof that its collector exists; a captured teacher lesson is not learned knowledge; a passed training example is not held-out mastery; a validated procedural skill is not factual evidence; a repository model default is not proof that model is live.

For continuous learning specifically: an episodic encounter is not knowledge; COS gate acceptance is not verified outcome; runtime independence is not held-out certification; cache reuse is not new reasoning competence; current-fact retrieval is not timeless memory; recurrence is not truth; a verified problem-class outcome is not causal proof of one skill; and external-teacher reduction is meaningful only if verified quality is maintained or improved.

---

# Definition of success

The best AI call is the one that never has to happen. The best external data call is the one avoided because SignalBoost already owns sufficient verified intelligence. The best Portable teaches COS without bypassing governance. The best architecture lets providers be replaced without rewriting business intelligence or control logic. The best self-healing system detects trouble early, investigates with bounded buyer-owned evidence, resolves explicitly pre-authorized routine conditions safely, escalates consequential actions, verifies every outcome and learns from the result.

For COS learning specifically, success means that validated experience measurably improves held-out performance, retains that improvement over time, generalizes to variants, lowers repeated external-teacher dependence, and preserves honest confidence/provenance rather than merely accumulating more text.

The long-term proof is a trend: more problems completed with COS-owned memory/skills/tools and local/private compute, fewer external-teacher calls for already-learned classes, stronger verified real-world outcomes, and stable performance when the underlying model/provider is replaced.
