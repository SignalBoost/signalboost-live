# ONBOARD.md

# SignalBoost Engineering Blueprint
## Cognitive Operating System (COS)

**Version:** 1.17  
**Updated:** 2026-08-22 UTC  
**Canonical scope:** current engineering / operations handoff; verify live state before acting  
**Baseline `main` verified immediately before this documentation-only branch:** `688448640f5b9c90cdaa6b621171c9e9baf5c83d`  
**Baseline Production deployment:** `dpl_7RtYA3oXNwEFbCRWGSs1MydRo1uJ` — READY, `saas.signalboostapp.com` attached  
**COS primary reasoner:** DeepInfra managed open-model runtime → `Qwen/Qwen3.6-35B-A3B`  
**COS embedding model:** DeepInfra → `BAAI/bge-base-en-v1.5` → 768 dimensions  
**RunPod lifecycle:** detached while the active reasoner points outside RunPod  
**COS learning:** COS-owned memory, knowledge, skills, telemetry and verified outcomes; not provider-weight fine-tuning  
**Next learning priority:** Retrieval Self-Reflection, then calibration / strategy-selection learning

> This file deliberately records current operational truth and acceptance evidence, not every historical implementation detail. Git history and dated files under `docs/` preserve the longer history. Always re-query GitHub, Vercel and Supabase before acting because concurrent work lands frequently.

---

# Mandatory first-read rule

Every developer, AI coding agent, reviewer, operator, contractor, or infrastructure assistant working on this repository must:

1. Read this `ONBOARD.md` first.
2. Read `docs/HANDOFF-COS-DEEPINFRA-2026-08-20.md` for provider migration / rollback history when relevant.
3. Query current `main`, open PRs, exact Vercel Production state and current Supabase migrations before changing anything.
4. Read the exact files related to the task.
5. Verify implementation and runtime behavior from code plus live evidence before diagnosing or reporting status.
6. Never report current behavior from memory alone.

A branch is not Production. A green build is not capability acceptance. A provider health response is not held-out mastery. An encountered skill candidate is not learned behavior.

---

# Finish-to-completion rule — MANDATORY

COS learning work must be finished end-to-end rather than left as disconnected mechanisms.

```text
architecture / contract
→ implementation
→ deterministic regression coverage
→ schema migration if required
→ exact Preview compile + TypeScript + build
→ merge to current main
→ exact Production deployment READY
→ live Production runtime / database evidence
→ outcome / telemetry proof when the feature requires it
→ ONBOARD.md updated
```

If GitHub Actions fail before step 1 with `steps:null` / no logs, record that as Actions infrastructure state; do not pretend tests executed. The Vercel deployment gate is an independent executable gate and currently runs the critical COS regression suite before Next.js build.

Never weaken evidence gates, private holdouts, authorization, tenant isolation or lifecycle rules merely to make a dashboard green.

---

# Current Production architecture

```text
Request / goal
→ deterministic policy / business rules
→ classify current-world vs historical / conceptual / internal state
→ current-world fact: live no-cache evidence path
→ local/internal/timeless reasoning: COS-owned memory + validated evidence / skills
→ provider-neutral reasoning control plane / specialist worker selection
→ confidence / grounding / freshness checks
→ governed external teacher/fallback only when policy permits
→ answer-side self-reflection / repair
→ exact turn outcome correlation
→ failure autopsy / retrieval / strategy learning inputs
→ retain / strengthen / weaken / quarantine
```

Primary reasoner transport:

```text
COS
→ provider-neutral LOCAL_AI_* seam
→ OpenAI-compatible transport protocol
→ DeepInfra
→ Qwen/Qwen3.6-35B-A3B
```

Embedding path:

```text
COS semantic retrieval
→ DeepInfra
→ BAAI/bge-base-en-v1.5
→ 768 dimensions
→ model-aware pgvector stores
```

The `/v1/openai` path is protocol compatibility only. OpenAI is not the provider for this reasoner path.

---

# Production environment contract

Expected Production settings:

```dotenv
LOCAL_AI_BASE_URL=https://api.deepinfra.com/v1/openai
LOCAL_AI_ALLOWED_HOSTS=api.deepinfra.com
LOCAL_AI_MODEL=Qwen/Qwen3.6-35B-A3B
LOCAL_AI_EMBEDDING_MODEL=BAAI/bge-base-en-v1.5
LOCAL_AI_REASONING_EFFORT=none
LOCAL_AI_MANAGED_PROVIDER=deepinfra
LOCAL_AI_API_KEY=<server-side secret>
```

Never commit, print or expose provider secrets.

---

# Provider / embedding migration — COMPLETE

DeepInfra production cutover and model-space repair are complete.

Key accepted facts:

- DeepInfra/Qwen reasoner health and real completions passed.
- BGE embeddings return exactly 768 dimensions.
- Historical incompatible vector space was not reused merely because dimensions matched.
- 45/45 durable facts and 111/111 eligible corpus rows were re-embedded into the BGE model space with zero failures/backlog.
- rejected/quarantined corpus rows remain excluded from governed retrieval.
- RunPod lifecycle is detached while the active reasoner URL is outside RunPod.

Doctrine: embedding model identity is part of the semantic schema. Equal dimensions do not imply compatible vector spaces.

---

# Capability / evidence benchmarks

Private capability acceptance and controlled evidence-utilization are separate cohorts.

Current accepted dashboard semantics:

- private acceptance rotation: **6** active cases;
- controlled comparison fixtures: separate cohort and excluded from private acceptance counting;
- controlled evidence-utilization suite: **36** cases across nine domains;
- latest observed private pass rate in the Aug 21/22 acceptance period: **100%**;
- latest observed evidence-utilization pass rate in the same period: **100%**.

PR #1345 repaired a regression where 40 controlled-comparison fixtures were accidentally counted as active private cases. Production data then showed 6 private acceptance cases + 40 controlled-comparison cases; nothing useful was deleted.

---

# Outcome correlation — COMPLETE

PR #1328 merged and is live. Durable `cos_turn_outcomes` provides race-safe exact `turn_id` correlation across:

- server-owned assistant provenance;
- explicit feedback;
- private capability benchmark outcomes;
- controlled evidence-utilization outcomes;
- verified Production outcomes;
- predicted confidence / route / problem-class analysis.

PR #1329 subsequently hardened benchmark preflight/reliability and latest utilization pass-rate reporting.

This outcome layer is the common substrate for calibration, retrieval, failure-autopsy and strategy learning.

---

# Failure Autopsy — COMPLETE ACCEPTANCE

General failure autopsy is implemented and has real Production acceptance evidence.

Accepted retained lesson:

```text
autopsy id: 209b6e8b-a6ff-4e49-9bc1-54fb5d186fee
source turn: f8044774-8c7a-460f-9deb-687b9fb6fc68
source case: sre-memory-pressure
classified stage: evidence_selection
independent retest case: sre-tenant-500s
retest turn: dbc13b25-90a6-407d-8216-ce347e92b192
retest_passed: true
lesson_retained: true
```

The pipeline is bounded:

```text
verified poor outcome
→ explicit causal-stage classification
→ shadow corrective guidance
→ different controlled retest
→ retain lesson only if retest passes
```

Do not rerun the already accepted autopsy merely to increase counters. Additional later failures may create pending autopsies; that does not invalidate mechanism acceptance.

Relevant work: PR #1330 learning-gap autopsy, PR #1332 general failure autopsy, PR #1335/#1336 bounded spinner/recovery and completed-autopsy UX.

---

# Reasoning control plane / specialist workers — IMPLEMENTED

The provider model is replaceable compute; COS owns routing and learning policy.

Relevant merged work:

- PR #1333 — provider-neutral reasoning plan/worker control plane and governed escalation boundary;
- PR #1334 — Production routing through the control plane;
- PR #1337 — deterministic specialist workers: primary, coder, critic, verifier, researcher;
- PR #1338 — outcome-gated worker/model preference learning from verified quality, latency and configured cost;
- PR #1339 — controlled held-out reasoning comparison harness.

No hidden chain-of-thought is stored as a learning artifact. Learn only explicit strategy / worker / evidence / outcome telemetry.

---

# Adaptive Retrieval / Agentic RAG — SHADOW V1 VALIDATED; OVERALL LAYER PARTIAL

PR #1341 added outcome-derived, request-local adaptive retrieval shadow validation.

Production policy:

```text
current learned-corpus cap: 6
candidate shadow cap: 4
similarity threshold: 0.45 unchanged
live policy: unchanged
```

Training evidence at candidate derivation:

```text
distinct outcome-labelled cases: 7
injected items: 41
verified successes: 6
verified failures: 1
success rate: 0.8571
unused rate: 1.0
```

Independent validations:

1. `cloud-regional-asymmetry` — baseline PASS with 6 injected; candidate PASS with 4 injected; verdict PASS.
2. `business-stalled-pipeline` — baseline PASS with 6 injected; candidate PASS with 4 injected; verdict PASS.

Policy status reached **`validated_shadow` = 2/2 passes, 0 failures**. Zero-evidence cases such as networking/security/software were correctly inconclusive rather than counted as failures. PR #1345 later added retrieval preflight so cases that cannot exceed the candidate cap are skipped before spending a paired reasoner run. PR #1347 fixed the browser busy-state recovery so durable completion releases the UI even if the original long POST connection stalls.

Do **not** automatically promote cap 4 to live Production. Overall Agentic RAG remains PARTIAL until threshold calibration, source-mix/reranking learning and an explicit bounded promotion/rollback policy are accepted.

---

# Retrieval Self-Reflection — NEXT PRIORITY / PARTIAL

Already present:

- evidence funnel and citation-use telemetry;
- per-item similarity/source metadata;
- exact outcome correlation;
- adaptive shadow policy store and controlled validation.

Finish:

- bounded post-turn assessment containing only explicit retrieval artifacts such as sufficiency, unused evidence, missing evidence class and recommended retrieval adjustment;
- correlate reflection predictions with later verified outcomes;
- measure whether recommendations would have helped before they may influence policy;
- deduplicate repeated low-value reflections;
- never persist hidden chain-of-thought.

Completion criterion: retrieval reflections predict later retrieval success/failure well enough to safely feed shadow policy selection.

---

# Freshness / current-world knowledge — IMPLEMENTED AND LIVE

A factual error about a public figure exposed the general stale-world problem. The fix is deliberately **not person-specific**.

Current contract:

- ordinary external factual lookups are live-verified by default even when the user does not say `current`, `latest` or `today`;
- historical and conceptual questions retain local/timeless reasoning paths;
- private SignalBoost/system-of-record questions stay internal;
- high-frequency values such as weather, finance and sports prefer structured real-time providers;
- present-life/death, office-holder, law/rule, security/CVE, release/version and similar mutable claims use fresh evidence;
- answer-side freshness self-reflection removes or verifies mutable claims introduced inside otherwise timeless/normative answers;
- current-world background learning refreshes broad governed reference/news/official material and continuously indexes eligible learned corpus, while answer-time verification remains the correctness boundary.

Relevant merged sequence includes PR #1348/#1349 and the subsequent general-current-knowledge work through #1355, plus PR #1363 answer-side freshness self-reflection.

A model-memory assertion is never sufficient merely because the model sounds confident.

---

# Local discovery — IMPLEMENTED AND LIVE

Queries for real-world places such as clubs, restaurants, hotels, stores, classes and venues use live discovery evidence rather than stale model memory.

A Production failure on `Are there salsa clubs in Paramaribo?` showed that live evidence had been retrieved successfully but the route then required an external Gemini synthesis that local-only governance blocked.

The repair:

- deterministic grounded directory answer when evidence is sufficient;
- otherwise COS/Qwen evidence-only local synthesis;
- governed external fallback remains optional rather than required;
- conceptual questions such as `Explain how salsa dancing works` are not misclassified as local discovery.

PR #1360 introduced grounded local discovery; PR #1362 completed the local-first synthesis and classifier hardening.

---

# Explicit feedback and reusable reasoning learning — IMPLEMENTED; FIRST POST-MERGE REAL FEEDBACK ACCEPTANCE PENDING

Explicit positive/negative/correction feedback is securely correlated to server-owned COS turns. The client cannot invent a turn ID.

PR #1364 added the missing bridge from feedback to **generalized procedural reasoning candidates**:

```text
verified negative/correction feedback
→ episodic experience (signal, not truth)
→ local COS reflection
→ generalized procedural candidate
→ structural trigger metadata when applicable
→ local-generated practice only
→ evaluator + understanding + independent holdout lifecycle
→ validated / learned / mastered only after independent evidence
→ reusable future reasoning
```

Hard rules:

- a user correction is not automatically factual truth;
- one correction cannot auto-promote a skill;
- raw conversation text is not stored inside the reusable skill;
- generated practice cannot masquerade as independent holdout evidence;
- structural trigger matches affect procedural relevance, never factual confidence;
- live skill injection selects only `validated`, `learned` or `mastered` states.

Production schema seed is applied for:

`reasoning.context_ambiguity_resolution.v1`

Verified Production state after migration:

```text
status: encountered
evaluator_approved: false
understanding_approved: false
encounter_count: 1
activation_rule: never inject until status is validated, learned, or mastered
origin: governed_reasoning_candidate
automaticSkillPromotionAllowed: false
requiresIndependentHoldouts: true
```

Its procedure includes structural trigger kinds:

- `deictic_predicate_question`;
- `unresolved_referent_followup`;
- `underspecified_comparison`;
- `vague_temporal_reference`.

It also includes explicit observables and falsifiers. This seeded candidate is intentionally **not live learned behavior**.

As of this ONBOARD update, no post-merge `user_feedback_reflection` skill row exists yet. Do not fabricate one. The first real negative/correction feedback after #1364 must be used as runtime acceptance: verify it creates/refreshes an `encountered` candidate and queues practice while leaving promotion false.

---

# Preference / feedback learning — EXPLICIT STRONG; IMPLICIT PARTIAL

Already present:

- positive / negative / correction feedback;
- exact turn correlation;
- episodic evidence semantics;
- generalized reasoning candidate bridge for negative/correction feedback.

Still partial:

- carefully defined repeated/rephrased-question signals;
- verified downstream acceptance/use signals;
- abandonment only if there is a defensible event definition;
- no implicit signal may become factual truth or bypass skill validation.

---

# Curriculum / active learning / retention — STRONG, CONTINUE RUNTIME PROOF

Already present:

- active practice queue;
- local practice generation;
- evaluator / understanding checks;
- independent holdout variants;
- local-generated practice forbidden from holdout breadth;
- retention / weakening / quarantine lifecycle;
- consolidation machinery.

Still prove under the current reasoner:

- at least one delayed retention cycle that refreshes a valid skill without inflating holdout breadth;
- a failed/stale retention event that weakens state correctly;
- recurring weak/untested regions create bounded practice and can reach independent improvement;
- saturation/no-improvement is surfaced instead of endless exercise generation.

---

# Calibration Learning — PARTIAL / HIGH PRIORITY

Use exact `turn_id` outcomes to build calibration buckets by problem class, evidence regime and reasoner. Compare predicted confidence with empirical verified success, derive shadow calibration recommendations, and validate on a separate cohort before changing live confidence/escalation thresholds.

Do not conflate zero-grounding general reasoning with current-state factual claims.

---

# Strategy-selection learning — PARTIAL / HIGH PRIORITY

Outcome correlation, the control plane, specialist workers and controlled comparison harness now exist.

Finish:

- measure quality/cost by explicit strategy and like-for-like problem cohort;
- derive shadow strategy recommendations;
- validate direct vs Council/challenge/repair/worker choices on held-out cases;
- promote only bounded rules with audit/rollback;
- never disable skepticism/verification globally merely for latency.

---

# Tool-use / procedural sequence learning — PARTIAL

Cognitive Skills already include prerequisites, procedure, tools, observables, falsifiers, common failure modes and prohibited actions.

Finish outcome-based problem-class → tool/skill sequence recommendations from governed executions. Learned preferences must never widen authorization or bypass approvals.

---

# Episodic → semantic compression — PARTIAL

Repeated independently supported episodes may propose generalized facts/rules/skills, but require corroboration, contradiction checks, correct scope and independent validation before durable promotion. Contradicted generalized knowledge must be weakenable/quarantinable.

PR #1364 provides a concrete governed pattern for procedural generalization from feedback, but one episode remains insufficient for strong semantic promotion.

---

# Current-world / live-data doctrine

Stored knowledge helps COS reason. It does not guarantee that an external-world fact is still true.

```text
historical / conceptual / internal state
→ appropriate local/system-of-record reasoning

current or ordinary external factual lookup
→ fresh evidence on this turn
→ grounded synthesis or deterministic answer
→ fail closed if evidence is insufficient
```

Do not use freshness routing for private operational state merely because a prompt includes words like `current`, `latest` or `still`.

---

# Repository inspection authority — FIXED / LIVE

A signed-in owner request to scan, audit, inspect, review or analyze the configured SignalBoost repository is already authorization for **read-only** repository inspection.

The chat must not ask the owner to repeat the configured repository, reconfirm permission or paste files. Repository reads remain separate from write/deploy/secret authority.

Recent fixes route owner/browser repo scans to the repository reader and repaired the resulting build. Baseline verified Production for this handoff is commit `688448640f5b9c90cdaa6b621171c9e9baf5c83d`, deployment `dpl_7RtYA3oXNwEFbCRWGSs1MydRo1uJ`, READY.

---

# Security / governance invariants

Non-negotiable:

- never hard-code or expose provider secrets;
- owner/admin routes remain server-gated;
- cron routes remain protected;
- preserve tenant/org scoping and RLS/service-role assumptions;
- no unauthenticated Production validation backdoors;
- external/managed providers never become governance authority;
- unknown/consequential/destructive/financial/security actions fail closed or require the applicable approval boundary;
- learned retrieval/worker/tool/skill preference cannot widen authorization;
- no hidden chain-of-thought persistence.

---

# Recent merged sequence that matters

- #1328 — exact turn outcomes + controlled evidence-utilization benchmark.
- #1329 — benchmark reliability / latest-score cleanup.
- #1330 / #1332 — learning-gap + general failure autopsy.
- #1331 — Concierge explicit feedback controls / secure turn correlation.
- #1333 / #1334 — provider-neutral reasoning control plane and Production routing.
- #1335 / #1336 — failure-autopsy spinner recovery / terminal UX.
- #1337 — specialist reasoning workers.
- #1338 — reasoning outcome learning.
- #1339 — controlled reasoning comparison harness.
- #1341 — adaptive retrieval shadow validation.
- #1345 — private six-case cohort protection + adaptive preflight.
- #1347 — durable adaptive-validation UI recovery.
- #1348 / #1349 onward — temporal/current-world freshness generalization.
- #1355 — general external factual lookups live-verify by default.
- #1360 / #1362 — local discovery grounded/local-first synthesis.
- #1363 — answer-side freshness self-reflection.
- #1364 — governed feedback → reusable procedural candidate learning + structural triggers.
- subsequent repo-reader / repository-scan fixes culminated in baseline Production `688448640f5b9c90cdaa6b621171c9e9baf5c83d`.

Always query current state; this sequence can advance after this document is merged.

---

# Immediate next engineering priorities

1. **Run one real post-#1364 negative/correction feedback acceptance** and verify: episodic row → encountered generalized candidate → local practice queue; no automatic promotion.
2. **Retrieval Self-Reflection:** build bounded explicit retrieval assessments and prove predictive value against later outcomes.
3. **Calibration Learning:** empirical confidence calibration by problem/evidence/reasoner cohort, shadow first.
4. **Strategy-selection learning:** validate worker/Council/challenge/repair choices on like-for-like held-out cohorts.
5. **Adaptive Retrieval v2:** similarity-threshold calibration, source mix/reranking and explicit bounded promotion/rollback. Keep cap 4 shadow-only until separately promoted.
6. **Tool-use sequence learning:** verified problem-class → governed tool sequence recommendations.
7. **Retention continuity:** prove delayed refresh + weaken/quarantine paths under the current reasoner.
8. **Episodic → semantic compression:** multi-episode corroboration and reversible promotion.
9. **SFT/LoRA readiness only after** sufficient high-integrity outcome-labelled dataset, contamination controls and separate held-out comparison exist.

---

# Status language

Use precise actual states.

A plan is not execution.  
A queue row is not a sent message.  
A branch is not Production.  
A green deployment is not Enterprise RC acceptance.  
An episodic encounter is not knowledge.  
An `encountered` skill is not validated learned behavior.  
A teacher/user correction is evidence, not automatic truth.  
Cache reuse is not new reasoning competence.  
Equal embedding dimensions are not equal embedding spaces.  
Current-fact retrieval is not timeless memory.  
Telemetry collection is not adaptive learning until a validated consumer can safely improve future behavior.  
A shadow recommendation is not a promoted Production policy.  
A self-generated practice pass is not independent validation.  
A current-world page retrieved now can itself contain stale content; source date and authority still matter.

---

# Definition of success

The model/provider is replaceable compute. **COS is the learner.**

Success means validated experience measurably improves held-out or verified Production performance, transfers to materially different variants, retains the improvement, lowers repeated teacher/fallback dependence, and preserves honest confidence, provenance, tenant scope and governance.

For metacognitive learning, COS must be able to prove which retrieval policy, evidence class, procedural skill, tool sequence or explicit reasoning strategy improved outcomes for a problem class, detect when that lesson stops working, and safely weaken or roll it back.