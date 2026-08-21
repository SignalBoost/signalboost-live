# ONBOARD.md

# SignalBoost Engineering Blueprint
## Cognitive Operating System (COS)

**Version:** 1.15  
**Updated:** 2026-08-21 UTC  
**Canonical scope:** current engineering / operations handoff; verify live state before acting  
**Current `main`:** `88eec94e4880a263f25c6e05bbfdc526fe6f8c79`  
**Production domain:** `https://saas.signalboostapp.com`  
**Production deployment:** READY on the current `main` above  
**COS primary reasoner:** DeepInfra managed open-model runtime → `Qwen/Qwen3.6-35B-A3B`  
**COS embedding model:** DeepInfra → `BAAI/bge-base-en-v1.5` → exactly 768 dimensions  
**RunPod lifecycle:** detached while the active reasoner points outside RunPod  
**COS learning:** durable COS-owned memory/knowledge/skills/outcomes; not provider model-weight fine-tuning  
**Enterprise Release Candidate:** evidence-based only; never infer from a green deployment

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

PR #1321 `Fix managed-provider provenance labels on fresh COS paths` merged as current `main`:

`88eec94e4880a263f25c6e05bbfdc526fe6f8c79`

Its exact Vercel Production deployment reached `READY` and `saas.signalboostapp.com` is attached to it.

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

The exact #1321 head passed:

- SaaS CI;
- TypeScript;
- Production build;
- unit tests;
- COS embedding transport compatibility;
- COS cache/provenance policy;
- COS capability benchmark contract;
- COS core curriculum / continuous learning checks;
- COS Council deterministic regression;
- Audit Remediation Regression;
- Playwright;
- QA Scan;
- Pipeline Integrity;
- Repo Targeting QA;
- V1 Red Diagnostics;
- Vercel Preview.

During #1321 CI, a stale RunPod test fixture was corrected from an invalid fake host (`example-pod-11434...`) to a valid RunPod proxy shape (`examplepod-11434...`). Production runtime behavior was not weakened.

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

Code-level managed-provider labeling is now complete for the known primary and fresh-evidence paths. A normal owner Production COS turn should still be captured as live runtime evidence before calling the provenance observation gate fully closed.

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

---

# Immediate next engineering priorities

1. From the owner benchmark dashboard, run the next **two** Production two-case benchmark rotations.
2. Verify the first covers `memory-governance` + `provenance` and the second covers `incident-reasoning` + the exact previously failed `learning-admission` case.
3. Require local COS reasoning, `local_model_invoked=true`, and `external_ai_invoked=false` for acceptance.
4. Capture a normal Production COS answer/provenance event showing `managed-open-model:deepinfra:Qwen/Qwen3.6-35B-A3B` now that #1321 is live.
5. Observe the next Production learning cycle under DeepInfra and verify new retention or an explicit healthy duplicate/rejection outcome.
6. Review the zero-open-gap learning state and the historical failed gaps without weakening the continuity watchdog.
7. Optimize BGE oversized-input handling toward a predictable single bounded retry.
8. Make Cognitive Council optional phases more latency-aware while preserving quality and governance.
9. Continue broad COS knowledge/skill development and hidden held-out certification across cyber defense, software engineering/computer science, AI systems/safety, ML/data, business, marketing, sales, cloud, networking, SRE, Postgres, and other governed tracks.
10. Preserve BYOM/BYOA, provider neutrality, provenance, source authority, tenant isolation, approval boundaries, and model/provider swap survivability.

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
- PR #1321 — canonical managed-provider provenance on secondary fresh-evidence paths; merged as current `main` and Production READY.

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

---

# Definition of success

The best external AI/data call is the one COS can safely avoid because SignalBoost already owns sufficient validated intelligence.

The best architecture lets models/providers be replaced without rewriting business intelligence, memory, learning, governance, or control logic.

For COS learning, success means validated experience measurably improves held-out performance, retains that improvement, generalizes to variants, lowers repeated external-teacher dependence, and preserves honest confidence/provenance.

For the DeepInfra migration, success means COS moved from RunPod/Ollama to DeepInfra/Qwen while preserving COS-owned memory, embeddings, learning, governance, rollback control, and external-AI independence—and while making future model-space migrations explicit rather than silently mixing vectors.