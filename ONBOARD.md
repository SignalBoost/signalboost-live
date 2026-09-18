# ONBOARD.md

# iTMounts Engineering Blueprint

**Updated:** 2026-09-17  
**Canonical repository:** `SignalBoost/signalboost-live`  
**Canonical public product:** **iTMounts**  
**Canonical public origin:** `https://itmounts.com`

> This is the mandatory current-state engineering handoff. Read it before changing the repository and re-query live GitHub, Vercel, Supabase, and runtime configuration whenever the task depends on present state.
>
> The exact previous root handoff is preserved byte-for-byte at `docs/ONBOARD-SNAPSHOT-2026-09-15-PRE-DISTILLATION-PORTABLE.md`. That snapshot and Git history preserve all prior operational detail. Nothing in this compact current-state root silently revokes an earlier security, authorization, evidence, tenant-isolation, learning, or Production-truth boundary unless a newer clause explicitly supersedes it. `SKILLS.md` remains the canonical COS University / specialist-education companion.

---

## Deferred post-University initiative — Agent Distillation & Training Portable — 2026-09-15

Owner direction: **finish the COS University project first**. After University reaches its accepted completion target, begin a separate commercial portable that packages the distillation/training capabilities proven here for enterprise buyers.

This section is a deferred product roadmap. It is **not** authorization to divert current University work, create new paid provider jobs outside existing University approvals, or claim the portable already exists.

### Product objective

Create a completely plug-and-play, provider- and framework-agnostic **Agent Distillation & Training Portable**. A buyer should be able to connect an existing AI model, agent, knowledge source, or execution environment; allow the portable to discover supported capabilities; normalize them behind iTMounts contracts; distill/train; independently evaluate; deploy; monitor; and roll back without custom integration work in the normal path.

The portable must support three modes:

1. **Model distillation** — a teacher model produces governed training material for a smaller student model; the student is fine-tuned, independently evaluated, and deployed only after passing the buyer's gates.
2. **Agent distillation** — approved successful agent behavior is converted into reusable skills, tool/workflow policies, RAG material, memory structures, examples, and evaluation suites. Fine-tuning is optional. Do not attempt to extract or reproduce hidden chain-of-thought; retain only authorized observable inputs, outputs, tool interactions, outcomes, and buyer-approved artifacts.
3. **Hybrid distillation** — combine approved agent behavior, domain knowledge, tool traces/outcomes, and model training so the buyer can produce a smaller/private/owned model-plus-agent package.

### Plug-and-play connector rule

Provider-specific integrations are **adapters, never product dependencies**. Hugging Face and RunPod are initial proof adapters only; the commercial portable must remain operable without either one.

The connector layer must support, where the connected system exposes the capability:

- native **MCP** client/server discovery and invocation;
- REST, OpenAPI, GraphQL, webhooks, and OpenAI-compatible APIs;
- a **Universal Adapter** for configurable authentication, schemas, request/response mapping, and capability binding when no native connector exists;
- native/SDK adapters for model and compute providers such as Hugging Face, RunPod, OpenAI, Anthropic, Gemini/Google, AWS, Azure, GCP, and future providers;
- local/private inference and training targets such as Ollama, vLLM, Kubernetes, buyer GPUs, on-premises infrastructure, and private cloud;
- agent frameworks including LangGraph, LangChain, and buyer-owned/custom agents;
- enterprise data sources, databases, object stores, vector stores, document systems, CRM/support systems, repositories, and other governed knowledge sources.

Every connector must expose a normalized capability manifest. At minimum, the portable should determine whether the connection can **infer, generate approved training material, fine-tune/train, expose approved traces/outcomes, store/read datasets, run evaluation, deploy, monitor, and roll back**.

The UI and automation must expose **only capabilities that are actually available and verified for that connection**.

Normal buyer onboarding should require no source-code editing and no manually written adapter. Target experience:

```text
Connect Agent/Model
-> Select Goal
-> Prepare & Protect Data
-> Distill/Train
-> Independently Evaluate
-> Deploy
-> Monitor
-> Repeat
```

### Enterprise/governance requirements

The portable inherits iTMounts portable rules:

- buyer-owned credentials and infrastructure where possible;
- tenant isolation;
- provenance, licensing, and privacy filtering;
- bounded provider spend;
- explicit authorization for consequential actions;
- deterministic authority boundaries;
- independent evaluation;
- safety, unseen-transfer, and retention gates where applicable;
- rollback evidence;
- audit logging;
- fail-closed provider substitution;
- truthful Production evidence.

Learning quality, model intelligence, or an agent's reasoning may never expand operational authority.

The portable must use buyer-selected providers interchangeably and must never silently route work to another hosted model, trainer, or compute provider when the configured provider is unavailable. Training material may include only data whose use is explicitly authorized by the buyer and permitted by the applicable provenance/rights policy.

### Sequence and reuse boundary

Do **not** fork COS University into the commercial portable. Finish University first, then extract/generalize reusable contracts and components from the proven University distillation pipeline.

Reusable assets may include connector capability discovery, dataset/provenance controls, teacher/student orchestration, LoRA/QLoRA execution, independent evaluation, cost governance, canary/deployment adapters, rollback, and evidence ledgers. The portable core must remain provider-neutral even when its first production adapters reuse University Hugging Face and RunPod work.

Working commercial positioning:

> **Turn a buyer's best AI/model/agent capability into a smaller, cheaper, private, trainable, deployable capability the buyer can own and operate.**

Final product name and packaging remain undecided until the post-University project begins.

**University distillation and completion remain the current priority.**

---

# Current priority — finish COS University

The owner has explicitly prioritized **distillation** within the University project. Continue University work to accepted completion before starting the commercial portable above.

Operational ordering:

1. keep packaging new rights-cleared University material into valid distillation batches;
2. run bounded, explicitly authorized distillation campaigns with truthful provider evidence;
3. register trained artifacts and rollback evidence;
4. run exact-artifact canary and independent evaluation;
5. require holdout improvement plus applicable safety, unseen-transfer, retention, and Production evidence before promotion;
6. use failed evaluation to improve the training/distillation recipe rather than weakening evaluators;
7. continue the undergraduate/remediation/exam/transfer/retention/graduation program for COS and registered specialists.

Evaluation may run concurrently, but it should not unnecessarily stop the next already-authorized distillation batch. Spending authority remains separately bounded; a request to prioritize distillation does not create an unlimited training budget.

Current provider/job/model state is mutable. **Always query live Production evidence before reporting it.** Do not infer current HF spend, RunPod state, artifact status, or evaluation status from this file.

## Platform dispatch / pipeline-capacity policy — 2026-09-17

Owner direction: **work is dispatched to available pipelines; capacity is an input, never a hardcoded platform law.** This is a platform architecture rule for both COS University and commercial portables, not a University-only optimization.

The canonical design is a governed **dispatcher / worker-pool** model:

- waiting work is ordered by the applicable queue policy and continuously matched to an available compatible pipeline;
- every active unit owns an isolated lease for the exact artifact/job from admission through its governed terminal handoff, then releases that lease;
- pipeline state must distinguish at least available, leased/busy, unhealthy/quarantined, and unavailable;
- admission control must refuse lane N+1 when capacity is exhausted; provisioning or routing must not evict, retire, overwrite, or steal a healthy lease merely to start newer work;
- capacity is a runtime/configuration/provider input. The same orchestration code must behave correctly at N=1, N=10, N=50, or buyer-selected capacity without rewriting workflow logic;
- no portable or shared platform component may encode SignalBoost's current laboratory worker count, one-at-a-time fences, or retire-on-provision behavior as a product invariant;
- routing may use only pipelines that are compatible with the exact artifact/model/provider/tenant and have the required authorization. Unlike a generic load balancer, the dispatcher must preserve exact-artifact binding;
- a free compatible lane should not remain idle while eligible authorized work is waiting, subject to spend, quota, rate, safety, evidence, and provider-health controls;
- failure of one lane must not corrupt another lane's lease or evidence. Recoverable work may be requeued or repaired under its existing authority; unhealthy lanes fail closed and are excluded from dispatch until repaired;
- observability must expose queue depth, configured capacity, available/busy/unhealthy lanes, lease owner, wait time, throughput, and bounded failure/retry state so the Self-Healing Supervisor can diagnose and repair routing/capacity faults rather than alert only.

**Speed comes from usable parallel capacity; reliability comes from isolation, leases, admission control, and truthful health.** The dispatcher directs work to existing authorized capacity; it does not itself create spending authority, provider quota, evaluation authority, Production traffic authority, or new pipelines.

Current University Production behavior may remain N=1 until the dispatcher implementation is proven and current provider/account limits permit more lanes. N=1 is a valid configuration of the same architecture, not a separate single-lane design. Raising N or provisioning additional paid capacity remains subject to the existing explicit spend/provider authorization boundaries.

This policy applies to University canary/evaluation/runtime flow and must be reused by the post-University Agent Distillation & Training Portable. The portable extraction must generalize the same dispatcher contract rather than fork a separate scheduler.

## University distillation Self-Healing loop

University mass distillation is connected to the existing Self-Healing Supervisor rather than a
separate alert-only controller. The scheduled worker and Supervisor repair both call one canonical
workflow: provider-ledger reconciliation -> failed-job diagnostics -> stale dispatch-claim recovery
-> bounded failed-stage recovery -> next authorized dispatch. A dedicated offset five-minute monitor
reads the durable Production heartbeat, campaign/run state, and provider-job ledger; unhealthy state
becomes a host-created incident, an exact allowlisted repair, and a separate post-repair health read.

The repair may only continue work inside the campaign's existing expiration and remaining cost
ceiling, or authorize one already-prepared batch through the owner's durable rolling policy. On
2026-09-15 the owner explicitly authorized at most **$25 of maximum campaign authority in any rolling
24-hour window** for Hugging Face University mass distillation. The database serializes workers,
counts campaign hard ceilings rather than optimistic actual cost, permits only one live single-batch
campaign at a time, and retains the existing $1.825 maximum per batch. Historical/manual campaigns
inside the same rolling window count against that ceiling.

The shared worker now reconciles and recovers existing work, performs a non-spending rights-cleared
packaging sweep, requests at most one campaign through that durable policy, and only then dispatches.
The monitor distinguishes active health from `waiting_for_curriculum`, `budget_paused`, and
`authorization_required`; zero active campaigns is no longer reported as healthy idle. A prepared
batch that was not authorized despite available rolling authority is repairable automatically through
the same governed workflow.

The repair cannot authorize promotion, Production traffic, RunPod mutation, non-prepared data, a
larger rolling ceiling, parallel campaigns, or a later campaign expiry. Missing/expired authority,
failed verification, or an unrecognized incident fails closed and remains visible rather than being
reported as healed. Insufficient rights-cleared unique material is reported as a supply wait; the
system does not weaken the 20-item curriculum quality floor merely to keep provider compute busy.
Supply telemetry reports both raw unassigned provenance rows and the smaller post-dedup batchable
count by canonical subject. When no batch is prepared, the shared workflow serializes one bounded
replenishment pass per 30-minute slot against the nearest canonical subject shortfalls, using only
the existing governed OpenAlex CC0 acquisition/admission path, then reruns packaging before any
rolling authorization. Acquisition cannot dispatch training or expand provider authority.

The rolling RPC is the only service-role campaign-authorizer entry point: direct execution of the
legacy authorizer is revoked so concurrent workers cannot bypass the policy-row lock or 24-hour cap.
Monitoring and reconciliation read every unsettled Hugging Face provider job, including jobs whose
campaign has already left the active window, before another campaign can be authorized.

The exact-artifact RunPod canary reserves 235 seconds of the 300-second function window for a real
Qwen3-4B + immutable-LoRA cold start and 35 seconds for the bounded inference probe. This reflects
Production evidence that a healthy running worker could still be loading at the former 190-second
cutoff. The change does not add an invocation, raise the $0.20 canary ceiling, authorize evaluation,
or authorize Production traffic.

RunPod counts each endpoint's `maxWorkers` against the account quota even when `minWorkers` is zero.
Before creating a new exact-artifact mass canary, provisioning therefore sets only older
`itmounts-mass-distilled-*` endpoints to `minWorkers=0,maxWorkers=0`. It does not delete endpoints,
touch unrelated workloads, add an invocation, or expand Production authority.
If the legacy v2 create/list response omits the endpoint identifier, provisioning resolves that
identifier by exact endpoint name through RunPod's official REST endpoint list before failing closed.
The independent mass evaluator uses the same 235-second exact-artifact readiness window as the
canary, preventing a healthy scale-to-zero Qwen3-4B + LoRA cold start from failing at 190 seconds.

Production evaluator evidence on 2026-09-17 established three additional transport rules. A two-case
mass holdout starts as two single-case requests so a transient RunPod gateway failure on one case can
use the existing bounded single-group retry rather than an unbounded split-child retry tree. A solo
request may use the existing 1,024-token output cap, but token headroom alone is not a substitute for
correct model mode: Qwen3 thinking is disabled for final-answer evaluation so the bounded output
budget is spent on the required observable answer instead of hidden reasoning. The evaluator remains
final-answer-only; it does not collect, persist, grade, or treat hidden chain-of-thought as evidence.
These transport repairs do not change cases, references, scoring thresholds, delayed-retention gates,
exact-artifact binding, promotion rules, or Production-traffic prohibition. Evaluation authority
remains exactly eight endpoint calls, four judge calls, one runtime wake, and at most $0.20 estimated
wake cost.

---

# Mandatory first-read / repo-scan rule

Every developer, AI coding agent, reviewer, operator, contractor, specialist, or infrastructure assistant working in this repository must:

1. Read the current root `ONBOARD.md` first.
2. Read `SKILLS.md` for COS learning, grading, graduation, remediation, and graduate-specialist architecture when relevant.
3. Read `docs/ONBOARD-SNAPSHOT-2026-09-15-PRE-DISTILLATION-PORTABLE.md` when prior detailed operational contracts or implementation chronology are relevant.
4. Query current `main` before changing anything.
5. Inspect current open PRs and concurrent work that could overlap.
6. Query exact Vercel Production/Preview state when deployment truth matters.
7. Query current Supabase migrations/schema/data when database truth matters.
8. Read the exact task-related files before editing.
9. Re-scan after `main` advances or when concurrent agents may have changed the task area.
10. Verify implementation/runtime behavior from code plus actual evidence rather than memory.
11. Never report a merge, deployment, fix, training run, model improvement, or acceptance as complete without the corresponding evidence.

Stale repository context is not acceptable evidence.

The prior v1.77 detailed history remains at `docs/ONBOARD-ARCHIVE-V1.77-2026-09-08.md`.

---

# Repository write / integration discipline

Current integration contract for PRs targeting `main`:

- do not write directly to `main`;
- create/update a task branch from current `main`;
- every PR targeting `main` must modify `.github/main-write-token`;
- the token must identify the exact current PR base SHA and exact PR branch;
- PR body must carry the exact current `ONBOARD_ACK_BLOB` and `REPO_SCAN_HEAD` required by Onboarding Enforcement;
- include the current `SKILLS_ACK_BLOB` when relevant / available;
- if `main` advances, re-scan/reconcile and refresh the integration token/acknowledgements rather than merging stale work;
- required checks and applicable Vercel Preview must be green before integration;
- merge to `main` through GitHub's **merge** method, not a direct/squash/rebase write that violates repository integration history rules;
- use the expected PR head SHA when merging;
- after merge, verify merged PR state, new main SHA, two-parent merge commit, and applicable Production health.

An explicit owner request such as `go`, `commit and merge`, or an already-authorized routine repair is execution authority only within these repository controls. It does not turn a red/stale PR into a safe merge.

---

# Core product architecture

```text
Customer / owner goal
      |
      v
Concierge / Owner Assistant / delivery surface
      |
      v
COS — sole generalist brain, intent owner, orchestration and final judgment
      |
      +--> Software Specialist
      |      +--> Builder
      |      +--> Platform Engineer
      |
      +--> Security / Marketing & Sales / Design / Finance /
           Operations / Research / future specialists
      |
      v
structured evidence/results/uncertainty
      |
      v
COS review / synthesis / governed action or answer
```

**COS is the brain. Concierge is the public face. Specialists are expert workers.**

COS remains the Chief-of-Staff generalist/orchestrator. Specialists add depth and return evidence/results/uncertainty through COS. Builder and Platform Engineer remain Software Specialist capabilities rather than separate brains. Expertise, degrees, benchmark results, or learning quality never widen authority by themselves.

---

# Runtime inference / provider source of truth

Models and providers are replaceable compute. **COS is the learner.**

Never treat a source-code model string, old deployment observation, ONBOARD entry, or model memory as current runtime truth. Current runtime identity must come from verified live configuration/telemetry.

For University distillation, Hugging Face and RunPod may currently act as governed training/runtime/evaluation adapters when live configuration and evidence prove that path. That does not make either provider a permanent product dependency or a general COS reasoning authority.

## Enterprise University teacher-pool contract — 2026-09-17

The Production University teacher layer is provider-agnostic. Supported teacher classes include Qwen and DeepSeek through the governed Hugging Face/local executor path, hosted OpenAI-compatible providers, Anthropic/Claude, xAI/Grok, and buyer-supplied custom/private gateways such as Azure-hosted endpoints, Bedrock/Vertex bridges, on-prem vLLM, private cloud, or future approved providers. Provider support is an adapter contract, not a core-product dependency.

Teacher-provider rules are mandatory:

- buyer-owned credentials and buyer-selected model identifiers/configuration;
- explicit provider enablement and adapter-ready gates before use;
- fail closed when a selected provider, credential, adapter, model, or license is unavailable or unapproved;
- never silently substitute another provider or model;
- persist teacher/provider/model provenance with generated training material and resulting artifacts;
- preserve bounded provider spend/call ceilings and existing authorization boundaries;
- keep independent evaluation, holdout comparison, graduation thresholds, and promotion policy provider-independent;
- teacher intelligence, brand, benchmark strength, or model size never expands operational authority;
- unknown open-model licenses fail closed. The current automatically accepted open-model teacher licenses are Apache-2.0 and MIT; other licenses require an explicit policy/legal addition before paid dispatch;
- hosted-provider adapters must not expose or embed credentials in datasets, logs, client surfaces, or portable artifacts;
- enterprise portability requires that a buyer can disable all public hosted teachers and operate only approved private/self-hosted teacher infrastructure without changing University core code.

Current teacher-pool implementation is defined by `saas/lib/ai/cos/cosUniversityTeacherPool.ts`, `cosUniversityTeacherAdapters.ts`, and `cosUniversityTeacherLicensePolicy.ts`. Runtime activation remains live configuration and must be queried before reporting which teachers are actually active.

No provider may silently substitute for another when policy/configuration requires fail-closed behavior.

---

# COS learning / University contract

`SKILLS.md` is the detailed canonical education blueprint. COS is developed as an elite multidisciplinary **generalist first**. Specialists add depth after/alongside evidence-gated foundations; they do not replace COS.

Canonical learning loop:

```text
perform
-> observe objective outcome
-> identify weakness / subject / competency
-> acquire appropriate governed material if needed
-> study
-> deliberate practice
-> use tools / perform authorized work where capability requires action
-> independent unseen exam
-> transfer exam
-> Production outcome evidence where applicable
-> delayed retention
-> retain / strengthen / remediate / weaken / quarantine
```

Key rules:

- reading a source is not mastery;
- embedding a document is not competence;
- queue counts are not learning proof;
- self-generated practice is not independent validation;
- model self-assessment never earns a grade;
- failed exams trigger useful remediation, not evaluator weakening;
- mutable current-world facts remain live-evidence problems rather than timeless learned facts;
- garbage-in/garbage-out remains controlling;
- verified specialist lessons should flow back to COS when generalizable;
- authority and expertise remain separate axes;
- A/A+, Master's, and PhD labels require the independent evidence defined in `SKILLS.md`;
- promotion requires independently measured improvement, unseen transfer, practical execution, delayed retention, and source attribution;
- exposure, document count, embeddings, and activity volume never count as mastery.

---

# University distillation / controlled training contract

Distillation is a governed learning mechanism, not a shortcut around University evidence.

- Only rights-cleared, provenance-traceable, buyer-authorized training material may enter training.
- Historical lessons or private Production data are not silently reclassified as training data.
- Training/holdout identity and separation remain explicit and auditable.
- Teacher generation, dataset preparation, and student training use bounded provider jobs and cost ceilings.
- Paid provider dispatch remains separately authorized and fail-closed.
- A successful training job proves only that an artifact was produced; it does not prove improvement.
- Trained artifacts require independent holdout comparison, safety checks, unseen transfer, delayed retention where applicable, canary evidence, and rollback evidence before promotion.
- A quality failure remains a failure even when infrastructure worked.
- Provider cost ledgers/estimates must not be presented as authoritative external billing when they are only internal estimates.
- Hidden chain-of-thought is not training material or persisted evidence.
- Model distillation, agent-level learning, RAG, skills, memory, and tool-policy learning remain distinct mechanisms and should be chosen based on measured benefit rather than fashion.

---

# Public brand contract

The public product identity is **iTMounts** and the canonical public origin is `https://itmounts.com`.

Public spelling is exactly **iTMounts**. Concierge is **iTMounts Concierge**. Internal repository/service/history identifiers may retain legacy names where renaming would create risk or destroy provenance; that is not permission for legacy branding to leak into customer-facing surfaces.

The public-brand/domain migration must not split the backend or weaken auth, payment, callback, cookie, tenant, or evidence boundaries.

---

# Security / governance invariants

Non-negotiable:

- never hard-code or expose provider secrets;
- owner/admin routes remain server-gated;
- cron routes remain protected;
- preserve tenant/org scoping and RLS/service-role assumptions;
- no unauthenticated Production validation backdoors;
- external/managed providers never become governance authority;
- unknown, consequential, destructive, financial, or security-sensitive actions fail closed or require the applicable approval boundary;
- routine reversible work should proceed autonomously when already authorized rather than asking for unnecessary approval;
- learned retrieval/worker/tool/skill preference cannot widen authorization;
- specialist expertise/degree cannot widen authorization;
- no hidden chain-of-thought persistence;
- private certification prompts/rubrics remain protected;
- public Concierge never inherits owner/admin/private-company context merely because a browser is owner-authenticated;
- OAuth/token material remains server-side and encrypted where the connector contract requires it;
- read-only connector scopes must not silently become write/content scopes;
- capability discovery/grants do not themselves authorize execution;
- training, evaluation, or deployment intelligence never expands spending, tenant, repository, Production, or provider authority.

Never weaken evidence gates, private holdouts, authorization, tenant isolation or lifecycle rules merely to make a dashboard green.

---

# Status language — mandatory precision

Use actual states, not optimistic shorthand.

**A branch is not Production. A green build is not capability acceptance.**

**Verify implementation and runtime behavior from code plus live evidence before diagnosing or reporting status.**

A plan is not execution.  
A queue row is not a completed action.  
A Preview fix is not a Production fix.  
A deployment marked READY is not proof every user flow works.  
An encountered skill is not validated learning.  
A self-generated practice pass is not independent validation.  
A model claim is not host evidence.  
A diagnostic read is not regression proof.  
A training job marked completed is not proof the trained model improved.  
An internal cost estimate is not authoritative provider billing.  
A canary pass is not automatic Production promotion.  
A capability grant is not execution delegation.  
A specialist's expertise is not permission to widen authority.

---

# Definition of success

The public product is **iTMounts**. COS remains the internal generalist brain. Concierge is the public face. Specialists are expert workers. Builder is the Software Specialist's governed engineering harness.

For the current University phase, success means COS and registered specialists improve through independently verified study, practice, exams, transfer, retention, real-world evidence, and governed distillation without confusing activity with learning or infrastructure success with model quality.

For the deferred portable phase, success will mean a buyer can plug in different models, agents, data sources, APIs, MCP servers, providers, and private infrastructure; have supported capabilities discovered automatically; distill/train/evaluate/deploy through normalized contracts; and swap providers without rebuilding the product core.

**Finish University first. Then build the plug-and-play Agent Distillation & Training Portable.**
