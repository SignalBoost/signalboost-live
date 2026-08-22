# ONBOARD.md

# SignalBoost Engineering Blueprint
## Cognitive Operating System (COS)

**Version:** 1.19  
**Updated:** 2026-08-22 UTC  
**Canonical scope:** current engineering / operations handoff; verify live state before acting  
**Baseline `main`:** `9bf0a5540c6cdbd409c52a20b9f4aa4587f31bd7`  
**Baseline Production deployment:** `dpl_483vcZK87vq9cB4ULw6pich3stua` — READY, `saas.signalboostapp.com` attached  
**COS primary reasoner:** DeepInfra managed open-model runtime → `Qwen/Qwen3.6-35B-A3B`  
**COS embedding model:** DeepInfra → `BAAI/bge-base-en-v1.5` → 768 dimensions  
**RunPod lifecycle:** detached while the active reasoner points outside RunPod  
**COS learning:** COS-owned memory, knowledge, skills, telemetry and verified outcomes; not provider-weight fine-tuning  
**Procedural-learning state:** autonomous certification architecture is Production; individual skills still earn lifecycle status from evidence  
**Next learning priority:** observe real certification progression, then Retrieval Self-Reflection and calibration / strategy-selection learning

> This file records current operational truth and acceptance evidence. Historical detail remains in Git history and dated files under `docs/`. Always re-query GitHub, Vercel and Supabase before acting because concurrent work lands frequently.

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

If GitHub Actions fail before step 1 with `steps:null` / no logs, record that as Actions infrastructure state; do not pretend tests executed. The Vercel deployment gate is an independent executable gate and runs the critical COS regression suite before Next.js build.

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

Accepted facts:

- DeepInfra/Qwen reasoner health and real completions passed.
- BGE embeddings return exactly 768 dimensions.
- embedding model identity is part of the semantic schema; equal dimensions do not imply compatible vector spaces.
- historical incompatible vector space was not reused merely because dimensions matched.
- retained learned knowledge is continuously indexed/re-indexed into the active model space.
- rejected/quarantined corpus rows remain excluded from governed retrieval.
- RunPod lifecycle is detached while the active reasoner URL is outside RunPod.

---

# Capability / evidence benchmarks

Private capability acceptance and controlled evidence-utilization are separate cohorts. Do not mix benchmark fixture classes merely to improve a headline pass rate.

Recent accepted architecture includes:

- private capability rotation protected from controlled-comparison fixtures;
- controlled evidence-utilization suite across multiple domains;
- exact `turn_id` outcome correlation;
- adaptive retrieval shadow validation;
- reasoning-worker controlled comparison and outcome learning.

Always query current tables/dashboard before quoting the latest pass rate.

---

# Freshness / current-world knowledge — IMPLEMENTED AND LIVE

The stale-world fix is general, not person-specific.

Current contract:

- ordinary external factual lookups are live-verified by default even when the user does not say `current`, `latest` or `today`;
- historical and conceptual questions retain local/timeless reasoning paths;
- private SignalBoost/system-of-record questions stay internal;
- high-frequency values such as weather, finance and sports prefer structured real-time providers;
- present life/death, office-holder, law/rule, security/CVE, release/version and similar mutable claims use fresh evidence;
- contextual follow-ups resolve the referent from user conversation context before retrieval;
- answer-side freshness self-reflection removes or verifies mutable claims introduced inside otherwise timeless answers;
- current-world background learning refreshes broad governed reference/news/official material and continuously indexes eligible learned corpus;
- answer-time live verification remains the correctness boundary for mutable public facts.

A model-memory assertion is never sufficient merely because the model sounds confident.

---

# Continuous knowledge acquisition / indexing — IMPLEMENTED AND LIVE

Current-world background learning and semantic indexing are separate but connected stages:

```text
acquire current evidence
→ validate/admit
→ durable retained knowledge
→ embed into active model space
→ retrieve in later COS reasoning
```

Normal accepted knowledge is indexed in the learning flow when possible. A recurring indexer drains missing/stale vectors as repair. Empty index cycles do not keep RunPod compute active. Vectors from an old embedding model are eligible for re-embedding.

Stored knowledge helps COS reason; it does not replace live verification for mutable external facts.

---

# Explicit feedback and reusable reasoning learning — IMPLEMENTED

Explicit positive/negative/correction feedback is securely correlated to server-owned COS turns. The client cannot invent a turn ID.

PR #1364 added the feedback-to-procedural-skill bridge:

```text
negative/correction feedback
→ episodic experience (signal, not truth)
→ local COS reflection
→ generalized procedural candidate
→ structural trigger metadata when applicable
→ local-generated practice only
→ independent certification lifecycle
→ validated / learned / mastered only after evidence
→ reusable future reasoning
```

Hard rules:

- a user correction is not automatically factual truth;
- one correction cannot auto-promote a skill;
- raw conversation text is not stored inside the reusable skill;
- generated practice cannot masquerade as independent holdout evidence;
- structural trigger matches affect procedural relevance, never factual confidence;
- live skill injection selects only `validated`, `learned` or `mastered` states.

Seeded candidate:

`reasoning.context_ambiguity_resolution.v1`

Its structural trigger family includes:

- `deictic_predicate_question`;
- `unresolved_referent_followup`;
- `underspecified_comparison`;
- `vague_temporal_reference`.

The candidate includes explicit observables and falsifiers. It is not promoted merely because the procedure looks sensible.

---

# Autonomous cognitive skill certification — IMPLEMENTED AND PRODUCTION

PR #1376 merged as:

`9bf0a5540c6cdbd409c52a20b9f4aa4587f31bd7`

Production deployment:

`dpl_483vcZK87vq9cB4ULw6pich3stua` — READY

Exact acceptance before merge:

- 10/10 GitHub workflows passed on the exact feature head;
- Vercel Preview READY on the same head;
- enforced COS deployment suite: 112/112 tests passed;
- route config, strip-safety and i18n guards passed;
- TypeScript and full Next.js build passed;
- all substantive Codex review findings were fixed and resolved.

Migration applied in Production:

`cos_cognitive_autonomous_certification`

Protected stores:

- `cos_cognitive_certification_cases` — RLS enabled, no browser policy;
- `cos_cognitive_certification_events` — RLS enabled, no browser policy.

Private profile currently available:

`context_ambiguity_v1`

Production private suite geometry:

```text
understanding: 1
practice:      2
holdout:       7
total:        10
```

The raw private prompts/rubrics are deliberately not committed to GitHub.

Certification contract:

```text
encountered candidate
→ deterministic profile admission
→ private independent understanding case
→ practice
→ independent private holdouts
→ deterministic lifecycle recomputation
→ validated
→ learned
→ production evidence + broader holdout evidence
→ mastered
```

Important safeguards:

- unsupported skill families fail closed until an independent certification profile/evaluator exists;
- the candidate-generating model cannot generate its own holdout evidence;
- `generation_source='local_generator'` can never count as holdout evidence;
- no recurring paid closed-model evaluator is automatically enabled;
- failed practice attempts do not satisfy the `practiced` stage;
- practice requires the configured success-rate gate (currently 0.80 minimum);
- certification uses fair candidate rotation so an older candidate cannot monopolize the daily slot;
- interrupted curated exercises are recovered from stale `running` state;
- exhausted private evidence can mark a candidate saturated instead of generating endless exercises;
- daily certification is progressive and allows at most one new model exercise per cycle;
- the mining route gives certification a shared 210-second deadline inside the 300-second function, reserving the remaining budget for later learning/cleanup stages;
- promotion remains deterministic from recorded evidence, never from a model saying it succeeded.

Promotion policy remains evidence-based:

```text
practiced:  >=2 practice attempts AND >=0.80 practice success rate
validated:  >=3 holdouts, >=3 distinct, >=0.80 holdout rate
learned:    >=5 holdouts, >=4 distinct, >=0.85 holdout rate, fresh validation
mastered:   >=20 holdouts, >=10 distinct, >=0.92 holdout rate,
            >=5 verified production outcomes, >=0.90 production success,
            fresh validation
```

Do not lower these thresholds merely to make a skill appear learned.

Current live candidate state immediately after schema/suite installation remains intentionally unforced:

```text
skill: reasoning.context_ambiguity_resolution.v1
status: encountered
evaluator_approved: false
understanding_approved: false
practice_attempts: 0
holdout_attempts: 0
production_attempts: 0
last_validated_at: null
```

That zero-evidence state is correct. The architecture is Production; the skill must earn its own status through actual certification cycles.

The daily `cos-mining` cron runs at `06:30 UTC`. Its endpoint remains `CRON_SECRET` protected. Do not weaken cron authentication or expose the secret merely to force a demo run.

---

# Cognitive lifecycle / retention / quarantine — IMPLEMENTED

Canonical lifecycle:

```text
experience
→ reflection
→ candidate skill
→ evaluation
→ understanding
→ practice
→ independent holdout
→ validated
→ learned
→ mastered
```

Evidence semantics:

- `encountered`: COS has seen/generalized the pattern;
- `evaluated`: candidate survived an independent admission review;
- `understood`: COS demonstrated the principle on a separate hidden case;
- `practiced`: sufficient successful training evidence exists;
- `validated`: minimum unseen holdout evidence passed;
- `learned`: broader/fresh held-out evidence passed;
- `mastered`: stronger holdout evidence plus verified production outcomes passed;
- `weakened`: retention/production evidence degraded and fresh revalidation is required;
- `quarantined`: explicit contradiction or governance evidence disables reuse.

Retention checks are separate from holdout breadth. Replaying an old holdout may test retention but cannot inflate independent validation breadth. Repeated retention failures can weaken a strong skill. Verified production contradictions can quarantine it.

Lifecycle status is capability evidence, not a factual-confidence bonus.

---

# Reasoning control plane / specialist workers — IMPLEMENTED

The provider model is replaceable compute; COS owns routing and learning policy.

Current roles include primary, coder, critic, verifier and researcher. Controlled comparison can collect outcome-gated routing evidence. Learned worker preferences require sufficient independently verified outcomes and cannot override explicit specialist selection or safety-pinned verification.

No hidden chain-of-thought is stored as a learning artifact. Learn only explicit strategy / worker / evidence / outcome telemetry.

---

# Adaptive Retrieval / Agentic RAG — SHADOW V1 VALIDATED; OVERALL LAYER PARTIAL

Adaptive retrieval shadow validation exists and has passed independent validation. Current live retrieval policy is not automatically replaced merely because a lower-context shadow candidate looked efficient.

Remaining work:

- similarity-threshold calibration;
- source-mix / reranking learning;
- explicit bounded live promotion/rollback policy;
- outcome-linked retrieval self-reflection.

A shadow recommendation is not a promoted Production policy.

---

# Failure autopsy — IMPLEMENTED / ACCEPTED

Verified poor outcomes can produce bounded corrective lessons:

```text
verified poor outcome
→ explicit causal-stage classification
→ shadow corrective guidance
→ different controlled retest
→ retain lesson only if retest passes
```

Do not rerun already accepted cases merely to increase counters. Additional later failures may create new pending autopsies; that does not invalidate the mechanism.

---

# Local discovery — IMPLEMENTED AND LIVE

Real-world place queries use live discovery evidence rather than stale model memory. The route prefers deterministic grounded answers when evidence is sufficient, otherwise COS/Qwen evidence-only synthesis, with external fallback optional rather than required.

Conceptual questions must not be hijacked by local-place discovery.

---

# Preference / feedback learning — EXPLICIT STRONG; IMPLICIT PARTIAL

Already present:

- positive / negative / correction feedback;
- exact turn correlation;
- episodic evidence semantics;
- generalized procedural-candidate bridge for negative/correction feedback;
- autonomous certification for supported private profiles.

Still partial:

- carefully defined repeated/rephrased-question signals;
- verified downstream acceptance/use signals;
- abandonment only if there is a defensible event definition;
- no implicit signal may become factual truth or bypass skill validation.

---

# Retrieval Self-Reflection — NEXT MAJOR LEARNING PHASE

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

Completion criterion: retrieval reflections predict later retrieval success/failure well enough to feed a separately validated shadow policy.

---

# Calibration Learning — PARTIAL / HIGH PRIORITY

Use exact `turn_id` outcomes to build calibration buckets by problem class, evidence regime and reasoner. Compare predicted confidence with empirical verified success, derive shadow calibration recommendations, and validate on a separate cohort before changing live confidence/escalation thresholds.

Do not conflate zero-grounding general reasoning with current-state factual claims.

---

# Strategy-selection learning — PARTIAL / HIGH PRIORITY

Outcome correlation, the control plane, specialist workers and controlled comparison harness exist.

Finish:

- measure quality/cost by explicit strategy and like-for-like problem cohort;
- derive shadow strategy recommendations;
- validate direct vs Council/challenge/repair/worker choices on held-out cases;
- promote only bounded rules with audit/rollback;
- never disable skepticism/verification globally merely for latency.

---

# Tool-use / procedural sequence learning — PARTIAL

Cognitive Skills already include prerequisites, procedure, tools, observables, falsifiers, common failure modes and prohibited actions.

Finish outcome-based problem-class → governed tool/skill sequence recommendations. Learned preferences must never widen authorization or bypass approvals.

---

# Episodic → semantic compression — PARTIAL

Repeated independently supported episodes may propose generalized facts/rules/skills, but require corroboration, contradiction checks, correct scope and independent validation before durable promotion. Contradicted generalized knowledge must be weakenable/quarantinable.

One episode remains insufficient for strong semantic promotion.

---

# Repository inspection authority — FIXED / LIVE

A signed-in owner request to scan, audit, inspect, review or analyze the configured SignalBoost repository is already authorization for **read-only** repository inspection.

The chat must not ask the owner to repeat the configured repository, reconfirm permission or paste files. Repository reads remain separate from write/deploy/secret authority.

---

# Governed remediation experience — IMPLEMENTED; runtime acceptance pending

COS now retains a bounded form of operational experience from objectively recorded Self-Healing repair outcomes.

```text
incident observed
→ COS diagnosis from current bounded evidence
→ optional prior repair suggestions only after repeated clean objective outcomes
→ existing Agent Gateway policy / approval evaluation
→ execution or staging / fail closed
→ objective outcome record
→ future diagnostic context
```

Rules:

- a prior repair is only a diagnostic suggestion, never execution authority;
- a remedy is suggested only after at least two objective successes, zero recorded failures, and an exact match on provider, environment and bounded incident class;
- any recorded failure disqualifies that action from the suggestion set;
- the context excludes raw prompts, credentials and hidden chain-of-thought;
- Agent Gateway registration, policy and approval requirements are unchanged;
- this is retained operational experience, not provider-weight self-training.

Files:

- `saas/self-healing-host/remediation-experience.ts`
- `saas/self-healing-host/native-autonomous-loop.ts`
- `saas/self-healing-host/council-outcome-bridge.ts`
- `saas/lib/autonomous-supervisor/diagnostic.ts`
- `saas/tests/remediationExperience.node.test.ts`

Still required before calling it production-runtime-proven: a safe controlled anomaly that produces repeated objective repair outcomes, then a later equivalent anomaly whose COS diagnosis shows the eligible prior-repair suggestion while governance remains intact.

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
- no hidden chain-of-thought persistence;
- private certification prompts must not be committed to GitHub or returned through public/admin APIs without an explicit protected diagnostic need.

---

# Recent merged sequence that matters

- #1328 — exact turn outcomes + controlled evidence-utilization benchmark.
- #1329 — benchmark reliability / latest-score cleanup.
- #1330 / #1332 — learning-gap + general failure autopsy.
- #1331 — Concierge explicit feedback controls / secure turn correlation.
- #1333 / #1334 — provider-neutral reasoning control plane and Production routing.
- #1337 — specialist reasoning workers.
- #1338 — reasoning outcome learning.
- #1339 — controlled reasoning comparison harness.
- #1341 — adaptive retrieval shadow validation.
- #1345 — private benchmark cohort protection + adaptive preflight.
- #1348 / #1349 onward — temporal/current-world freshness generalization.
- #1355 — general external factual lookups live-verify by default.
- #1360 / #1362 — local discovery grounded/local-first synthesis.
- #1363 — answer-side freshness self-reflection.
- #1364 — governed feedback → reusable procedural candidate learning + structural triggers.
- #1376 — autonomous evidence-gated cognitive skill certification with private profiles and bounded scheduling.

Always query current state; this sequence can advance after this document is merged.

---

# Immediate next engineering priorities

1. **Observe the first real #1376 certification cycles** and verify the seeded ambiguity candidate progresses only when private understanding/practice/holdout evidence passes. Do not manually set lifecycle flags/counters.
2. **Retrieval Self-Reflection:** build bounded explicit retrieval assessments and prove predictive value against later outcomes.
3. **Calibration Learning:** empirical confidence calibration by problem/evidence/reasoner cohort, shadow first.
4. **Strategy-selection learning:** validate worker/Council/challenge/repair choices on like-for-like held-out cohorts.
5. **Adaptive Retrieval v2:** similarity-threshold calibration, source mix/reranking and explicit bounded promotion/rollback.
6. **Add independent certification profiles only where justified** by a private/curated test family; unsupported procedural candidates must continue to fail closed.
7. **Retention continuity:** prove delayed refresh + weaken/quarantine paths under the current reasoner without inflating holdout breadth.
8. **Episodic → semantic compression:** multi-episode corroboration and reversible promotion.
9. **SFT/LoRA readiness only after** sufficient high-integrity outcome-labelled data, contamination controls and a separate held-out comparison exist.

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
A private certification case is evidence only after it is actually executed and recorded.  
A current-world page retrieved now can itself contain stale content; source date and authority still matter.

---

# Definition of success

The model/provider is replaceable compute. **COS is the learner.**

Success means validated experience measurably improves held-out or verified Production performance, transfers to materially different variants, retains the improvement, lowers repeated teacher/fallback dependence, and preserves honest confidence, provenance, tenant scope and governance.

For metacognitive learning, COS must prove which retrieval policy, evidence class, procedural skill, tool sequence or explicit reasoning strategy improved outcomes for a problem class, detect when that lesson stops working, and safely weaken, quarantine or roll it back.
