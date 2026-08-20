# ONBOARD.md

# SignalBoost Engineering Blueprint
## Cognitive Operating System (COS)

**Version:** 1.12  
**Updated:** 2026-08-20  
**Canonical scope:** current engineering / operations handoff; verify live state before acting  
**Current `main` before PR #1318:** `6fd32c7f4149889b98b4726ac79b7b6435faaf50`  
**COS provider architecture:** provider-neutral `LOCAL_AI_*` seam; RunPod lifecycle detached automatically when the live reasoner is not RunPod  
**DeepInfra migration:** end-to-end Preview acceptance PASSED; Production cutover is gated on PR #1318 + Production Vercel environment switch + post-cutover acceptance  
**COS learning:** active; continuity snapshot is AMBER because all learning gaps are closed, not because retention stopped  
**Enterprise Release Candidate:** evidence-based only; never infer from a green deployment

> Historical v1.11 detail remains in Git history at the pre-cutover branch base and in the dated handoffs under `docs/`. This file intentionally prioritizes the current operational state so the next engineer or agent does not have to reconcile superseded runtime statements before acting.

---

# Mandatory first-read rule

Every developer, AI coding agent, reviewer, operator, contractor, or infrastructure assistant working on this repository must:

1. Read this `ONBOARD.md`.
2. Read `docs/HANDOFF-COS-DEEPINFRA-2026-08-20.md` for the current reasoner migration/cutover evidence and rollback contract.
3. Read the exact files related to the task.
4. Scan current `main` and open PRs before changing anything.
5. Verify implementation/runtime from code and live evidence before diagnosing or reporting status.
6. Never report behavior from memory alone.

Useful deeper references:

- `docs/HANDOFF-COS-INDEPENDENCE-TRAINING-2026-08-16.md`
- `docs/HANDOFF-COS-ACTIVE-LEARNING-2026-08-13.md`
- `docs/HANDOFF-2026-08-13.md`
- `docs/portables/self-healing-monitoring-current-state-20260813.md`
- `docs/ONBOARD-full.md`

`AGENTS.md` and `CLAUDE.md` are entry-point summaries. Current repository evidence and the newest dated handoff win over stale documentation.

---

# 2026-08-20 CURRENT COS RUNTIME OVERRIDE

The primary runtime objective is now a **provider-neutral COS-owned reasoning/learning system** that can use a managed open-model runtime without transferring ownership of memory, evidence, governance, skills, outcomes, or learning to that provider.

The durable asset is COS. The model/provider is replaceable compute.

```text
Observe
→ Recall / Retrieve
→ Reason
→ Act under governance
→ Verify
→ Measure Outcome
→ Learn / Retain / Weaken / Quarantine
→ Repeat
```

The current managed open-model migration target is:

```text
COS
→ LOCAL_AI_* OpenAI-compatible transport
→ DeepInfra
→ Qwen/Qwen3.6-35B-A3B
```

The word `openai` in DeepInfra's `/v1/openai` URL is a protocol-compatibility path. It does **not** mean OpenAI supplies the model, compute, account, API key, or billing.

Embedding path validated for the existing 768-dimensional COS schema:

```text
COS semantic retrieval / learning
→ LOCAL_AI embedding seam
→ DeepInfra
→ BAAI/bge-base-en-v1.5
→ 768 dimensions
→ existing pgvector schema
```

---

# DeepInfra Preview acceptance — PASSED

Dedicated test branch used for migration work:

`test/deepinfra-preview-20260820`

Do **not** merge that branch into `main`. It contains temporary Preview-only validation endpoints and temporary Preview provider pins.

Final hardened one-shot Preview validation returned:

- `ok: true`
- reasoner verdict: `ok`
- reasoner model: `Qwen/Qwen3.6-35B-A3B`
- reasoner base URL: `https://api.deepinfra.com/v1/openai`
- health response: `ready` in ~404 ms
- embedding dimensions: `768/768`
- capability benchmark: `2/2`, `100%`
- tracks: `provenance`, `memory-governance`
- `responseSource: local_cos_reasoning`
- `localModelInvoked: true`
- `externalAiInvoked: false`
- migration benchmark persistence: `false`

Earlier acceptance probes also proved:

- DeepInfra authentication works with the Preview secret;
- the reasoner returns HTTP 200 and final text;
- `BAAI/bge-base-en-v1.5` returns exactly 768 dimensions;
- the old `nomic-embed-text` model name is not available on DeepInfra and must not be used there.

Do not weaken the benchmark or provenance gates to improve scores. The 2/2 result is a small migration acceptance sample, not proof of mature ~85% workload independence.

---

# Permanent production-cutover PR

**PR #1318:** `Prepare COS DeepInfra production cutover`  
**Branch:** `feat/cos-deepinfra-production-cutover-20260820`

This is the clean production branch. It is intentionally separate from the temporary DeepInfra test branch.

Permanent changes in the cutover PR include:

- hard-detach RunPod lifecycle when `LOCAL_AI_BASE_URL` points outside RunPod, even if stale RunPod flags/credentials remain configured;
- bypass RunPod wake/model-list readiness polling for managed non-RunPod reasoners;
- optional `LOCAL_AI_REASONING_EFFORT` support for OpenAI-compatible model calls;
- provider-neutral reasoner diagnostics where successful completion is authoritative for managed providers;
- embedding-provider context-window handling while preserving exact 768-dimensional validation;
- removal of provider-specific RunPod reasoner pins from `saas/vercel.json`, so the runtime provider is selected by Vercel environment rather than source-control defaults;
- explicit managed-open-model provenance so DeepInfra is not mislabeled as self-hosted/local;
- this updated onboarding and the dated DeepInfra handoff.

Intentionally excluded from the permanent PR:

- temporary Preview-only probe endpoints;
- temporary Preview-only migration validation endpoint;
- hard-coded DeepInfra URL/model settings;
- API keys or other secrets.

A clean Vercel Preview for the initial permanent five-file runtime commit reached `READY`. After the final provenance/docs commits, re-check the newest PR #1318 Preview/CI before merge. Never assume the earlier green deployment covers later commits.

---

# Provenance semantics

The COS primary-reasoner seam may use either self-hosted/local open-model compute or an approved managed open-model runtime.

Expected reasoner labels after the permanent provenance change:

```text
independent-local:<model>
managed-open-model:deepinfra:<model>
```

For the DeepInfra cutover the target label is:

```text
managed-open-model:deepinfra:Qwen/Qwen3.6-35B-A3B
```

DeepInfra must never be described as self-hosted or as OpenAI.

Closed-model OpenAI/Anthropic/Gemini paths remain explicitly governed external fallback/teacher providers and must not masquerade as the COS primary reasoner.

---

# Production environment contract — DO NOT GUESS

After PR #1318 is merged and before declaring the migration complete, configure Production explicitly in Vercel:

```dotenv
LOCAL_AI_BASE_URL=https://api.deepinfra.com/v1/openai
LOCAL_AI_ALLOWED_HOSTS=api.deepinfra.com
LOCAL_AI_MODEL=Qwen/Qwen3.6-35B-A3B
LOCAL_AI_EMBEDDING_MODEL=BAAI/bge-base-en-v1.5
LOCAL_AI_REASONING_EFFORT=none
LOCAL_AI_MANAGED_PROVIDER=deepinfra
LOCAL_AI_API_KEY=<DeepInfra production secret>
```

`LOCAL_AI_API_KEY` must remain a Vercel/server-side secret. Never commit, print, paste into logs, or expose it.

The connected Vercel tooling used during this migration can inspect deployments and logs but cannot read or modify secret environment values. Therefore the Production secret/config switch requires the Vercel environment UI or another explicitly authorized secret-management path.

Do not change Production to DeepInfra until the permanent PR is green.

---

# Production cutover acceptance gate

The migration is **not complete** until all of the following are observed in Production after the environment switch:

1. PR #1318 merged.
2. Production deployment reaches `READY` on the merge commit.
3. Production reasoner diagnose/probe reaches DeepInfra and returns a valid final completion.
4. Production embedding health returns exactly 768 dimensions.
5. A bounded capability benchmark completes with COS-local reasoning and no external AI.
6. Normal request provenance reports `managed-open-model:deepinfra:Qwen/Qwen3.6-35B-A3B`.
7. Runtime telemetry shows RunPod lifecycle detached/false for the managed reasoner.
8. A real COS learning/retention cycle remains operational after cutover.
9. No temporary unauthenticated Preview validation route exists on `main`.

A green Vercel build alone is not enough.

---

# RunPod status / rollback

Historical RunPod pod id:

`yvj6e9zboi7ofo`

Last known pre-migration Production reasoner settings:

```dotenv
RUNPOD_POD_ID=yvj6e9zboi7ofo
LOCAL_AI_BASE_URL=https://yvj6e9zboi7ofo-11434.proxy.runpod.net/v1
LOCAL_AI_ALLOWED_HOSTS=yvj6e9zboi7ofo-11434.proxy.runpod.net
LOCAL_AI_MODEL=qwen2.5-coder:32b
```

During migration validation, the RunPod pod was observed stopped (`EXITED`, `running:false`), so it was not burning the ~$0.22/hr GPU rate at that observation point.

A historical configuration is **not** proof that RunPod can currently infer. Previous incidents included missing GPU device allocation, CPU fallback, model load failures, and host-capacity problems. Re-verify GPU/model health before relying on RunPod as rollback compute.

Rollback if DeepInfra Production cutover fails:

1. restore the prior Production `LOCAL_AI_*` RunPod values;
2. redeploy Production;
3. verify RunPod GPU/model health and authenticated inference;
4. verify COS reasoner + embeddings + bounded benchmark before calling rollback healthy.

Because PR #1318 removes provider-specific runtime pins from `saas/vercel.json`, rollback/provider switching is an environment operation rather than another source-code fork.

---

# Embedding doctrine

The COS learned-corpus / semantic retrieval schema is currently pinned to **768 dimensions**.

Canonical files:

- `saas/lib/ai/cos/embeddingEndpoint.ts`
- `saas/lib/ai/cos/localEmbeddings.ts`

Do not silently pad/truncate vectors to fake compatibility. A model swap must either return exactly 768 dimensions or be accompanied by a deliberate database/RPC migration and re-embedding plan.

DeepInfra candidate `BAAI/bge-base-en-v1.5` passed the 768-dimensional gate.

Observed provider constraint: BGE rejected an input at 513 tokens because its available input length was 512. Permanent code now handles provider context-window overflow with bounded truncation/retry while preserving the exact dimension check.

Follow-up optimization: the current bounded retry can still make several progressively shorter attempts for a long text. Improve it so the common oversized case usually requires at most one retry, without weakening semantic integrity or dimension validation.

---

# Latency / Cognitive Council finding

Migration correctness passed, but full COS turn latency remains an engineering concern.

Final hardened held-out case latency:

- provenance: ~36.988 s
- memory-governance: ~201.575 s

The ~201 s case was **not** one 201-second DeepInfra request. Vercel telemetry showed COS activated Cognitive Council for a repeated unresolved problem class and made several additional Qwen calls, including multiple calls in roughly the 30–65 second range.

Therefore:

- DeepInfra authentication/connectivity is not the long-tail root cause;
- Council/challenge/repair orchestration can dominate total turn time;
- do not disable Council only to make benchmark latency look better;
- make optional phases deadline-aware using measured/rolling provider latency rather than relying only on a static estimate;
- always reserve enough wall-clock time to return the best answer already available before the 300 s route ceiling.

Canonical budget file:

`saas/lib/ai/cos/cosTurnBudget.ts`

---

# COS learning continuity — current evidence

Latest migration validation read the production-backed continuity report as:

- status: `amber`
- corpus documents: 152
- documents retained in last 7 days: 77
- new subjects in last 7 days: 21
- silent days in last 7 days: 1
- last retention: ~24.5 hours before the check
- open gaps: 0
- finding: `no_open_gaps`

This is **not evidence that DeepInfra stopped learning**. The continuity policy intentionally marks zero open gaps amber because an all-resolved gap table can indicate over-aggressive/bulk closure rather than a healthy stream of unresolved questions.

Current interpretation:

- retention is happening;
- the corpus is expanding into new subjects;
- the learning-gap generation/resolution lifecycle needs inspection;
- preserve the amber watchdog until the cause of zero open gaps is understood.

Do not lower the watchdog standard merely to make the dashboard green.

---

# COS learning / independence doctrine

The underlying model is replaceable compute. **COS is the learner.**

Durable COS assets include:

- Enterprise Memory;
- Knowledge Graph;
- learned corpus / semantic memory;
- cognitive experiences;
- validated procedural skills;
- cognitive/metacognitive capability state;
- verified production outcomes;
- source/provenance knowledge;
- policy/governance;
- benchmark and feedback evidence.

A model response is not automatically learned knowledge.

A source document is not automatically learned knowledge.

A teacher answer is not automatically truth.

A successful training example is not held-out mastery.

Cache reuse is operational independence but not new reasoning competence.

The mature target remains approximately **85% independent pass rate on a separate held-out SignalBoost workload**, with higher numbers only if independent evidence supports them.

Never lower the 0.72 confidence/evidence gate, fabricate skills, or count self-generated practice as hidden-holdout evidence to inflate the score.

---

# Private capability benchmark

Owner dashboard:

`/dashboard/cos-capability-benchmark`

API:

`/api/admin/cos-capability-benchmark`

Rules:

- held-out cases are private and outside normal learning acquisition;
- exact/semantic cache reuse does not count as fresh capability;
- external AI cannot satisfy the local-COS reasoning requirement;
- each normal web run is bounded to at most two cases;
- infrastructure/unavailable-reasoner runs must not be recorded as capability failures;
- benchmark history and migration acceptance probes are separate evidence classes.

The temporary migration validator intentionally used `persisted:false` so its test did not pollute Production benchmark history.

---

# Enterprise Memory / Semantic Cache doctrine

Do not conflate these systems.

**Enterprise Memory** is durable, authorized organization-scoped operational knowledge: facts, decisions, history, and reusable enterprise intelligence. It is not an answer cache.

**Semantic Cache** is policy-versioned, age-bounded answer reuse when a new request is sufficiently similar to a previously generated answer. Embeddings are the retrieval index, not the cached knowledge itself.

Organization/user-scoped context must never be reused through an unscoped cache entry.

Authoritative evidence funnel:

```text
retrieved → relevant → selected → injected → cited
```

A subsystem counts as `USED` only when it materially contributed to the answer; retrieval/injection alone is not use.

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
→ COS primary open-model reasoning seam
→ confidence/evidence gate
→ bounded research or replaceable external teacher/provider only when justified and permitted
→ verification
→ learning / episodic memory / skill practice / ROI telemetry
```

Primary enterprise answer path:

`saas/lib/ai/cos/cosFirstAnswerEnterprise.ts`

Primary reasoner seam:

- `saas/lib/ai/cos/cosReasoner.ts`
- `saas/lib/ai/local-inference.ts`

---

# Provider neutrality / BYOM / BYOA

Required properties:

- no mandatory Qwen, RunPod, DeepInfra, OpenAI, Anthropic, Gemini, or other provider dependency;
- buyer-owned credentials/compute where desired;
- replaceable model/agent adapters;
- models/providers are not governance authorities;
- COS-owned memory, skills, provenance, outcome history, policy, and learning survive model/provider swaps.

DeepInfra is the current managed open-model candidate for SignalBoost development/runtime economics. It is not part of COS product identity.

Reference:

- `docs/portables/cos-byom-byoa-enterprise.md`
- `saas/lib/release-candidate/cos-enterprise-ai.ts`

---

# Self-Healing Supervisor — preserve governance

Self-Healing remains proactive and governed.

Canonical loop:

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

Automatic routine repair never means arbitrary mutation. Unknown/consequential/destructive/financial/security actions remain governed and approval-gated.

Current detailed handoff:

`docs/portables/self-healing-monitoring-current-state-20260813.md`

---

# Marketing & Sales state

Core Marketing & Sales architecture is substantially complete and must remain integrated with COS rather than becoming a provider-owned silo.

Major platform layers include:

- Enterprise Memory / Knowledge Graph / Continuous Learning;
- Prospect Intelligence;
- Business Intelligence Corpus;
- Communication Hub;
- CRM integration framework and production adapters;
- campaign/outreach queues;
- Revenue Intelligence;
- Universal Adapter seams;
- approvals / audit / telemetry / cost governance;
- localization guardrails.

The 5,000-company Business Intelligence Corpus remains a data-population/coverage target, not an architectural reason to bypass COS or use external providers first.

---

# Security / secrets

Non-negotiable:

- never hard-code or expose provider secrets;
- never print full API keys/tokens;
- never expose `/workspace/cos-api-key`;
- use approved Vault/environment/server-side storage boundaries;
- preserve tenant/org scoping and RLS/service-role assumptions;
- keep owner/admin routes server-gated;
- keep cron routes `CRON_SECRET` protected;
- remote inference must use HTTPS, authentication, and exact-host allowlisting;
- do not create temporary unauthenticated Production triggers for convenience;
- temporary Preview migration endpoints must never land on `main`.

---

# Build / test / deploy rules

- Read files before changing them.
- Prefer coherent batches of related changes.
- Preserve existing behavior unless the task requires change.
- Run/observe relevant typecheck, build, tests, CI, and live acceptance before calling a batch successful.
- Never claim CI/build/deployment passed unless it actually did.
- Never call a branch commit Production.
- Never call a green Vercel deployment Enterprise RC acceptance.
- Re-check current `main` after concurrent work.
- Production database state must be verified separately from a green build.
- For provider migrations, prove reasoner + embeddings + provenance + benchmark + learning continuity separately.

---

# Immediate next engineering priorities

1. Finish PR #1318 validation after the provenance/docs commits; merge only when the newest clean Preview/CI is green.
2. Configure the Production DeepInfra `LOCAL_AI_*` environment values and secret after merge.
3. Run Production reasoner/embedding/provenance/benchmark acceptance before declaring cutover complete.
4. Verify a real post-cutover COS learning/retention cycle.
5. Improve Cognitive Council / optional-phase budget decisions using measured provider latency so the system cannot spend most of the 300 s turn budget on advisory/challenge/repair work.
6. Reduce BGE over-window handling to a predictable single truncation/retry in the common case.
7. Investigate zero open learning gaps while preserving the amber continuity watchdog.
8. Remove the temporary DeepInfra Preview test branch/routes after Production acceptance.
9. Continue the broader COS continuous-learning curriculum and held-out independence program across cyber defense, software engineering/computer science, AI systems/safety, ML/data, business, marketing, sales, cloud, networking, SRE, Postgres, and other already-governed tracks.
10. Preserve BYOM/BYOA, provenance, source authority, tenant isolation, approval boundaries, and Enterprise RC evidence requirements throughout all future learning/runtime changes.

---

# Recent sequence that matters for this cutover

- PR #1311 — learning continuity watchdog.
- PR #1312 — derived strategy-profile learning.
- PR #1313 — benchmark feedback-loop curation.
- PR #1314 — benchmark review queue / failure-pattern hardening.
- PR #1316 — RunPod recovery / lifecycle hardening.
- PR #1317 — provider-neutral COS reasoner runtime; merge `6fd32c7f4149889b98b4726ac79b7b6435faaf50`.
- Dedicated DeepInfra Preview migration then proved Qwen reasoner + 768d BGE embeddings + 2/2 held-out cases with no external AI.
- PR #1318 — clean permanent production-cutover runtime + provider-neutral deployment config + managed-open-model provenance + current handoff/docs.

Always query GitHub/Vercel for the current PR/merge/deployment state instead of assuming this sequence has not advanced.

---

# Status language

Use precise actual states.

A plan is not execution.  
A queue row is not a sent email.  
An attempted publish is not a published asset.  
A branch is not Production.  
A green deployment is not Enterprise RC acceptance.  
Architecture support is not configured-runtime proof.  
A staged adapter is not certified.  
An episodic encounter is not knowledge.  
COS gate acceptance is not a verified real-world outcome.  
Runtime independence is not held-out certification.  
Cache reuse is not new reasoning competence.  
Current-fact retrieval is not timeless memory.  
A managed open-model provider is not self-hosted merely because it uses the `LOCAL_AI_*` seam.  
`/v1/openai` compatibility does not mean OpenAI is the provider.

---

# Definition of success

The best external AI/data call is the one COS can safely avoid because SignalBoost already owns sufficient validated intelligence.

The best architecture lets models/providers be replaced without rewriting business intelligence, memory, learning, governance, or control logic.

For COS learning, success means validated experience measurably improves held-out performance, retains that improvement, generalizes to variants, lowers repeated external-teacher dependence, and preserves honest confidence/provenance.

For this runtime migration, success means COS can move from RunPod/Ollama to DeepInfra/Qwen while keeping its memory, embeddings, learning, benchmark behavior, provenance, governance, rollback path, and external-AI independence intact.
