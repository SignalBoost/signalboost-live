# ONBOARD.md

# iTMounts Engineering Blueprint

**Updated:** 2026-09-15  
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

## University distillation Self-Healing loop

University mass distillation is connected to the existing Self-Healing Supervisor rather than a
separate alert-only controller. The scheduled worker and Supervisor repair both call one canonical
workflow: provider-ledger reconciliation -> failed-job diagnostics -> stale dispatch-claim recovery
-> bounded failed-stage recovery -> next authorized dispatch. A dedicated offset five-minute monitor
reads the durable Production heartbeat, campaign/run state, and provider-job ledger; unhealthy state
becomes a host-created incident, an exact allowlisted repair, and a separate post-repair health read.

The repair may only continue work inside the campaign's existing expiration and remaining cost
ceiling. It cannot authorize promotion, Production traffic, RunPod mutation, a new campaign, a larger
budget, or a later expiry. Missing/expired authority, failed verification, or an unrecognized incident
fails closed and remains visible rather than being reported as healed.

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
