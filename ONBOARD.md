# ONBOARD.md

# SignalBoost Engineering Blueprint
## Cognitive Operating System (COS)

**Version:** 1.16  
**Updated:** 2026-08-21 UTC  
**Canonical scope:** current engineering / operations handoff; verify live state before acting  
**Current `main`:** `aa1af8f1bfb35753c1eacf52d0ab0647840cde04`  
**Production domain:** `https://saas.signalboostapp.com`  
**Production deployment:** READY on the current `main` above  
**Active COS engineering:** PR #1328 `Correlate COS outcomes and benchmark evidence utilization` — IN PROGRESS; do not call complete until Preview, schema, merge, Production and runtime acceptance are all proven  
**COS primary reasoner:** DeepInfra managed open-model runtime → `Qwen/Qwen3.6-35B-A3B`  
**COS embedding model:** DeepInfra → `BAAI/bge-base-en-v1.5` → exactly 768 dimensions  
**RunPod lifecycle:** detached while the active reasoner points outside RunPod  
**COS learning:** durable COS-owned memory/knowledge/skills/outcomes; not provider model-weight fine-tuning  
**Enterprise Release Candidate:** evidence-based only; never infer from a green deployment

**Repository-inspection correction (2026-08-22):** An explicit signed-in owner request to scan, audit, review, or inspect the repository is already authorization for read-only inspection. The COS chat now forces `listRepoFiles` first and requires canonical file reads before it responds. It must not ask the owner to specify the already configured SignalBoost repository, confirm permission again, or paste files. Repository access remains GET-only; it grants no secret, deployment, merge, or write authority.

Historical detail remains in Git history and the dated handoffs under `docs/`. This file intentionally prioritizes current operational truth and the next safe actions.

---

# Mandatory first-read rule

Every developer, AI coding agent, reviewer, operator, contractor, or infrastructure assistant working on this repository must:

1. Read this `ONBOARD.md` first.
2. Read `docs/HANDOFF-COS-DEEPINFRA-2026-08-20.md` for migration history and rollback context.
3. Scan current `main`, open PRs, Vercel Production state, and current Supabase migrations before changing anything.
4. Read the exact files related to the task.
5. Verify implementation/runtime from code and live evidence before diagnosing or reporting status.
6. Never report current behavior from memory alone.

A branch is not Production. A green build is not capability acceptance. A provider health response is not held-out mastery.

---

# Finish-to-completion rule — MANDATORY

The owner explicitly requires that COS learning work be finished end-to-end rather than left as a collection of partial mechanisms.

**Do not call a learning feature implemented merely because code exists.** A feature is complete only when every applicable gate below is closed:

```text
architecture / contract
→ implementation
→ deterministic/unit regression coverage
→ schema migration if required
→ exact Preview compile + TypeScript + build
→ merge to current main
→ exact Production deployment READY
→ live Production runtime evidence
→ outcome/telemetry evidence showing the feature actually operates
→ ONBOARD.md updated with the final state
```

If GitHub Actions infrastructure cannot start jobs, record that separately and never pretend the tests ran. A Vercel build may prove compile/type/build health, but it does not retroactively turn zero-step Actions failures into passing tests.

When a learning layer is partial, the default priority is to **finish that layer before inventing another adjacent layer**, unless a clearly documented prerequisite must be built first.

Do not leave decorative APIs, tables, dashboards, outcome columns, or telemetry that no real execution path populates. Every persisted signal must have at least one real producer and at least one intended consumer/analysis path.

---

# COS learning completion backlog — FINISH THESE, DO NOT RE-LABEL THEM AS DONE EARLY

The following maps the current learning stack to the remaining work. Items marked COMPLETE have working mechanisms already; items marked PARTIAL must be finished end-to-end under the rule above.

## 1. Agentic RAG / adaptive retrieval — PARTIAL

Already present:

- BGE semantic retrieval with model-space identity;
- Knowledge Graph, Learned Corpus, Enterprise Memory, User Memory and Cognitive Skills;
- relevance filtering and evidence funnel `retrieved → relevant → selected → injected → cited`;
- source-kind utilization measurement from PR #1325;
- conservative unknown-domain filtering from PR #1324;
- provenance that distinguishes retrieval from material use.

Finish:

1. accumulate outcome-correlated utilization data by problem class, source kind and similarity band;
2. calibrate BGE similarity thresholds from useful vs unused evidence instead of guessing;
3. learn shadow retrieval recommendations for route/index, top-k, source mix and reranking by problem class;
4. measure context waste: injected-but-unused items, characters/tokens and retrieval latency;
5. validate proposed retrieval changes on a separate controlled/held-out cohort;
6. only after validation allow bounded policy promotion with audit/rollback; never let one model turn change retrieval policy directly.

Completion criterion: COS can demonstrate, with held-out evidence, that its adaptive retrieval policy improves usefulness/quality or cost without reducing capability, grounding, provenance or tenant isolation.

## 2. Retrieval self-reflection — PARTIAL

Already present:

- citations identify declared material evidence use;
- utilization records identify unused injected evidence;
- turn telemetry records phase cost and skips.

Finish:

- produce a bounded post-turn retrieval assessment containing only explicit artifacts such as sufficiency, unused evidence, missing evidence class and recommended retrieval adjustment — no hidden chain-of-thought storage;
- correlate that assessment with later outcomes;
- score whether the recommendation would actually have helped before it can influence policy;
- deduplicate repeated low-value reflections.

Completion criterion: retrieval reflections have measured predictive value against later outcomes and can safely feed the shadow adaptive-retrieval policy.

## 3. Knowledge Graph augmentation — COMPLETE MECHANISM; CONTINUE QUALITY WORK

Knowledge Graph is already a first-class durable evidence layer with active/quarantined state, semantic retrieval and provenance. Continue relationship quality, contradiction handling and coverage, but do not describe KG itself as missing.

## 4. Preference / feedback learning — EXPLICIT COMPLETE; IMPLICIT PARTIAL

Already present:

- positive, negative and correction feedback learning;
- user feedback eligibility/governance;
- episodic experience storage.

PR #1328 is completing exact reasoner-turn correlation so feedback can be attached to the execution that generated the answer.

Finish implicit signals deliberately:

- repeated/rephrased question shortly after an answer;
- user correction/edit when a server-owned event proves it;
- accepted/useful downstream action when verifiable;
- abandonment only when there is a defensible event definition — absence of a click is not automatically negative feedback;
- never convert implicit behavior directly into factual truth or automatic skill promotion.

Completion criterion: explicit and selected high-integrity implicit feedback are correlated to exact turns with clear semantics and are consumed by calibration/strategy analysis.

## 5. Curriculum, practice and active learning — STRONG / MOSTLY COMPLETE

Already present:

- active practice queue;
- locally generated practice variants;
- independent evaluator option;
- understanding checks;
- independent holdout variants;
- local-generated variants are forbidden from counting as holdouts;
- lifecycle states and promotion evidence;
- gap-driven/active learning machinery.

Finish remaining operational proof:

- show recurring weak/untested regions actually generate bounded practice;
- prove holdout breadth increases only from independent/curated/production-replay sources;
- prove repeated practice improves later independent holdout or verified production outcomes;
- expose saturation/no-improvement states instead of endlessly generating exercises.

Completion criterion: a documented weak capability can be observed moving through practice → independent validation → retained improvement without self-grading leakage.

## 6. Cross-session consolidation / retention / forgetting — COMPLETE MECHANISM; PROVE CONTINUITY

Already present:

- stale validated skills weaken;
- delayed independent retention checks;
- weakened and quarantined states;
- retention replay cannot count as new holdout breadth;
- consolidation cycle.

Finish runtime acceptance:

- demonstrate at least one real delayed retention cycle under the current DeepInfra reasoner;
- confirm stale/failed retention changes state correctly;
- confirm a successful delayed replay refreshes retention without inflating holdout breadth;
- include results in the admin learning report/handoff.

## 7. Metamemory — STRONG / PARTIAL COMPLETION

Already present:

- capability regions such as `strong`, `developing`, `weak`, `untested`, `conflicted`;
- recurring knowledge gaps;
- Council trigger reads metacognitive state;
- confidence/evidence gating.

Finish:

- reconcile capability-region state with real outcome-correlated turns;
- distinguish `unknown because untested` from `weak because failed` and `conflicted because evidence disagrees` in all reports;
- measure stale capability beliefs and refresh them from verified outcomes;
- provide an explicit coverage map showing what COS knows, what is weak, what is stale and what has never been tested.

## 8. Tool-use / procedural learning — STRONG / PARTIAL

Already present:

- Cognitive Skills with prerequisites, procedures, tools, observables, falsifiers, failure modes and prohibited actions;
- practice, holdout, production-attribution and retention lifecycle;
- governed tool/action boundaries remain separate from model prose.

Finish:

- record governed tool sequence, deterministic outcome, latency and failure class for eligible executions;
- learn problem-class → tool/skill sequence recommendations in shadow mode;
- learn repeatable tool failure patterns such as timeout/input/permission constraints from verified telemetry;
- validate sequence recommendations before promotion;
- never let learned tool preference widen authorization or bypass approval.

Completion criterion: COS can recommend a better validated tool sequence for a problem class based on verified executions and prove improvement on a separate cohort.

## 9. Multi-agent / Council learning — IMPLEMENTED; STRATEGY POLICY PARTIAL

Already present:

- Architect, SRE, Database, Security, Business and Skeptic Council roles;
- independent opinions;
- explicit claims, assumptions, observables and falsifiers;
- challenge/rebuttal mechanisms;
- externally verified role credibility;
- objective-outcome and deterministic claim-resolution paths.

Finish:

- correlate Council invocation, selected roles, challenge use and phase cost with exact turn outcomes;
- learn which role sets/strategies help which problem classes;
- identify Council cases where added cognition changes no outcome and only adds latency;
- keep learned Council routing in shadow mode until held-out quality proves it safe;
- never optimize latency by simply disabling skepticism/verification globally.

## 10. Calibration learning — PARTIAL, HIGH PRIORITY

Already present:

- model-reported confidence;
- grounding/specificity ceilings;
- escalation threshold;
- held-out benchmark outcomes;
- metacognitive capability state.

Finish:

1. persist predicted confidence with exact outcome-correlated turn ID;
2. build calibration buckets by problem class, evidence regime and reasoner;
3. calculate empirical success rate / calibration error for each bucket;
4. distinguish zero-grounding general reasoning from organization/current-state factual claims;
5. derive a shadow calibrated-confidence recommendation;
6. validate against held-out cases before changing the live escalation threshold or confidence displayed to policy;
7. audit and rollback every promoted calibration policy.

Completion criterion: COS can show that calibrated confidence better predicts verified success than raw model confidence on a separate evaluation set.

## 11. Strategy-selection / metacognitive routing — PARTIAL, HIGH PRIORITY

Already present:

- direct reasoning;
- Council;
- challenge;
- draft/quality/citation repair phases;
- per-phase turn timing/skips from PR #1323;
- static/bounded turn budget;
- Council trigger from complexity, consequence, gaps and metacognitive state.

PR #1328 is completing the missing turn → outcome correlation.

Finish:

- classify only explicit reasoning strategy artifacts, never hidden chain-of-thought;
- learn outcome/cost by strategy and problem class;
- compare like-for-like difficulty/evidence cohorts to avoid selection bias;
- produce shadow strategy recommendations;
- validate against controlled/held-out cases;
- promote only bounded strategy rules that improve quality/cost without reducing governance.

Completion criterion: COS has an outcome-validated strategy policy for at least several problem classes and can explain which observed signals selected the strategy.

## 12. Failure autopsy — PARTIAL, HIGH PRIORITY

Already present:

- knowledge gaps;
- benchmark failure reasons;
- practice/holdout failures;
- retention failures;
- provenance and evidence funnels;
- Council challenges and falsifiers;
- source-utilization data.

Finish an automated bounded autopsy pipeline:

```text
verified poor outcome
→ identify causal stage candidates
   retrieval / evidence selection / reasoning / grounding / calibration / tool execution / stale knowledge
→ capture explicit evidence for diagnosis
→ propose corrective lesson/policy in shadow mode
→ generate or select a separate retest
→ verify improvement
→ retain correction only if retest succeeds
```

Do not store hidden chain-of-thought. Store explicit failure class, observable evidence, falsifier, corrective action and retest result.

Completion criterion: at least one real failure is automatically classified, corrected, independently retested and shown not to recur on a relevant variant.

## 13. Episodic → semantic compression — PARTIAL

Already present:

- episodic experiences;
- durable facts/knowledge;
- cognitive skills;
- consolidation/retention mechanisms.

Finish:

- detect repeated independently supported episodic patterns;
- propose generalized semantic rule/skill with provenance to supporting episodes;
- require corroboration/minimum evidence and contradiction checks;
- keep organization/user-scoped generalizations scoped correctly;
- independent validation before durable promotion;
- decay/weaken/quarantine generalized rules when contradicted.

Completion criterion: COS can show a generalized rule derived from multiple episodes, prove its support/validation and safely weaken it when later evidence contradicts it.

## 14. Curiosity / self-play / edge-case learning — IMPLEMENTED BOUNDED; EXPAND ONLY AFTER METACOGNITION

Already present:

- local practice generation;
- active learning queues;
- weak/gap-driven learning machinery;
- prohibition on self-generated holdouts.

Finish only after outcome correlation/calibration is mature:

- target practice generation to high-value weak/untested areas;
- seek boundary/edge cases around known failures;
- stop when marginal learning gain saturates;
- independent grading remains mandatory for mastery.

## 15. Social / observation learning — COUNCIL EXISTS; LEARNING-FROM-DEMONSTRATIONS PARTIAL

Council/debate is implemented. For observation/demonstration learning, finish only through governed skill candidates:

- ingest a verified expert/teacher demonstration as evidence, not truth;
- extract a candidate procedure;
- require independent evaluator/understanding check;
- require independent holdout or verified production evidence before strong status;
- preserve source/provider provenance and prevent teacher answer from becoming automatic factual authority.

## 16. Outcome-based metacognitive learning — IN PROGRESS ON PR #1328

PR #1328 is the current prerequisite and must be finished before calling this layer complete.

Target end state:

```text
reasoning turn_id
→ source utilization
→ phase execution / cost
→ user feedback
→ held-out benchmark outcome
→ verified production outcome
→ calibration + strategy + retrieval analysis
```

#1328 specifically adds/targets:

- race-safe durable `cos_turn_outcomes` keyed by exact reasoner `turn_id`;
- server-owned assistant-message provenance correlation;
- user feedback → exact turn outcome;
- capability benchmark PASS/FAIL → exact turn outcome;
- verified production outcome correlation through explicit `cos_turn_id`;
- outcome-aware evidence-utilization and turn-experience reports;
- separate 36-case controlled evidence-utilization benchmark across nine domains.

Completion gates for #1328:

1. exact final Preview passes compile + TypeScript + build;
2. GitHub Actions tests execute and pass when Actions runner/account infrastructure is available — if jobs still die before checkout, keep that limitation explicit;
3. additive Production migration is applied only after final Preview is healthy;
4. PR is mergeable and merged without overwriting newer main work;
5. exact Production deployment reaches READY;
6. at least one normal Production turn stores turn correlation;
7. at least one feedback or benchmark outcome attaches to that exact turn;
8. evidence-utilization and turn-experience reports read the durable outcome correctly;
9. controlled utilization benchmark produces real rows without altering the six-case private acceptance rotation;
10. ONBOARD.md records final evidence.

## 17. SFT / LoRA — NOT YET; BUILD READINESS DATASET FIRST

Do not fine-tune Qwen merely because examples exist.

Before SFT/LoRA, require:

- sufficient volume of outcome-correlated turns;
- high-integrity success labels from held-out/verified outcomes;
- failure/autopsy corrections represented;
- source/provenance and tenant-scope controls;
- deduplication and contamination checks;
- train/eval/held-out split that cannot leak private acceptance cases;
- baseline base-Qwen vs candidate adapter comparison;
- rollbackable adapter deployment behind the same provider-neutral seam;
- proof that fine-tuning improves held-out capability without worsening calibration, grounding, governance or provider portability.

Until those gates exist, COS-owned memory/skills/outcomes remain the learning substrate and Qwen weights remain replaceable compute.

---

# Current Production architecture

```text
Request / goal
→ deterministic policy / business rules
→ exact / semantic / durable reuse
→ Enterprise Memory
→ Knowledge Graph
→ Continuous Learning / bounded context
→ validated procedural skills
→ COS primary reasoner seam
→ confidence / evidence gate
→ governed external source or teacher only when justified
→ verification
→ outcome measurement
→ retain / strengthen / weaken / quarantine
```

Current primary reasoner transport:

```text
COS
→ provider-neutral LOCAL_AI_* seam
→ OpenAI-compatible transport protocol
→ DeepInfra
→ Qwen/Qwen3.6-35B-A3B
```

Current semantic embedding path:

```text
COS semantic retrieval / learning
→ embedding seam
→ DeepInfra
→ BAAI/bge-base-en-v1.5
→ 768 dimensions
→ model-aware pgvector stores
```

The `/v1/openai` path is only an API compatibility interface. OpenAI does **not** provide the model, compute, account, API key, or billing for this path.

Do not describe DeepInfra as self-hosted, local compute, or OpenAI.

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
LOCAL_AI_API_KEY=<DeepInfra production secret>
```

`LOCAL_AI_API_KEY` is a server-side secret. Never commit it, print it, paste it into logs, or expose it through an API response.

The first post-cutover Production diagnostic failed because `LOCAL_AI_API_KEY` was absent from the Production Vercel environment. That was a configuration failure, not a capability failure. After the key was added and Production redeployed, diagnosis passed.

---

# PR #1318 — DeepInfra production cutover — MERGED

PR #1318 `Prepare COS DeepInfra production cutover` merged as:

`d3495d3727f7728510cae5d0781272a4b965e10f`

It permanently:

- removed provider-specific RunPod reasoner pins from `saas/vercel.json`;
- made runtime provider selection environment-driven;
- detached RunPod lifecycle when `LOCAL_AI_BASE_URL` points outside RunPod;
- bypassed RunPod wake/model-list readiness polling for managed non-RunPod providers;
- added `LOCAL_AI_REASONING_EFFORT` support;
- made a real chat completion authoritative for managed-provider health;
- preserved exact 768-dimension embedding validation;
- introduced managed-open-model provenance on the canonical reasoner path.

Temporary Preview-only migration endpoints were not merged.

---

# Production reasoner + embedding acceptance — PASS

Owner-only Production diagnostic after the Production key fix returned:

```text
ok: true
verdict: ok
reasoner baseUrl: https://api.deepinfra.com/v1/openai
reasoner model: Qwen/Qwen3.6-35B-A3B
apiKeyPresent: true
completion HTTP: 200
completion text: ready
completion latency: 244 ms
embedding model: BAAI/bge-base-en-v1.5
embedding dimensions: 768
required dimensions: 768
```

The diagnostic correctly skipped `/models` for the managed provider and used a real completion as the health authority.

Production telemetry also confirmed RunPod detachment:

```text
[cos-runpod-detached]
selectedPodId: null
reason: LOCAL_AI_BASE_URL points outside RunPod; RunPod lifecycle control is disabled for this reasoner.
```

Proven gates:

1. DeepInfra Production reasoner reachable — **PASS**.
2. Qwen final-text completion — **PASS**.
3. BGE embedding endpoint — **PASS**.
4. Exact 768 dimensions — **PASS**.
5. RunPod lifecycle detached from the active managed reasoner — **PASS**.
6. Temporary unauthenticated Preview acceptance route absent from `main` — **PASS by merge design**.

---

# Historical Production benchmark failure — KEEP AS EVIDENCE

A real Production held-out run after the provider switch, but before vector-space repair, completed:

```text
attempted: 2
passed: 1
pass rate: 50%
external AI invoked: false on both cases
response source: local_cos_reasoning on both cases
```

Results:

- `incident-reasoning` — **PASS**.
- `learning-admission` — **FAIL** because COS did not recall the authoritative admission doctrine requiring `probationary` and independent `corroboration` before durable promotion.

This was a real capability/retrieval failure, not a DeepInfra connectivity failure. Do not erase or average away this run; it exposed a migration defect that is now architecturally repaired.

---

# Root cause — mixed embedding model spaces

The authoritative learning-admission facts already existed in Production Knowledge Graph storage before the benchmark failure.

Historical durable vectors had been produced by the prior Nomic embedder. After the provider migration, query embeddings were produced by:

`BAAI/bge-base-en-v1.5`

Both models return 768-dimensional vectors, but equal dimension does **not** mean equal semantic vector space. BGE query vectors compared against historical Nomic vectors produced unreliable nearest-neighbor retrieval.

Critical doctrine:

> Embedding model identity is part of the semantic schema. Dimension compatibility alone is insufficient.

Never assume two models are interchangeable because both return `vector(768)`.

---

# PR #1320 — embedding model-space repair — MERGED AND LIVE

PR #1320 `Fix COS embedding model-space migration` merged as:

`fd54b9c5873fc8742f5d0e89c398d3394d458d46`

The repair:

- added `embedding_model` identity to durable vector stores;
- marked historical pre-versioned vectors `legacy:unversioned` rather than falsely claiming compatibility;
- made Knowledge Graph, Continuous Learning, and semantic-cache nearest-neighbor retrieval model-aware;
- treated missing **or wrong-model** vectors as re-embedding backlog;
- partitioned semantic answer cache policy by embedding model so old vector-space cache entries become unreachable without destructive deletion;
- added owner-only `/api/admin/cos-learning/reembed-current-space`;
- added migration `20260821_cos_embedding_model_space.sql`;
- added regression coverage proving an embedding-model-only change changes the semantic-cache partition.

The database migration was applied before application cutover so Production never required a schema-breaking transition.

---

# BGE durable re-embedding — COMPLETE

Owner migration result:

```text
ok: true
completed: true
embeddingModel: BAAI/bge-base-en-v1.5
facts attempted: 45
facts embedded: 45
facts failed: 0
facts remaining: 0
corpus attempted: 111
corpus embedded: 111
corpus failed: 0
corpus remaining: 0
corpus total: 152
corpus eligible: 111
corpus eligibleEmbedded: 111
corpus rejected: 41
rounds: 14
batchSize: 8
duration: ~20.4 s
```

Direct Production database verification matched the operation:

```text
cos_knowledge_facts total: 45
BGE-tagged facts: 45
legacy facts: 0
null-model facts: 0

cos_continuous_learning total: 152
eligible corpus rows: 111
BGE-tagged eligible rows: 111
eligible old/null rows remaining: 0
rejected/quarantined rows: 41
```

The authoritative `probationary` and independent `corroboration` admission facts are BGE-tagged with non-null vectors.

The 41 rejected/quarantined corpus rows are excluded from governed semantic retrieval and therefore are not an eligible embedding backlog.

---

# Post-re-embedding Production benchmark — FIRST RUN PASS

The first real Production held-out run after the completed BGE migration passed **2/2 = 100%**.

Tracks and evidence:

```text
learning-admission: PASS
latency: ~43.9 s
response source: local_cos_reasoning
local model invoked: true
external AI invoked: false

security-governance: PASS
latency: ~168.0 s
response source: local_cos_reasoning
local model invoked: true
external AI invoked: false
```

This proves the repaired BGE semantic space is functioning for a `learning-admission` held-out case.

Important: this was the *other* `learning-admission` case. The exact admission case that failed during the mixed-vector-space run has not yet rotated through post-repair acceptance. Keep that final check pending until observed.

Benchmark rotation is deterministic. From the current run sequence, the remaining two owner runs should exercise:

1. `memory-governance` + `provenance`;
2. `incident-reasoning` + the exact previously failed `learning-admission` case.

Never weaken the held-out rubric to make these cases pass.

---

# PR #1321 — managed-provider provenance cleanup — MERGED AND LIVE

PR #1321 `Fix managed-provider provenance labels on fresh COS paths` merged as:

`88eec94e4880a263f25c6e05bbfdc526fe6f8c79`

#1321 closed the remaining known code-level provenance-label gaps:

- fresh-evidence local synthesis now uses canonical `resolveCosReasoner()` labeling;
- COS Primary fresh-evidence decline/fallback paths use the same canonical provider-aware resolver;
- regression tests prohibit reintroducing hand-built `independent-local:` labels on those paths.

Expected managed Production label:

```text
managed-open-model:deepinfra:Qwen/Qwen3.6-35B-A3B
```

A self-hosted RunPod/Ollama model may legitimately report:

```text
independent-local:<model>
```

DeepInfra must not.

---

# PR #1323 / #1324 / #1325 — metacognition and evidence utilization — MERGED AND LIVE

Current Production `main` includes the following post-#1321 learning work:

- **PR #1323** — per-turn metacognitive execution telemetry: phase timing, skip reasons, reasoner identity, prompt-safe correlation, later outcome fields;
- **PR #1324** — evidence-utilization metrics plus fix for the proven `unknown domain → accept every candidate` relevance defect;
- **PR #1325** — learned-corpus `source_kind` utilization, correlated to reasoner `turn_id`, with graded `insufficient_evidence / never_cited / low_utilization / useful / high_value` verdicts and owner report.

Production schema includes `cos_turn_experience` and `cos_evidence_source_use` with RLS. These are telemetry/learning inputs; they do not by themselves authorize automatic routing changes.

---

# Provenance semantics

Canonical labels:

```text
independent-local:<model>
managed-open-model:<provider>:<model>
```

Current expected Production label:

```text
managed-open-model:deepinfra:Qwen/Qwen3.6-35B-A3B
```

Closed-model OpenAI/Anthropic/Gemini paths remain separately governed fallback/teacher providers and must never masquerade as COS primary reasoning.

Code-level managed-provider labeling is complete for the known primary and fresh-evidence paths. A normal owner Production COS turn should still be captured as live runtime evidence before calling the provenance observation gate fully closed.

---

# Live COS learning continuity

Verified Production learning state around the cutover/re-embedding period:

```text
cos_continuous_learning total: 152
retained documents last 7d: 77
distinct recent subjects: 36
new subjects last 7d: 21
open learning gaps: 0
```

The continuity watchdog remains AMBER because the gap table has no open gaps (`no_open_gaps`), not because learned knowledge disappeared or retention stopped.

Interpretation:

- provider migration did not erase COS-owned learned knowledge;
- all 111 eligible corpus rows are in the active BGE vector space;
- the gap-generation/resolution lifecycle still deserves review;
- do not bulk-create or bulk-resolve gaps merely to make the dashboard green;
- observe a new post-cutover learning cycle and confirm new retention or an explicit healthy duplicate/rejection outcome.

COS learning is durable system memory/knowledge/skills/outcomes. It is not Qwen weight training and it is not owned by DeepInfra.

---

# Embedding doctrine

The COS vector schema remains 768-dimensional, but dimension is only one compatibility property.

Any embedding model swap must account for:

1. vector dimension;
2. embedding model identity;
3. vector-space compatibility;
4. durable-store re-embedding;
5. semantic-cache partition/invalidation;
6. RPC/query filtering by embedding model;
7. post-migration held-out retrieval/capability validation.

Do not pad/truncate vectors to fake compatibility.

Current governed embedding model:

`BAAI/bge-base-en-v1.5`

Observed BGE provider constraint: available input length is 512 tokens. Permanent code performs bounded truncation/retry when the provider reports a context-window overflow.

Performance follow-up: reduce the common oversized-input case toward one predictable bounded retry without weakening semantic integrity or exact dimension validation.

---

# Latency / Cognitive Council

DeepInfra health probes are fast (~244–404 ms), but full COS turns can be much slower because COS may invoke Qwen multiple times for advisory/challenge/rebuttal/repair phases.

Observed benchmark-era turn latencies include approximately:

- 37 s;
- 44 s;
- 54 s;
- 106 s;
- 168 s;
- 202 s.

The ~202-second case was not a single 202-second DeepInfra request. Runtime telemetry showed Cognitive Council escalation and several additional model calls.

Do not disable Council merely to improve benchmark latency. Instead:

- use observed/rolling provider latency in optional-phase budgeting;
- reserve enough wall-clock time to return the best available answer before the 300-second route ceiling;
- distinguish model-call latency from orchestration latency in telemetry;
- keep quality and governance gates intact.

Canonical budget file:

`saas/lib/ai/cos/cosTurnBudget.ts`

---

# RunPod historical state / rollback

RunPod is not the active Production reasoner while `LOCAL_AI_BASE_URL` points at DeepInfra.

Runtime rule:

```text
RunPod reasoner URL → RunPod lifecycle may apply
non-RunPod reasoner URL → RunPod lifecycle must remain detached
```

Historical RunPod configuration or pod IDs are not proof of healthy rollback compute. Previous incidents included missing GPU device allocation, CPU fallback, model-process termination, and host-capacity failure.

Rollback, if required, is environment-driven:

1. restore a verified healthy RunPod/self-hosted reasoner URL/model/key/host allowlist;
2. choose a compatible embedding path deliberately;
3. if the embedding model changes, repeat the model-space migration discipline above;
4. redeploy;
5. verify reasoner + embeddings + lifecycle state;
6. run bounded private capability tests;
7. verify provenance and learning continuity.

Do not silently activate stale RunPod credentials while a managed reasoner is active.

---

# Enterprise Memory / Semantic Cache doctrine

Do not conflate these systems.

**Enterprise Memory** is durable organization-scoped operational knowledge: facts, decisions, history, outcomes, and reusable enterprise intelligence. It is not an answer cache.

**Semantic Cache** is policy-versioned, age-bounded reuse of a sufficiently similar prior answer. Embeddings are the retrieval index, not the knowledge itself.

Organization/user-scoped context must never be reused through an unscoped cache entry.

Authoritative evidence funnel:

```text
retrieved → relevant → selected → injected → cited
```

A subsystem counts as `USED` only when it materially contributed to the answer.

Embedding model identity is now part of semantic-cache partitioning. Never reuse semantic-cache vectors across incompatible embedding spaces.

---

# COS independence / learning doctrine

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

The model/provider is replaceable compute. **COS is the learner.**

Durable COS-owned assets include:

- Enterprise Memory;
- Knowledge Graph;
- Continuous Learning corpus;
- procedural skills;
- episodic experiences;
- verified outcomes;
- curriculum/gap state;
- source/provenance knowledge;
- policy/governance;
- benchmark/feedback evidence;
- semantic-cache policy/version history.

A provider answer is not automatically truth. A cached answer is not new competence. A retained document is not mastery. A runtime health pass is not held-out certification.

The mature target remains roughly **85% independent pass rate on a broad separate held-out SignalBoost workload**. Never lower evidence/confidence gates, fabricate skills, or count self-generated practice as hidden holdout evidence merely to improve the number.

---

# Private capability benchmark

Owner dashboard:

`/dashboard/cos-capability-benchmark`

API:

`/api/admin/cos-capability-benchmark`

Rules:

- cases are private and outside ordinary learning acquisition;
- exact/semantic cache reuse does not count as fresh capability;
- external AI cannot satisfy a local-COS reasoning requirement;
- normal web runs are bounded to at most two cases;
- infrastructure/unavailable-reasoner runs with `attempted=0` are not capability failures;
- do not expose private prompts or response excerpts through public diagnostics;
- never tune the rubric from the answer merely to improve a score.

Migration Preview acceptance used `persisted:false`; it did not pollute Production benchmark history.

---

# Self-Healing Supervisor — preserve governance

Self-Healing remains proactive and governed.

```text
Native monitor / external signal
→ bounded evidence
→ normalize incident
→ COS-first diagnosis
→ registered repair plan
→ Agent Gateway / MCP governance
→ execute only if explicitly permitted
   OR stage / require approval / fail closed
→ verify
→ audit
→ learn
```

Unknown/consequential/destructive/financial/security actions remain governed and approval-gated.

Automatic routine repair never means arbitrary mutation. Never convert model prose directly into an executable target.

Current detailed reference:

`docs/portables/self-healing-monitoring-current-state-20260813.md`

---

# Marketing & Sales / broader platform continuity

COS must remain integrated with the broader SignalBoost platform rather than becoming a provider-owned silo.

Major platform layers include:

- Enterprise Memory / Knowledge Graph / Continuous Learning;
- Prospect Intelligence;
- Business Intelligence Corpus;
- Communication Hub;
- CRM integration framework/adapters;
- campaign and outreach queues;
- Revenue Intelligence;
- Universal Adapter seams;
- approvals, audit, telemetry, and cost governance;
- localization guardrails.

The 5,000-company Business Intelligence Corpus remains a coverage/population target. It is not a reason to bypass COS-first internal knowledge and call external actors unnecessarily.

---

# Security / secrets

Non-negotiable:

- never hard-code or expose provider secrets;
- never print complete API keys/tokens;
- keep owner/admin routes server-gated;
- keep cron routes protected;
- remote inference must use HTTPS, authentication, and exact-host allowlisting;
- preserve tenant/org scoping and RLS/service-role assumptions;
- do not create unauthenticated Production validation endpoints for convenience;
- never let a managed provider become a governance authority;
- retain fail-closed behavior for unknown or consequential actions.

---

# Build / test / deployment rules

- Read files before changing them.
- Prefer coherent batches of related changes.
- Preserve existing behavior unless the task requires a deliberate change.
- Run relevant typecheck, build, tests, CI, and live acceptance before calling a batch successful.
- Never claim CI/build/deployment passed unless it actually did.
- Never call a branch commit Production.
- Never call a green Vercel deployment Enterprise RC acceptance.
- Re-check current `main` after concurrent work.
- Verify Production database state separately from a green build.
- For provider migrations, prove reasoner + embeddings + provenance + benchmark + learning continuity separately.
- Apply the Finish-to-completion rule above to every learning mechanism.

---

# Immediate next engineering priorities

1. **Finish PR #1328 end-to-end** under its explicit completion gates above.
2. From the owner benchmark dashboard, run the next **two** Production two-case private capability rotations after #1328 is live so their PASS/FAIL outcomes attach to exact turn IDs.
3. Verify the first covers `memory-governance` + `provenance` and the second covers `incident-reasoning` + the exact previously failed `learning-admission` case.
4. Require local COS reasoning, `local_model_invoked=true`, and `external_ai_invoked=false` for acceptance.
5. Run the controlled evidence-utilization benchmark until each important source kind reaches a meaningful sample; do not lower the source-kind verdict minimum merely to get a result faster.
6. Complete **Calibration Learning** using exact turn outcomes; keep recommendations shadow-only until held-out validation.
7. Complete **Failure Autopsy** and prove one real failure correction through independent retest.
8. Complete **Adaptive Retrieval / Agentic RAG** from outcome-correlated utilization, including threshold calibration and context-waste reduction.
9. Complete **Strategy-selection learning** for direct/Council/challenge/repair phases from like-for-like cohorts.
10. Complete **Tool-use sequence learning** from governed verified executions without widening authority.
11. Complete **Episodic → semantic compression** with corroboration, contradiction checks and reversible promotion.
12. Prove a current DeepInfra **consolidation/retention cycle** and update learning continuity evidence.
13. Expand bounded active learning/curiosity only after calibration/strategy layers can measure whether the extra practice helps.
14. Define SFT/LoRA readiness and dataset curation only after the above outcome-correlated layers are trustworthy.
15. Preserve BYOM/BYOA, provider neutrality, provenance, source authority, tenant isolation, approval boundaries, and model/provider swap survivability throughout.

---

# Recent sequence that matters

- PR #1311 — learning continuity watchdog.
- PR #1312 — derived strategy-profile learning.
- PR #1313 — benchmark feedback-loop curation.
- PR #1314 — benchmark review queue / failure-pattern hardening.
- PR #1316 — RunPod recovery / lifecycle hardening.
- PR #1317 — provider-neutral COS reasoner runtime.
- Dedicated DeepInfra Preview — Qwen + 768d BGE + 2/2 migration validation, external AI false.
- PR #1318 — clean permanent DeepInfra Production cutover.
- Production diagnostic — Qwen HTTP 200 `ready` in 244 ms + BGE 768/768.
- First Production held-out run — 1/2, exposed mixed embedding-space defect.
- PR #1320 — model-aware vector-space migration and re-embedding support.
- Production re-embed — 45/45 facts + 111/111 eligible corpus, zero failures/backlog.
- First post-reembed Production held-out run — 2/2 (`learning-admission`, `security-governance`), local COS, external AI false.
- PR #1321 — canonical managed-provider provenance on secondary fresh-evidence paths.
- PR #1323 — per-turn metacognitive phase telemetry.
- PR #1324 — evidence-utilization metrics + unknown-domain relevance repair.
- PR #1325 — source-kind utilization learning; merged as current `main` `aa1af8f1bfb35753c1eacf52d0ab0647840cde04`, Production READY.
- PR #1328 — outcome correlation + separate 36-case evidence-utilization benchmark; **active/in progress**, not yet Production at the time of this ONBOARD update.

Always query GitHub/Vercel/Supabase for current state instead of assuming this sequence has not advanced.

---

# Status language

Use precise actual states.

A plan is not execution.  
A queue row is not a sent message.  
An attempted publish is not a published asset.  
A branch is not Production.  
A green deployment is not Enterprise RC acceptance.  
Architecture support is not configured-runtime proof.  
A staged adapter is not certified.  
An episodic encounter is not knowledge.  
COS gate acceptance is not a verified real-world outcome.  
Runtime independence is not held-out certification.  
Cache reuse is not new reasoning competence.  
Equal embedding dimensions are not equal embedding spaces.  
Current-fact retrieval is not timeless memory.  
A managed open-model provider is not self-hosted merely because it uses the `LOCAL_AI_*` seam.  
`/v1/openai` compatibility does not mean OpenAI is the provider.  
Telemetry collection is not adaptive learning until a validated consumer can safely improve future behavior.  
A shadow recommendation is not a promoted production policy.  
A self-generated practice pass is not independent validation.

---

# Definition of success

The best external AI/data call is the one COS can safely avoid because SignalBoost already owns sufficient validated intelligence.

The best architecture lets models/providers be replaced without rewriting business intelligence, memory, learning, governance, or control logic.

For COS learning, success means validated experience measurably improves held-out performance, retains that improvement, generalizes to variants, lowers repeated external-teacher dependence, and preserves honest confidence/provenance.

For metacognitive learning, success additionally means COS can prove which retrieval, evidence source, tool sequence and explicit reasoning strategy improved outcomes for a problem class, can detect when those lessons stop working, and can roll back safely.

For the DeepInfra migration, success means COS moved from RunPod/Ollama to DeepInfra/Qwen while preserving COS-owned memory, embeddings, learning, governance, rollback control, and external-AI independence—and while making future model-space migrations explicit rather than silently mixing vectors.