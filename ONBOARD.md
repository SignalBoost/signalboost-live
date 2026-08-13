# ONBOARD.md

# SignalBoost Engineering Blueprint
## Cognitive Operating System (COS)

**Version:** 1.7  
**Updated:** 2026-08-12  
**Overall engineering progress estimate:** ~98% — not an Enterprise Release Candidate declaration  
**COS Independence / Autonomous-Intelligence Architecture:** COMPLETE  
**COS Independent Runtime:** REQUIRES A CONFIGURED OPEN/LOCAL MODEL ENDPOINT  
**Marketing & Sales Core Architecture:** COMPLETE  
**Self-Healing Supervisor native monitoring:** ACTIVE; PROACTIVE PROBE CODE MERGED, DATABASE/RUNTIME VERIFICATION REQUIRED  
**Enterprise Release Candidate:** EVIDENCE-BASED — never infer from architecture or a green deployment

---

## Mandatory first-read rule

This file is the canonical starting point for every developer, AI coding agent, reviewer, operator, contractor, and infrastructure assistant working on this repository.

1. Read `ONBOARD.md`.
2. Read `docs/HANDOFF-2026-08-12.md` for the latest dated engineering delta.
3. For COS learning/independence work, also read `docs/HANDOFF-COS-COGNITIVE-LEARNING-2026-08-12.md`.
4. Scan current `main`.
5. Read the exact files related to the task.
6. Verify implementation from code before diagnosing, changing, or reporting status.
7. Never report behavior from memory alone.

`AGENTS.md` and `CLAUDE.md` are entry-point summaries. `docs/ONBOARD-full.md` is the deeper historical/operational reference. Current repository evidence and this current-state handoff win over stale documentation.

---

# Mission

SignalBoost is a Cognitive Operating System that powers specialized business modules and Portables. COS owns reusable intelligence, memory, learning, planning, governance, cost control, verification, provider selection and reusable operational knowledge.

External AI/data providers are replaceable compute or enrichment resources. They do not own SignalBoost intelligence.

```text
Observe → Remember → Learn → Reason → Act → Verify → Improve
```

---

# COS execution order

```text
Request / Goal
→ deterministic business rules
→ exact / semantic / durable reuse
→ Enterprise Memory
→ Knowledge Graph
→ Continuous Learning / bounded context
→ local/private COS reasoning
→ confidence/evidence gate
→ bounded research or replaceable provider only when justified and permitted
→ verification
→ learning / memory / ROI telemetry
```

Primary answer path: `saas/lib/ai/cos/cosFirstAnswer.ts`.

Independent reasoning requires a configured private/open-model endpoint. Architecture support is not proof that a production endpoint is healthy.

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

- COS is the reusable intelligence/governance layer; Portables should not create provider-owned reasoning silos.
- AI is the last resort when deterministic code, known knowledge, cache, durable reuse or verified skills suffice.
- Prefer local/private compute before approved commercial AI providers.
- Never pay twice for knowledge or work SignalBoost already owns with sufficient confidence and freshness.
- Providers are replaceable edges around a provider-neutral core.
- Preserve tenant isolation, auditability and explicit execution boundaries.
- Consequential actions remain behind applicable approval controls.

---

# 2026-08-12 COS / Supervisor state

Major merged capabilities added during the 2026-08-12 engineering sequence include:

- portable buyer connector runtime and host exposure;
- deterministic connector delegation recipes;
- delegated evidence compaction and bounded evidence packets;
- connector-aware Supervisor reasoning;
- incident-aware connector recipe routing;
- adaptive evidence sufficiency scoring;
- durable learned-knowledge/recipe reuse;
- buyer-hosted durable recipe memory and SQL adapter;
- recipe quality scoring, expiry/replacement and confidence lifecycle;
- deterministic evidence reranking and Unicode-safe retrieval grounding;
- robotics/physics learning curriculum integration;
- native Self-Healing Supervisor monitoring runtime;
- Vercel deployment/provider observation connected to native monitoring;
- SignalBoost platform-health intelligence connected to native monitoring;
- real native API latency/5xx probes with durable latency baselines;
- real native database connection-pressure/latency probes;
- real native storage reachability/usage/capacity probes;
- real native TLS certificate-expiry probes;
- automatic learned-document → structured-fact promotion;
- 768-dimensional semantic retrieval for structured COS knowledge facts;
- answer-cache policy versioning and bounded freshness/age checks;
- provenance evidence-funnel telemetry (`retrieved → relevant → selected → injected → cited`);
- cache-origin provenance separated from current-request execution telemetry;
- cited-grounding confidence credit: retrieved-but-unused KG/corpus items no longer raise the evidence ceiling;
- durable external-teacher lesson capture through `cos_teacher_lessons` without automatically treating frontier-model output as factual truth;
- real fallback chain extended to Gemini alongside other approved external providers;
- `qwen3:30b` made the durable local reasoner default in the current bootstrap path.

Relevant merged PRs in this sequence include #1128, #1131, #1133, #1134, #1135, #1136, #1132 and #1152. Re-check current `main` before assuming these are still the latest changes.

See `docs/HANDOFF-2026-08-12.md`, `docs/HANDOFF-COS-COGNITIVE-LEARNING-2026-08-12.md` and `docs/portables/self-healing-monitoring-current-state-20260812.md` for the dated/current handoff.

---

# COS knowledge, cache and provenance — authoritative current state

The live COS-first answer path now has three separate reuse/knowledge layers that must not be conflated:

1. **Answer reuse** — exact and semantic cached answers are policy-versioned and age-bounded. Cache hits must report no fresh local-model invocation on the current request; the model/evidence that originally generated the cached answer is retained separately as answer-origin metadata.
2. **Structured Knowledge Graph / Enterprise Memory facts** — `cos_knowledge_facts` supports 768-dimensional local embeddings and semantic nearest-neighbor retrieval through `cos_match_knowledge_facts`. New promoted facts are embedded with the existing local `nomic-embed-text` path; older facts are incrementally backfilled.
3. **Continuous Learning corpus** — learned documents remain available to the answer path, but retrieval relevance must be based on substantive evidence, not merely a curriculum/subject label.

Authoritative provenance schema v2 reports the real evidence funnel for Knowledge Graph/Enterprise Memory, learned corpus and user memory:

```text
retrieved → relevant → selected → injected → cited
```

A component is called `USED` only when the answer demonstrably cites evidence from it. Retrieval or injection alone is not use. For cached answers, the current request reports zero evidence injection/citation by the reasoner because the reasoner did not run; the generating turn's origin evidence remains separately recorded.

COS confidence no longer receives extra evidence credit merely because many internal items were injected. The higher evidence ceiling is earned only from cited Knowledge Graph + learned-corpus grounding. The model-only ceiling remains 0.78, above the default 0.72 escalation gate, so COS does not require internal citations in order to answer a well-supported question from its own model knowledge.

### COS database/runtime verification still required

Do not infer database state from a green Vercel build. Verify these migrations exist in the production Supabase project before depending on the corresponding behavior:

- `saas/supabase/migrations/20260813_cos_learning_fact_promotion_state.sql`
- `saas/supabase/migrations/20260813_cos_knowledge_fact_embeddings.sql`
- `saas/supabase/migrations/20260813_cos_teacher_lessons.sql`

Then observe `/api/cron/cos-knowledge-promotion` successfully promoting/backfilling facts and verify semantic KG retrieval is actually returning embedded facts in production provenance.

### Next COS quality sequence

1. Re-run the multi-tenant SaaS benchmark and inspect the full provenance funnel, not just final confidence.
2. Keep cross-domain KG and learned-corpus contamination blocked; relevance must come from substantive content, not a convenient label.
3. Build the explicit cognitive learning lifecycle described below: experience → evaluation → practice → held-out validation → learned/mastered or weakened/quarantined.
4. Measure independence and external-teacher avoidance on held-out workloads rather than tuning to one benchmark answer.
5. Continue hardening Crossref/GDELT/OpenAlex/YouTube and other learning-source reliability/admission yield.

Primary files:

- `saas/lib/ai/cos/cosFirstAnswer.ts`
- `saas/lib/ai/cos/cosOrchestration.ts`
- `saas/lib/ai/cos/cosAnswerPolicy.ts`
- `saas/lib/ai/cos/groundingConfidence.ts`
- `saas/lib/ai/cos/knowledgeFactSemantic.ts`
- `saas/lib/ai/cos/knowledgeFactExtraction.ts`
- `saas/lib/ai/cos/autoPromoteLearning.ts`
- `saas/lib/ai/cos/teacherLearning.ts`
- `saas/app/api/cron/cos-knowledge-promotion/route.ts`
- `saas/lib/cos-core/storage/supabase.ts`
- `saas/lib/cos-core/layers/knowledge/persistent.ts`
- `saas/lib/ai/cos/localEmbeddings.ts`

---

# Self-Healing Supervisor — authoritative monitoring doctrine

The Self-Healing Supervisor is intended to be **proactive**, not merely reactive to incidents delivered by another monitoring product.

Native monitoring is a first-class capability and should be enabled by default for a plug-and-play installation. A buyer that already has monitoring may run `hybrid` mode or intentionally choose external-only monitoring.

Canonical implementation:

- `saas/self-healing-host/native-monitoring-policy.ts`
- `saas/self-healing-host/native-monitoring-runtime.ts`
- `saas/self-healing-host/native-proactive-monitoring.ts`
- `saas/app/api/cron/native-proactive-monitoring/route.ts`
- `saas/supabase/migrations/20260812_self_healing_native_proactive_monitoring.sql`
- existing Vercel observer/provider-health path
- existing SignalBoost platform-health intelligence
- `docs/portables/self-healing-monitoring-current-state-20260812.md`

Current native coverage includes Vercel deployment/provider health, platform-health conditions such as queue growth, scheduler failures, provider failures, resource pressure, stale leases/heartbeats, verification failures and audit failures, plus real proactive probes for API p95 latency/5xx error rate, database connection pressure/latency, storage health/usage/capacity and TLS certificate expiry.

Probe observations are persisted in `self_healing_native_probe_samples`. API trend detection uses durable recent history. Database and storage probes use bounded service-role-only aggregate RPCs rather than exposing query text, credentials, object contents or other sensitive payloads.

Existing external webhook adapters remain available for Datadog, PagerDuty, AWS CloudWatch/EventBridge, Prometheus Alertmanager, Splunk, Azure Monitor, Grafana Alerting and Google Cloud Operations. They are real deterministic adapters but remain `staged` until live-provider validation promotes them to `certified`.

### Remediation workflow

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

### Native proactive monitoring deployment state

PR #1132 is merged into `main` (merge commit `4e91da9a1f380e94a8c8476d860a770552c914db`). The branch preview passed the Vercel production build/typecheck gate before merge. Production code uses real HTTP requests, Supabase/Postgres aggregate health data, Supabase Storage metadata and validated TLS handshakes; placeholders and mocks are confined to tests where needed.

The migration `saas/supabase/migrations/20260812_self_healing_native_proactive_monitoring.sql` must exist in the target Supabase project before the 15-minute cron can persist history or execute the database/storage RPC probes. The cron fails closed with `native_probe_store_unavailable` if that schema is absent. Do not call the proactive probes production-runtime-verified until the migration is applied and a production `/api/cron/native-proactive-monitoring` run is observed successfully.

Optional environment configuration:

- `SELF_HEALING_API_PROBE_URLS` — live HTTPS API targets; defaults to `/api/supervisor/native-health` on the production app.
- `SELF_HEALING_TLS_TARGETS` — additional `host[:port]` certificate targets.
- `SELF_HEALING_STORAGE_QUOTA_BYTES` — real storage quota for capacity-percentage alerts; without it the probe reports real usage without inventing a quota.
- `SELF_HEALING_NATIVE_MONITORING_ENABLED=false` — explicit buyer opt-out.

---

# Learning doctrine

Accumulation is not learning. Durable learned items should preserve provenance, confidence, acquisition/verification time, freshness/expiry, scope, evidence and reuse/outcome measurements where applicable. Contradictions must not silently overwrite trusted knowledge. Background learning remains bounded and cost-governed.

## COS cognitive-learning north star

The goal is not a perfect single model. The goal is a **continuously learning cognitive system** whose tools, memory, skills, specialist agents and accumulated validated experience make it progressively less dependent on external frontier models.

Use workload-relative, empirical targets:

- roughly **85% independent pass rate** is the mature target for a well-trained COS on the defined SignalBoost workload;
- roughly **92–95%** is a longer-term super-agent ambition only if held-out evidence supports it;
- OpenAI, Anthropic, Gemini and other frontier providers belong primarily in the genuinely difficult, novel, disputed or high-consequence tail.

These percentages are capability targets, **not confidence targets**. Never raise confidence or weaken gates to make the independence number look better.

Canonical human-inspired learning loop:

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

Canonical learning-state progression:

```text
Captured / Encountered
→ Evaluated / Studying
→ Understood
→ Practiced
→ Validated
→ Learned
→ Mastered
```

A source document, retrieved chunk, teacher answer, or one successful retry is not automatically `learned`. Promotion to `learned`/`mastered` must require successful application on unseen/held-out variants and must remain independently measurable from answer confidence.

COS should explicitly model:

- **episodic memory** — important attempts, evidence, outcomes, corrections and disagreements;
- **semantic memory** — validated generalized concepts/facts;
- **procedural memory** — reusable skills/tool procedures with prerequisites, observables, falsifiers and failure modes;
- **metacognition** — what COS knows, has only encountered, repeatedly gets wrong, has not tested, or should escalate;
- **consolidation** — bounded review that clusters experiences, resolves contradictions, strengthens validated skills and schedules practice;
- **forgetting/reconsolidation** — weakening, expiry, supersession or quarantine of stale/misleading knowledge rather than assuming more stored data always means more intelligence.

External providers are **teachers/escalation resources, not automatic authorities**. Successful external escalations are captured in `cos_teacher_lessons`, but teacher text must not be promoted directly into trusted KG/corpus knowledge merely because it came from a frontier model.

Teacher loop:

```text
COS attempts
→ internal tools/specialists investigate
→ external teacher only when justified
→ capture local attempt + teacher result + disagreement/evidence
→ evaluate
→ extract reusable principle/skill candidate
→ test on unseen variants
→ promote only after validation
→ measure whether future external calls for that problem class decline
```

If the same problem class repeatedly requires an external model, treat that as a learning-system failure even if the final user answer is good.

Future COS Council design should obtain **independent first opinions before cross-agent discussion** to reduce groupthink. Exchange structured `claim / rationale summary / assumptions / evidence / falsifier / confidence` artifacts; do not use naive majority voting. Agent influence should eventually be informed by empirical domain-specific reliability.

Full dated handoff: `docs/HANDOFF-COS-COGNITIVE-LEARNING-2026-08-12.md`.

---

# Cost / ROI governance

Track provider calls avoided, cache/reuse hits, knowledge hits, local executions, external fallbacks, provider cost, avoided cost, latency, retries, successful outcomes and learning reuse/effectiveness.

For cognitive learning also track independent pass rate, external escalation rate by domain/problem class, held-out validation rate, retention, generalization, skill success/failure, revalidation/decay history and teacher-call avoidance after learning.

---

# Marketing & Sales state

Marketing & Sales core architecture is complete, including Enterprise Memory, Knowledge Graph, Continuous Learning, Goal Engine, Prospect Intelligence, Business Intelligence Corpus, Communication Hub, CRM production paths, Revenue Intelligence, Universal Adapter seams, campaign/outreach queues, approval gates, audit, telemetry, cost governance and localization guardrails.

The 5,000-company Business Intelligence Corpus is a data-population target, not unfinished architecture. Always use live status rather than a historical count.

Owner/admin route: `/dashboard/data/business-intelligence-corpus`  
Status API: `/api/admin/business-intelligence-corpus/status`

---

# Enterprise Release Candidate

A green Vercel deployment is necessary but not sufficient to declare Enterprise RC. The fail-closed profile is `saas/lib/release-candidate/marketing-sales.ts` and requires real evidence for deployment, tenant isolation, security, resilience, load/soak, observability, end-to-end integration and documentation currency.

Missing evidence is `not_run`, not pass.

---

# Security / secrets

- Never hard-code or expose secrets.
- Never print full provider keys/tokens.
- Use approved Vault/environment/server-side storage boundaries.
- Preserve tenant/org scoping and RLS/server-role assumptions.
- Keep owner/admin routes server-gated.
- Remote private inference must be HTTPS, authenticated and exact-host allowlisted.

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

---

# Documentation map

Latest handoffs:
- `docs/HANDOFF-2026-08-12.md`
- `docs/HANDOFF-COS-COGNITIVE-LEARNING-2026-08-12.md`

Self-Healing Supervisor:
- `docs/portables/self-healing-monitoring-current-state-20260812.md`
- `docs/portables/self-healing-monitoring-connections.md`
- `docs/portables/self-healing-technical-walkthrough.md`
- `docs/portables/self-healing-operations-runbook.md`
- `docs/portables/self-healing-integration-guide.md`
- `docs/portables/self-healing-evaluation-brief.md`

Marketing & Sales:
- `docs/marketing-sales-current-state.md`
- `saas/docs/marketing-sales-module-design.md`
- `docs/business-intelligence-corpus.md`
- `docs/enterprise-release-candidate.md`

COS / enterprise architecture:
- `saas/lib/ai/cos/`
- `saas/lib/ai/local-inference.ts`
- `saas/lib/cos/`
- `saas/lib/cos-core/`
- `saas/lib/enterprise/`
- `saas/lib/enterprise-ai-os/`
- `appliance/local-ai/`

Historical/operational detail:
- `docs/ONBOARD-full.md`

---

# Status language

Use precise actual states. A plan is not execution; a queue row is not a sent email; an attempted publish is not a published asset; a branch is not production; a green deployment is not Enterprise RC acceptance; architecture support is not proof of configured runtime; a staged adapter is not certified; a policy signal is not proof that its collector exists; a captured teacher lesson is not learned knowledge; a passed training example is not held-out mastery.

---

# Definition of success

The best AI call is the one that never has to happen. The best external data call is the one avoided because SignalBoost already owns sufficient verified intelligence. The best Portable teaches COS without bypassing governance. The best architecture lets providers be replaced without rewriting business intelligence or control logic. The best self-healing system detects trouble early, resolves explicitly pre-authorized routine conditions safely, escalates consequential actions, verifies every outcome and learns from the result.

For COS learning specifically, success means that validated experience measurably improves held-out performance, retains that improvement over time, generalizes to variants, lowers repeated external-teacher dependence, and preserves honest confidence/provenance rather than merely accumulating more text.