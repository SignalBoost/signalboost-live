# ONBOARD.md

# SignalBoost Engineering Blueprint
## Cognitive Operating System (COS)

**Version:** 1.14  
**Updated:** 2026-08-21 UTC  
**Canonical scope:** current engineering / operations handoff; verify live state before acting  
**Current `main`:** `fd54b9c5873fc8742f5d0e89c398d3394d458d46`  
**Production domain:** `https://saas.signalboostapp.com`  
**COS primary reasoner:** DeepInfra managed open-model runtime → `Qwen/Qwen3.6-35B-A3B`  
**COS embedding model:** DeepInfra → `BAAI/bge-base-en-v1.5` → exactly 768 dimensions  
**RunPod lifecycle:** detached while the active reasoner points outside RunPod  
**COS learning:** durable COS-owned memory/knowledge/skills/outcomes; not provider model-weight fine-tuning  
**Enterprise RC:** evidence-based only; never infer from a green deployment

---

# Mandatory first-read rule

Every developer, AI coding agent, reviewer, operator, contractor, or infrastructure assistant working on this repository must:

1. Read this `ONBOARD.md` first.
2. Read `docs/HANDOFF-COS-DEEPINFRA-2026-08-20.md` for the migration history and rollback contract.
3. Scan current `main`, open PRs, Vercel Production state, and current Supabase migrations before changing anything.
4. Read the exact files related to the task.
5. Verify live behavior from code + runtime evidence before diagnosing or reporting status.
6. Never report current behavior from memory alone.

Historical detail remains in Git history and dated handoffs. This file intentionally prioritizes the current operational truth.

---

# Current Production architecture

```text
COS
→ provider-neutral LOCAL_AI_* seam
→ OpenAI-compatible transport protocol
→ DeepInfra
→ Qwen/Qwen3.6-35B-A3B
```

The `/v1/openai` path is a protocol-compatibility interface. OpenAI does **not** provide the model, compute, account, API key, or billing for this path.

Current embedding path:

```text
COS semantic retrieval / learning
→ embedding seam
→ DeepInfra
→ BAAI/bge-base-en-v1.5
→ 768 dimensions
→ model-aware pgvector stores
```

Do not describe DeepInfra as self-hosted, local compute, or OpenAI.

---

# PR #1318 — DeepInfra production cutover — MERGED

PR #1318 `Prepare COS DeepInfra production cutover` merged as:

`d3495d3727f7728510cae5d0781272a4b965e10f`

It permanently:

- removed provider-specific RunPod reasoner pins from `saas/vercel.json`;
- made runtime provider selection environment-driven;
- detached RunPod lifecycle when `LOCAL_AI_BASE_URL` points outside RunPod;
- bypassed RunPod wake/model-list readiness for managed non-RunPod providers;
- added `LOCAL_AI_REASONING_EFFORT` support;
- made a real chat completion authoritative for managed-provider health;
- preserved exact 768-dimension embedding validation;
- added managed-open-model provenance to the canonical COS reasoner path.

Temporary Preview-only migration endpoints were not merged.

---

# Production environment contract

Expected Production configuration:

```dotenv
LOCAL_AI_BASE_URL=https://api.deepinfra.com/v1/openai
LOCAL_AI_ALLOWED_HOSTS=api.deepinfra.com
LOCAL_AI_MODEL=Qwen/Qwen3.6-35B-A3B
LOCAL_AI_EMBEDDING_MODEL=BAAI/bge-base-en-v1.5
LOCAL_AI_REASONING_EFFORT=none
LOCAL_AI_MANAGED_PROVIDER=deepinfra
LOCAL_AI_API_KEY=<DeepInfra production secret>
```

Never commit or log the API key.

The first post-cutover Production diagnosis failed only because `LOCAL_AI_API_KEY` was missing from the Production environment. That run was a config failure, not a capability failure. After the Production key was added and redeployed, diagnosis passed.

---

# Production reasoner + embedding acceptance — PASS

Owner-only Production diagnostic after the key fix returned:

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

Production telemetry also recorded:

```text
[cos-runpod-detached]
selectedPodId: null
reason: LOCAL_AI_BASE_URL points outside RunPod; RunPod lifecycle control is disabled for this reasoner.
```

Therefore these gates are proven:

1. DeepInfra Production reasoner reachable — **PASS**.
2. Qwen final-text completion — **PASS**.
3. BGE embedding endpoint — **PASS**.
4. Exact 768 dimensions — **PASS**.
5. RunPod lifecycle detached from active reasoner — **PASS**.
6. Temporary unauthenticated Preview acceptance route absent from `main` — **PASS by merge design**.

---

# Production private benchmark after cutover — IMPORTANT FINDING

A real post-key-fix Production held-out run completed:

```text
run: 9a62fbb7-e2cd-408b-8f55-4eef37938e4d
attempted: 2
passed: 1
pass rate: 50%
external AI invoked: false on both cases
response source: local_cos_reasoning on both cases
```

Case results:

### incident-reasoning — PASS

- local COS reasoning used;
- external AI not used;
- latency ~106 s;
- mechanism / observable / falsifier quality met the rubric.

### learning-admission — FAIL

Prompt asked for the admission tier and durable-promotion condition for a document with relevance/confidence/source-confidence values in the lower admitted band.

Rubric expected:

```text
probationary
corroboration
durable
```

COS instead said the policy could not be determined from supplied context.

This was a **real capability failure**, not a provider connectivity failure.

---

# Root cause of the 50% run — MIXED EMBEDDING MODEL SPACES

The authoritative learning-admission doctrine already existed in Production Knowledge Graph facts, including:

```text
SignalBoost COS tiered learning admission
→ probationary_corroboration_promotion
→ probationary candidates require independent corroboration before durable promotion
```

Those facts were embedded before the DeepInfra migration using the previous embedding model.

Production then switched query embeddings to:

`BAAI/bge-base-en-v1.5`

Both old and new embedding models returned 768 dimensions, but **equal dimension does not mean equal vector space**. Comparing BGE query vectors against historical Nomic vectors made nearest-neighbor retrieval unreliable and caused COS to miss its own stored doctrine.

This is the critical migration lesson:

> Embedding model identity is part of the semantic schema. Dimension compatibility alone is insufficient.

---

# PR #1320 — embedding model-space repair — MERGED AND LIVE

PR #1320 `Fix COS embedding model-space migration` merged as:

`fd54b9c5873fc8742f5d0e89c398d3394d458d46`

Its Production deployment reached `READY` and owns `saas.signalboostapp.com`.

The repair:

- adds `embedding_model` identity to the durable vector stores;
- marks pre-versioned vectors `legacy:unversioned` instead of falsely claiming compatibility;
- filters Knowledge Graph, learned-corpus, and semantic-cache nearest-neighbor retrieval by the active embedding model;
- treats wrong-model vectors as re-embedding backlog, not merely rows with `embedding IS NULL`;
- partitions semantic answer cache policy by embedding model so stale vector-space cache entries become unreachable without destructive deletion;
- adds owner-only `/api/admin/cos-learning/reembed-current-space`;
- adds migration `20260821_cos_embedding_model_space.sql`;
- adds regression coverage proving an embedding-model-only change changes the semantic-cache partition.

The backward-compatible database migration was applied before the application merge so live Production never required a schema-breaking transition.

---

# BGE durable re-embedding — COMPLETE

Owner migration result after #1320 reached Production:

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

Direct Production DB verification after the run:

```text
cos_knowledge_facts total: 45
BGE-tagged facts: 45
legacy facts: 0
null-model facts: 0

cos_continuous_learning total: 152
eligible corpus rows: 111
BGE-tagged eligible rows: 111
eligible rows remaining in old/null space: 0
rejected/quarantined rows: 41
```

The two authoritative learning-admission facts are now explicitly tagged:

`BAAI/bge-base-en-v1.5`

and have non-null embeddings.

The remaining legacy/null corpus rows are rejected/quarantined rows and are excluded from governed semantic retrieval.

---

# Current acceptance status

Proven:

1. DeepInfra Production reasoner — **PASS**.
2. Qwen final completion — **PASS**.
3. BGE 768d embedding endpoint — **PASS**.
4. RunPod detachment — **PASS**.
5. Provider-neutral Production deployment — **PASS**.
6. Embedding-model schema/versioning — **PASS**.
7. Full current-model re-embedding of durable facts — **PASS**.
8. Full current-model re-embedding of eligible learned corpus — **PASS**.
9. Semantic cache isolated across embedding-model swaps — **PASS by policy/version design**.
10. Learning corpus survived provider migration — **PASS**.

Still pending before declaring the entire post-cutover acceptance matrix closed:

11. Re-run the Production private benchmark **after BGE re-embedding** and confirm the `learning-admission` case now retrieves its authoritative self-knowledge and passes without external AI.
12. Capture an ordinary Production COS answer provenance sample showing the canonical managed-provider label.
13. Fix two secondary fresh-evidence provenance paths that still hard-code `independent-local:`.

Do not hide or average away the historical 50% run. It is valuable evidence of a real migration bug that is now architecturally addressed.

---

# Live COS learning continuity

Latest verified Production learning snapshot around the cutover:

```text
cos_continuous_learning rows: 152
last retention: 2026-08-19T23:13:38.050675Z
retained documents last 7d: 77
distinct subjects last 7d: 36
new subjects last 7d: 21
learning gaps: 27 resolved, 6 failed, 0 pending/learning
```

Interpretation:

- provider migration did not erase COS-owned learned knowledge;
- 111 governed/eligible corpus rows are now fully re-embedded in the BGE space;
- continuity remains AMBER because the gap table has no open gaps, not because the corpus disappeared;
- six failed gaps still deserve review;
- observe a new post-cutover learning cycle to prove new retention/duplicate/rejection behavior under the managed reasoner.

COS learning is durable system memory/knowledge/skills/outcomes. It is not Qwen weight training and it is not owned by DeepInfra.

---

# Provenance semantics

Canonical labels:

```text
independent-local:<model>
managed-open-model:deepinfra:<model>
```

Expected current Production canonical label:

```text
managed-open-model:deepinfra:Qwen/Qwen3.6-35B-A3B
```

The canonical `cosReasoner.ts` path implements this distinction.

Known cleanup still required:

- `saas/lib/ai/cos/freshEvidenceLocalSynthesis.ts` directly constructs `independent-local:<model>`;
- `saas/app/api/cos-primary/baseRoute.ts` contains a fallback `localReasonerLabel()` that also hard-codes `independent-local:`.

These do not change the provider actually invoked, but they can mislabel provenance on secondary fresh-evidence paths. Fix both to use the canonical managed-provider-aware resolver and add a regression test.

Closed-model OpenAI/Anthropic/Gemini paths remain governed external fallback/teacher providers and must never masquerade as COS primary reasoning.

---

# Embedding doctrine

The COS vector schema remains 768-dimensional, but **dimension is only one part of compatibility**.

Any embedding model swap must account for all of:

1. vector dimension;
2. embedding model identity;
3. vector-space compatibility;
4. durable-store re-embedding;
5. semantic-cache partition/invalidation;
6. RPC/query filtering by model identity;
7. post-migration held-out retrieval/capability validation.

Do not pad/truncate vectors to fake compatibility, and do not assume two 768-dimensional models can share one semantic index.

Current governed embedding model:

`BAAI/bge-base-en-v1.5`

Observed BGE constraint: available input window is 512 tokens. Permanent code handles provider context-window overflow with bounded truncation/retry.

Follow-up optimization: reduce oversized-input handling toward a single bounded retry while preserving semantic integrity.

---

# Latency / Cognitive Council

DeepInfra health calls are fast (~244–404 ms), but full COS turns can be much slower because COS can perform multiple internal Qwen calls for Council advisory/challenge/rebuttal/repair phases.

Observed migration-era benchmark latency examples:

- ~37 s;
- ~54 s;
- ~106 s;
- ~202 s.

Do not diagnose a long COS turn as one slow DeepInfra call without reading model-call/Council telemetry.

Preserve Council quality; make optional phases adaptive to observed provider latency and the 300-second turn budget rather than disabling Council merely to improve benchmark time.

---

# RunPod historical state / rollback

RunPod is no longer the active Production reasoner while `LOCAL_AI_BASE_URL` points at DeepInfra.

Runtime rule:

- RunPod URL → RunPod lifecycle may apply;
- non-RunPod URL → RunPod lifecycle must remain detached.

Historical RunPod IDs/configuration are not proof of healthy rollback compute. Previous incidents included missing GPU allocation, CPU fallback, model-process termination, and host-capacity failure.

Rollback, if required, is environment-driven:

1. restore a verified healthy self-hosted/RunPod reasoner URL/model/key/host allowlist;
2. choose a compatible embedding path deliberately;
3. if embedding model changes, run the same model-space migration discipline described above;
4. redeploy;
5. verify reasoner + embeddings + RunPod lifecycle state;
6. run bounded private capability tests;
7. verify provenance and learning continuity.

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

Durable COS-owned assets include Enterprise Memory, Knowledge Graph facts, Continuous Learning corpus, procedural skills, episodic experiences, verified outcomes, curriculum/gap state, source/provenance knowledge, governance state, and answer/cache policy evidence.

A provider answer is not automatically truth. A cached answer is not new competence. A retained document is not mastery. A runtime health pass is not held-out certification.

The mature target remains roughly **85% independent pass rate on a broad separate held-out SignalBoost workload**. Never lower evidence/confidence gates or count self-generated practice as hidden holdout evidence merely to improve the number.

---

# Immediate priorities

1. Re-run the Production two-case private capability benchmark after the completed BGE re-embedding. Record the exact tracks, pass/fail, latency, response source, local-model flag, and external-AI flag.
2. Confirm `learning-admission` passes when it rotates into the batch; if it still fails, inspect retrieval funnel/similarity rather than changing the rubric.
3. Capture an ordinary Production COS answer and authoritative provenance showing `managed-open-model:deepinfra:Qwen/Qwen3.6-35B-A3B`.
4. Fix the two secondary fresh-evidence provenance labels that still hard-code `independent-local:` and add regression coverage.
5. Observe the next Production learning cycle under DeepInfra and confirm new retention or an explicit healthy duplicate/rejection outcome.
6. Review the six failed learning gaps; do not bulk-resolve gaps merely to make the watchdog green.
7. Optimize BGE oversized-input handling toward one bounded retry.
8. Make Cognitive Council optional phases more latency-aware while preserving quality.
9. Continue broad COS skill/knowledge expansion, verified-outcome learning, hidden held-out certification, and model/provider swap survivability testing.

---

# Security / secrets

- Never hard-code or expose provider secrets.
- Never print full API keys/tokens.
- Keep owner/admin routes server-gated.
- Keep cron routes protected.
- Remote inference must use HTTPS, authentication and exact-host allowlisting.
- Consequential actions remain behind governance/approval controls.
- Do not add unauthenticated Production validation endpoints merely to accelerate acceptance.

---

# Status language

Use precise states:

- green build ≠ Enterprise RC;
- configured model ≠ healthy model until runtime-proven;
- health probe ≠ capability benchmark;
- `attempted=0` benchmark ≠ 0% capability;
- equal vector dimensions ≠ compatible embedding spaces;
- cached answer ≠ new reasoning competence;
- retained document ≠ mastery;
- Preview evidence ≠ Production evidence;
- DeepInfra = managed open-model inference, not self-hosted and not OpenAI.

---

# Definition of success

SignalBoost succeeds when COS-owned memory, skills, evidence, governance, and verified outcomes survive model/provider replacement and measurably reduce repeated external dependence without weakening quality, safety, provenance, or tenant isolation.

The long-term proof is a trend: more problems completed with COS-owned intelligence and replaceable compute, fewer unnecessary teacher/provider calls, stronger verified outcomes, honest provenance/confidence, and stable capability across model/provider changes.
