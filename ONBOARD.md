# ONBOARD.md

# SignalBoost Engineering Blueprint
## Cognitive Operating System (COS)

**Version:** 1.3
**Updated:** 2026-08-10
**COS Independence / Autonomous-Intelligence Phase:** COMPLETE
**Marketing & Sales Core Architecture:** COMPLETE
**Enterprise Release Candidate:** EVIDENCE-BASED — do not infer from architecture or a green deployment

---

## Mandatory first-read rule

This file is the canonical starting point for every developer, AI coding agent, reviewer, operator, contractor, and infrastructure assistant working on this repository.

Required order:

1. Read `ONBOARD.md`.
2. Scan the current repository.
3. Read the exact files related to the task.
4. Verify current implementation from code before diagnosing or changing anything.
5. Never report status or behavior from memory alone.

`AGENTS.md` and `CLAUDE.md` are entry-point summaries. They do not replace this file or current repo inspection.

For Marketing & Sales work, read these next:

- `docs/marketing-sales-current-state.md`
- `saas/docs/marketing-sales-module-design.md`
- `docs/business-intelligence-corpus.md`
- `docs/enterprise-release-candidate.md`

For detailed historical/operational doctrine, `docs/ONBOARD-full.md` remains a deeper reference. If an older status statement there conflicts with this file, the current repository and this current-state handoff win.

---

# Mission

SignalBoost is not a collection of unrelated AI applications.

SignalBoost is a Cognitive Operating System (COS) that powers specialized business modules and Portables. Portables perform business functions; COS owns the reusable intelligence, memory, learning, planning, governance, cost control, verification, and provider selection.

External AI/data providers are replaceable compute or enrichment resources. They are not the owner of SignalBoost intelligence.

The target operating loop is:

```text
Observe → Remember → Learn → Reason → Act → Verify → Improve
```

---

# 2026-08-10 Current Platform State

## COS-first intelligence is complete

The architecture no longer treats Claude/OpenAI as the default brain.

Current reasoning order is:

```text
Request / Goal
    ↓
Deterministic business rules
    ↓
Exact / semantic / durable reuse
    ↓
Enterprise Memory
    ↓
Knowledge Graph
    ↓
Continuous Learning / user memory
    ↓
Local COS reasoning
    ↓
Confidence gate
    ├─ sufficient → use COS result
    └─ insufficient / unavailable → governed external-model fallback
    ↓
Verification
    ↓
Learning / memory / ROI telemetry
```

Primary local reasoning implementation: `saas/lib/ai/cos/cosFirstAnswer.ts`.

Low-confidence or unavailable local reasoning is recorded as a durable learning gap rather than being falsely reported as independent reasoning.

Do not reopen the COS-independence foundation unless there is a demonstrated regression, failed requirement, measurable improvement opportunity, or new architectural need.

## Marketing & Sales core architecture is complete

The current scan found the major Marketing & Sales architecture/product code built:

- COS-first intelligence and governed cloud fallback;
- Enterprise Memory;
- Knowledge Graph;
- Continuous Learning and durable reuse;
- Goal Engine;
- reusable Skill Registry;
- enterprise AI roles / cross-hub orchestration;
- Prospect Intelligence;
- Business Intelligence Corpus;
- Communication Hub;
- CRM production paths;
- Revenue Intelligence / outcome signals;
- Universal Adapter / provider-neutral integration seams;
- campaign and outreach queues;
- human approval gates;
- publishing/execution connectors;
- audit, telemetry, cost governance, and five-language localization guardrails.

“Core architecture complete” does **not** mean every optional third-party catalog entry is production-live for every buyer. Descriptor-only capabilities must continue to return `not_implemented` until a real production method exists. Buyer credentials, provider API approvals, account configuration, and environment-specific integrations remain buyer/environment responsibilities.

## Business Intelligence Corpus workflow is complete

The corpus is the internal-first reusable company-intelligence layer.

```text
Need company intelligence
    ↓
Internal Business Intelligence Corpus
    ↓
Confidence + freshness sufficient?
    ├─ yes → use internal record; no provider call
    └─ no  → bounded refresh / configured provider fallback when permitted
                 ↓
              normalize + validate + score
                 ↓
              corpus persistence
                 ↓
              Enterprise Memory
                 ↓
              Knowledge Graph
                 ↓
              reuse next time
```

The 5,000-company goal is a **data-population target, not unfinished architecture**.

Last production observation recorded on 2026-08-10: **461 unique companies / 5,000 = 9.22%**. This is a dated operational observation; always use the live dashboard/status endpoint for the current value.

Owner/admin page:

`/dashboard/data/business-intelligence-corpus`

Status API:

`/api/admin/business-intelligence-corpus/status`

Key rule: never pay twice. Existing outreach history, Enterprise Memory, corpus records, Knowledge Graph facts, and prior provider results must be reused before commercial rediscovery.

## Marketing & Sales enterprise RC is separate from build completion

A green Vercel deployment is necessary but not sufficient to call the enterprise product Release Candidate.

The dedicated fail-closed profile is:

`saas/lib/release-candidate/marketing-sales.ts`

It requires real passing evidence for all eight categories:

1. deployment;
2. multi-tenant isolation;
3. security / authorization / approval / secret handling;
4. resilience / backup / recovery;
5. sustained load / soak performance;
6. observability / audit coverage;
7. end-to-end integration across COS/EAE, Prospect, Corpus, Communication, CRM, Revenue, Enterprise Memory, and Universal Adapter boundaries;
8. documentation currency.

Missing evidence is `not_run`, not pass. A warning or failure on a required gate prevents RC status. Never manufacture operational evidence from source inspection, unit tests, or architecture diagrams.

---

# Core Principles

## COS is the brain

Every Portable should use shared COS intelligence and governance rather than creating a separate provider-owned reasoning silo.

## AI is the last resort

Never call an external model when deterministic code, known knowledge, cache, durable reuse, a verified skill, or local COS reasoning can solve the task adequately.

## Local/internal first

Preferred order:

```text
Deterministic / known knowledge
→ exact / semantic / durable reuse
→ verified skill / learned procedure
→ local/private reasoning
→ approved cloud compute or commercial data provider only when needed
```

## Never pay twice

Do not regenerate known content, rediscover known buyers, rerun identical expensive searches, or buy company intelligence that SignalBoost already owns with sufficient confidence/freshness.

## Providers are replaceable

OpenAI, Anthropic, Gemini, Mistral, DeepSeek, Qwen, local models, CRM vendors, communication providers, and prospect-data providers are edges around a provider-neutral core.

No Portable should make a specific provider the owner of business intelligence or governance.

## Human control is preserved

Autonomy does not mean bypassing policy.

Consequential actions remain behind the applicable approval boundary, including:

- sending outreach when policy requires approval;
- publishing;
- spending money;
- provider-key changes;
- infrastructure/environment changes;
- DNS changes;
- migrations;
- deletion/disablement;
- sensitive production/provider mutations.

---

# COS Execution Model

The practical layers are:

1. **Deterministic / Business Rules** — formatting, validation, routing, permissions, calculations, known workflows.
2. **Knowledge / Reuse** — exact cache, semantic cache, durable response/procedure reuse.
3. **Memory / Context** — Enterprise Memory and bounded context reconstruction/compaction.
4. **Reasoning / Skills** — Goal Engine, reusable skills, learned procedures, local COS reasoning.
5. **Replaceable Compute / Providers** — cloud models or external data/execution providers only when justified.

Completed outcomes should return to memory, knowledge, learning and telemetry so future work gets cheaper and better.

---

# Learning Doctrine

Accumulation is not learning. Learning must improve future execution.

Every durable learned item should preserve applicable:

- source/provenance;
- confidence;
- acquisition/verification time;
- freshness/expiry;
- scope;
- evidence;
- reuse/outcome measurements.

Contradictions should not silently overwrite trusted knowledge. Low-confidence discoveries remain low-confidence until verified.

Continuous/background learning must be bounded and cost-governed. Do not turn “learning” into an uncontrolled provider or AI bill.

---

# Cost / ROI Governance

Track evidence such as:

- provider calls avoided;
- cache/reuse hits;
- knowledge hits;
- local executions;
- external fallbacks;
- estimated/actual provider cost;
- avoided cost;
- latency;
- retries;
- successful outcomes;
- learning reuse/effectiveness.

The purpose is to prove cost reduction, not merely claim it.

---

# Marketing & Sales Integration Reality

## Communication Hub

Current documented production transports include:

- Gmail / Google Workspace via Gmail API;
- Microsoft 365 / Exchange Online via Microsoft Graph;
- generic SMTP;
- Universal Email Adapter for buyer-configured HTTPS email APIs.

See `saas/lib/communication-hub/README.md`.

## CRM

Current production CRM paths include:

- HubSpot direct production methods;
- Salesforce via the shared production CRM adapter;
- Microsoft Dynamics 365 via the shared production CRM adapter;
- Pipedrive via the shared production CRM adapter;
- Zoho CRM via the shared production CRM adapter.

See `saas/lib/integrations/catalog-sales.ts` and `saas/lib/integrations/crm-production.ts`.

Catalog presence is not proof of a live method. Preserve the repository rule that descriptor-only capabilities remain honest.

## Universal Adapter

Provider-neutral seams exist for communication, revenue/operations and configuration-driven HTTP(S) provider actions. New providers should be added at the edge rather than by branching the core around vendor names.

Secrets remain backend-only references. Sensitive actions stay governed.

---

# Campaign / Outreach Doctrine

A strategy written in chat is not a real campaign.

Real campaign/outreach work must create durable records and flow through the appropriate queues/approval/execution surfaces.

Representative lifecycle:

```text
strategy / targeting
→ draft/assets
→ approval queue
→ human approve / hold / edit / reject where required
→ configured connector execution
→ provider-confirmed result/live evidence
→ measurement
→ revenue/outcome feedback
→ memory/learning improvement
```

Never claim “sent,” “published,” or “completed” solely because an API call was attempted.

---

# Security / Secret Rules

- Never hard-code secrets.
- Never print full provider keys or tokens.
- Never expose secret values in logs, screenshots, PR bodies, email, or client UI.
- Use approved Vault/environment-variable/server-side storage boundaries.
- Preserve tenant/org scoping and RLS/server-role assumptions.
- Keep owner/admin routes server-gated; client visibility is not authorization.

---

# Localization

Core supported languages are:

- English (`en`)
- Spanish (`es`)
- Portuguese (`pt`)
- Polish (`pl`)
- Russian (`ru`)

New user-facing copy must follow the repository i18n guardrails. Do not add hardcoded English strings that bypass the locale system.

---

# Build / Test / Deploy Rules

- Prefer **coherent batches of related changes** so GitHub/Vercel do not build for every tiny edit.
- Read a file before changing it.
- Preserve existing behavior unless the task requires change.
- Run/observe the relevant typecheck, production build and tests before calling a batch successful.
- Never claim CI/build/deployment passed unless it actually did.
- Never call a branch commit “production.”
- Re-check current `main` after concurrent work; do not assume an earlier branch still represents production.
- Keep Node strip-safety requirements for directly executed `.ts` tests: avoid runtime-emitting TypeScript constructs in guarded directories.

---

# Navigation / Operator Surfaces

A page is not operationally discoverable merely because a route exists. Working owner/admin tools should be reachable through appropriate platform navigation.

Known corpus operator route:

`/dashboard/data/business-intelligence-corpus`

When adding a feature page, verify it works and then expose it in the correct menu if operators are expected to use it.

---

# Documentation Map

Current Marketing & Sales handoff:

- `docs/marketing-sales-current-state.md`
- `saas/docs/marketing-sales-module-design.md`
- `docs/business-intelligence-corpus.md`
- `docs/enterprise-release-candidate.md`

COS / enterprise architecture:

- `saas/lib/ai/cos/`
- `saas/lib/cos/`
- `saas/lib/cos-core/`
- `saas/lib/enterprise/`
- `saas/lib/enterprise-ai-os/`

Marketing / sales execution:

- `saas/lib/prospect-intelligence/`
- `saas/lib/business-intelligence-corpus/`
- `saas/lib/communication-hub/`
- `saas/lib/revenue/`
- `saas/lib/revenue-operations/`
- `saas/lib/integrations/`
- COSA/outreach routes and dashboards under `saas/app/`.

Enterprise acceptance:

- `saas/lib/release-candidate/`
- `docs/enterprise-release-candidate.md`

Detailed historical/operational onboarding:

- `docs/ONBOARD-full.md`

---

# Status Language

Use precise terms such as `draft`, `waiting_approval`, `approved`, `queued`, `running`, `ready`, `completed`, `published`, `failed`, `held`, and `changes_requested` according to the actual system state.

Examples:

- a plan is not a campaign;
- a queue row is not a sent email;
- an attempted publish is not a published asset;
- a branch is not production;
- a green deployment is not enterprise RC acceptance;
- a 5,000-company target is not proof that 5,000 companies are currently stored.

---

# 2026-08-10 Change Log

- Confirmed COS-first/local-first intelligence and governed external fallback as current architecture.
- Confirmed Business Intelligence Corpus workflow is complete and internal-first; 5,000-company population is ongoing operational data growth.
- Recorded the dated production corpus observation of 461/5000 (9.22%) without redefining that number as software completion.
- Marked Marketing & Sales core architecture/product code complete based on current repo scan.
- Added a dedicated fail-closed Marketing & Sales RC profile so enterprise acceptance depends on real evidence rather than estimates.
- Added/updated Marketing & Sales current-state, corpus, architecture and RC handoff documentation for future developers.

---

# Definition of Success

The best AI call is the one that never has to happen.

The best external data call is the one avoided because SignalBoost already owns sufficient verified intelligence.

The best Portable continuously teaches COS without bypassing governance.

The best architecture lets providers be replaced without rewriting business intelligence or control logic.

The best enterprise release claim is one backed by recorded evidence.
