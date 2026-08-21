# ONBOARD.md

# SignalBoost Engineering Blueprint
## Cognitive Operating System (COS)

**Version:** 1.13  
**Updated:** 2026-08-20 / 2026-08-21 UTC  
**Canonical scope:** current engineering and operations handoff; verify live state before acting  
**Current `main`:** `d3495d3727f7728510cae5d0781272a4b965e10f` — PR #1318 merged  
**Current Production deployment:** `dpl_GtaKzD7RJBEkTSSYLBjodgp4dXd7` — `READY`  
**Production domain:** `https://saas.signalboostapp.com`  
**COS primary reasoner target:** DeepInfra managed open-model runtime, `Qwen/Qwen3.6-35B-A3B`  
**COS embedding model:** `BAAI/bge-base-en-v1.5`, validated at exactly 768 dimensions  
**RunPod lifecycle:** detached for the active DeepInfra reasoner  
**COS learning:** active; current continuity signal remains AMBER because there are no open learning gaps, not because retention stopped  
**Enterprise Release Candidate:** evidence-based only; never infer from a green deployment

---

# Mandatory first-read rule

Every developer, AI coding agent, reviewer, operator, contractor, or infrastructure assistant working on this repository must:

1. Read this `ONBOARD.md` first.
2. Read `docs/HANDOFF-COS-DEEPINFRA-2026-08-20.md` for the detailed reasoner migration history and rollback contract.
3. Scan current `main` and open PRs before changing anything.
4. Read the exact files related to the task.
5. Verify implementation/runtime from code and live evidence before diagnosing or reporting status.
6. Never report behavior from memory alone.

Useful deeper references:

- `docs/HANDOFF-COS-INDEPENDENCE-TRAINING-2026-08-16.md`
- `docs/HANDOFF-COS-ACTIVE-LEARNING-2026-08-13.md`
- `docs/HANDOFF-2026-08-13.md`
- `docs/portables/self-healing-monitoring-current-state-20260813.md`
- `docs/ONBOARD-full.md`

Current repository evidence and the newest dated handoff override stale documentation.

---

# 2026-08-20/21 CURRENT COS RUNTIME OVERRIDE

COS is the durable learner and governance layer. Models/providers are replaceable compute.

Current production chain:

```text
COS
→ provider-neutral LOCAL_AI_* seam
→ OpenAI-compatible transport protocol
→ DeepInfra
→ Qwen/Qwen3.6-35B-A3B
```

The `/v1/openai` segment in DeepInfra's base URL means **OpenAI-compatible API format only**. OpenAI does not supply the model, compute, account, API key, or billing for this path.

Current embedding chain:

```text
COS semantic retrieval / learning
→ embedding seam
→ DeepInfra
→ BAAI/bge-base-en-v1.5
→ 768 dimensions
→ existing pgvector schema
```

Do not describe DeepInfra as self-hosted, local compute, or OpenAI.

---

# Production DeepInfra cutover — MERGED AND LIVE

PR #1318, `Prepare COS DeepInfra production cutover`, merged into `main` as:

`d3495d3727f7728510cae5d0781272a4b965e10f`

The merge removed provider-specific RunPod reasoner pins from `saas/vercel.json`. Runtime provider selection now comes from environment configuration instead of source-control defaults.

The exact merge deployment:

`dpl_GtaKzD7RJBEkTSSYLBjodgp4dXd7`

reached `READY` and owns `saas.signalboostapp.com`.

Permanent runtime changes now on `main` include:

- RunPod lifecycle hard-detaches whenever `LOCAL_AI_BASE_URL` points outside RunPod, even if stale RunPod IDs/credentials remain configured;
- managed non-RunPod reasoners bypass RunPod wake/model-list readiness polling;
- `LOCAL_AI_REASONING_EFFORT` support for OpenAI-compatible reasoner calls;
- provider-neutral reasoner diagnostics, where a successful chat completion is authoritative for managed providers;
- embedding-provider context-window handling with exact 768-dimension validation preserved;
- managed-open-model provenance in the canonical COS reasoner path;
- provider-specific reasoner values removed from `saas/vercel.json`.

Temporary Preview-only acceptance endpoints were **not** merged into `main`.

---

# Production environment contract

Production is expected to be configured in Vercel as:

```dotenv
LOCAL_AI_BASE_URL=https://api.deepinfra.com/v1/openai
LOCAL_AI_ALLOWED_HOSTS=api.deepinfra.com
LOCAL_AI_MODEL=Qwen/Qwen3.6-35B-A3B
LOCAL_AI_EMBEDDING_MODEL=BAAI/bge-base-en-v1.5
LOCAL_AI_REASONING_EFFORT=none
LOCAL_AI_MANAGED_PROVIDER=deepinfra
LOCAL_AI_API_KEY=<DeepInfra production secret>
```

`LOCAL_AI_API_KEY` is a server-side secret. Never commit, print, log, or expose it.

The first post-merge Production diagnosis failed because `LOCAL_AI_API_KEY` was not scoped/configured for Production. That run returned `config_error` and **must not** be interpreted as model or COS capability failure. After the Production key was added and redeployed, the same diagnostic passed.

---

# Production acceptance evidence — PASSED SO FAR

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

The diagnostic intentionally skipped `/models` for the managed provider and used the real completion as the authoritative health check.

Production runtime telemetry also recorded:

```text
[cos-runpod-detached]
selectedPodId: null
reason: LOCAL_AI_BASE_URL points outside RunPod; RunPod lifecycle control is disabled for this reasoner.
```

Therefore the following production gates are proven:

1. PR #1318 merged — **PASS**.
2. Exact merge deployment `READY` — **PASS**.
3. Production reasoner reaches DeepInfra and returns final text — **PASS**.
4. Production embedding health returns exactly 768 dimensions — **PASS**.
5. RunPod lifecycle detached from the active reasoner — **PASS**.
6. Temporary unauthenticated Preview acceptance route absent from `main` — **PASS by merge design**.

Still pending at this exact handoff:

7. A fresh **Production private held-out capability benchmark after the API-key fix**. Historical failed runs with `attempted=0` are runtime/config failures, not capability scores and must not be counted as 0% competence.
8. A live ordinary-turn provenance sample showing `managed-open-model:deepinfra:Qwen/Qwen3.6-35B-A3B` from the normal COS answer path.

Do not claim the full post-cutover acceptance matrix complete until those two observations are captured.

---

# Preview migration acceptance — historical proof

Dedicated migration branch:

`test/deepinfra-preview-20260820`

Do **not** merge that branch. It contains temporary Preview-only acceptance code and temporary provider pins.

Final hardened Preview validation proved:

- reasoner model `Qwen/Qwen3.6-35B-A3B`;
- DeepInfra base URL `https://api.deepinfra.com/v1/openai`;
- health completion `ready`;
- `BAAI/bge-base-en-v1.5` exactly 768 dimensions;
- held-out acceptance batch 2/2, 100%;
- `responseSource: local_cos_reasoning`;
- `localModelInvoked: true`;
- `externalAiInvoked: false`;
- migration benchmark persistence disabled.

That 2/2 sample proves migration compatibility, not mature workload-wide independence.

---

# Live COS learning continuity after cutover

Direct Production database snapshot after the DeepInfra reasoner became healthy:

```text
cos_continuous_learning rows: 152
last retention: 2026-08-19T23:13:38.050675Z
hours since last retention at query time: ~25.4
retained documents last 7d: 77
distinct subjects last 7d: 36
new subjects last 7d: 21
learning gaps: 27 resolved, 6 failed, 0 pending/learning
```

Interpretation:

- The migration did **not** erase or disconnect COS-owned learned knowledge.
- Learning volume is substantial over the last 7 days.
- The continuity watchdog remains AMBER because there are zero open gaps; its policy intentionally treats an all-closed gap table as suspicious.
- `failed` gaps exist and should be reviewed separately; zero `pending/learning` does not mean COS has nothing left to learn.
- The next scheduled/explicit learning cycle should be observed under DeepInfra to prove new post-cutover retention, not merely survival of pre-cutover corpus rows.

COS learning is durable system memory/knowledge/skills/outcomes. It is **not** model-weight fine-tuning on DeepInfra.

---

# Provenance semantics

Canonical primary reasoner labels are:

```text
independent-local:<model>
managed-open-model:deepinfra:<model>
```

For the current Production reasoner the expected canonical label is:

```text
managed-open-model:deepinfra:Qwen/Qwen3.6-35B-A3B
```

The main `cosReasoner.ts` path implements this distinction.

Known cleanup found during the post-cutover provenance sweep:

- `saas/lib/ai/cos/freshEvidenceLocalSynthesis.ts` still constructs `independent-local:<model>` directly for the fresh-live-evidence local synthesis path;
- `saas/app/api/cos-primary/baseRoute.ts` also has a fallback `localReasonerLabel()` that hard-codes `independent-local:` before/when fresh local synthesis declines.

This does **not** change which provider is actually invoked, but it can mislabel provenance on that secondary fresh-evidence path. Fix both to use the canonical reasoner-label resolver. Until that fix is merged and production-proven, do not claim every COS path has perfect managed-provider labeling.

Closed-model OpenAI/Anthropic/Gemini routes remain governed external fallback/teacher providers and must never masquerade as the COS primary reasoner.

---

# Embedding doctrine

The COS semantic/learned-corpus schema is pinned to **768 dimensions**.

Canonical files:

- `saas/lib/ai/cos/embeddingEndpoint.ts`
- `saas/lib/ai/cos/localEmbeddings.ts`

Do not pad/truncate vectors merely to fake compatibility. A model change must either return exactly 768 dimensions or include a deliberate database/RPC migration and full re-embedding plan.

`BAAI/bge-base-en-v1.5` passed the exact 768-dimension gate.

Observed provider constraint: BGE's available input window is 512 tokens. Permanent code handles provider context-window overflow with bounded truncation/retry.

Follow-up optimization: the current retry may make several progressively shorter embedding attempts for a long input. Optimize toward one bounded retry while preserving semantic integrity and exact dimension validation.

---

# Latency / Cognitive Council finding

DeepInfra connectivity is fast for the health probe (~244–404 ms), but full COS turns can be much slower because COS may invoke multiple model calls for Council advisory/challenge/rebuttal/repair phases.

Preview evidence showed:

- one provenance benchmark case around 37 seconds;
- one memory-governance case around 202 seconds;
- runtime logs showed several individual Qwen calls plus a Cognitive Council escalation.

Do not diagnose a long COS turn as a single slow DeepInfra request without reading the model-call telemetry.

Follow-up: make Council/optional reasoning phases more adaptive to observed managed-provider latency and the total 300-second turn budget. Preserve quality; do not disable Council merely to improve benchmark time.

---

# RunPod historical state / rollback

Historical RunPod pod IDs have changed during migration work. Do not assume an old ID is current or usable merely because it exists in an environment variable or log.

The important runtime rule is now provider-driven:

- if `LOCAL_AI_BASE_URL` is RunPod, RunPod lifecycle logic may apply;
- if it points outside RunPod, lifecycle control must remain detached.

A historical RunPod configuration is not proof that the pod currently has a GPU, can load the model, or can infer. Previous incidents included missing GPU device allocation, CPU fallback, model-load termination, and host-capacity failures.

Rollback from DeepInfra, if ever required, is an environment operation:

1. restore a verified healthy self-hosted/RunPod `LOCAL_AI_BASE_URL`, host allowlist, model and key;
2. redeploy;
3. verify GPU/model health and authenticated inference;
4. verify exact 768-dimensional embeddings;
5. run the bounded private benchmark;
6. verify provenance and learning continuity before calling rollback healthy.

Because source-controlled provider pins were removed in #1318, provider switching no longer requires a source-code fork.

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

The underlying model is replaceable compute. **COS is the learner.**

Durable COS-owned assets include:

- Enterprise Memory;
- Knowledge Graph facts;
- Continuous Learning corpus;
- procedural cognitive skills;
- cognitive experiences/episodic memory;
- verified outcomes;
- curriculum/gap state;
- source/provenance knowledge;
- policy/governance state;
- answer/cache policy and reuse evidence.

A provider answer is not automatically truth. A cached answer is not new competence. A runtime pass is not held-out certification. A learning row is not mastery.

The mature target remains roughly **85% independent pass rate on a broad separate held-out SignalBoost workload**. Never lower evidence/confidence gates or count self-generated practice as hidden holdout evidence to improve the number.

---

# Execution order

```text
Request / Goal
→ deterministic business rules
→ exact / semantic / durable reuse
→ Enterprise Memory
→ Knowledge Graph
→ Continuous Learning / bounded context
→ validated procedural skills
→ COS primary reasoner
→ confidence/evidence gate
→ bounded live research or approved external teacher/fallback only when justified
→ verification
→ learning / episodic memory / skill practice / ROI telemetry
```

Providers are replaceable edges around a COS-owned core.

---

# Immediate priorities after DeepInfra cutover

1. Run one new two-case **Production private capability benchmark** after the Production API key fix; record pass/fail and latencies. Do not count `attempted=0` config/runtime failures as competence failures.
2. Capture an ordinary Production COS answer and its authoritative provenance; confirm the main path reports `managed-open-model:deepinfra:Qwen/Qwen3.6-35B-A3B`.
3. Fix the two secondary fresh-evidence provenance labels that still hard-code `independent-local:` and add a regression test covering managed-provider fresh synthesis/failure provenance.
4. Observe the next Production learning cycle under DeepInfra and confirm at least one new retention or an explicit healthy duplicate/saturation outcome. Separate a dead pipeline from a cycle that ran and retained nothing because all candidates were duplicates/rejected.
5. Investigate why the learning-gap table currently has no pending/learning gaps while 6 are failed; do not bulk-resolve gaps merely to make the watchdog green.
6. Optimize BGE oversized-input handling toward one bounded retry.
7. Make Cognitive Council optional phases more latency-aware under managed inference while preserving answer quality and the 300-second turn budget.
8. Continue broad COS learning/skill expansion, verified-outcome learning, hidden held-out certification, and model-swap survivability testing.
9. Preserve BYOM/BYOA, provenance, source authority, tenant isolation, approval boundaries, and evidence-based Enterprise RC requirements.

---

# Security / secrets

- Never hard-code or expose provider secrets.
- Never print full API keys/tokens.
- Keep owner/admin routes server-gated.
- Keep cron routes protected.
- Remote inference must use HTTPS, authentication and exact-host allowlisting.
- Consequential actions remain behind applicable governance/approval controls.
- Do not add unauthenticated Production validation endpoints merely to accelerate acceptance.

---

# Status language

Use precise states:

- a green build is not Enterprise RC;
- a branch is not Production;
- a configured model is not a healthy model until runtime-proven;
- a provider health probe is not a capability benchmark;
- an `attempted=0` benchmark is a blocked run, not 0% capability;
- a cached answer is not new reasoning competence;
- an episodic encounter is not validated knowledge;
- a retained document is not mastery;
- Preview evidence is not Production evidence;
- DeepInfra is managed open-model inference, not self-hosted and not OpenAI.

---

# Definition of success

SignalBoost succeeds when COS-owned memory, skills, evidence, governance and verified outcomes survive model/provider replacement and measurably reduce repeated external dependence without weakening quality or safety.

The long-term proof is a trend: more problems completed with COS-owned intelligence and replaceable compute, fewer unnecessary teacher/provider calls, stronger verified real-world outcomes, honest provenance/confidence, and stable capability when the underlying model/provider changes.
