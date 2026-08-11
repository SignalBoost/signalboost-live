# ONBOARD.md

# SignalBoost Engineering Blueprint
## Cognitive Operating System (COS)

**Version:** 1.4
**Updated:** 2026-08-10
**COS Independence / Autonomous-Intelligence Architecture:** COMPLETE
**COS Independent Runtime:** REQUIRES A CONFIGURED OPEN/LOCAL MODEL ENDPOINT
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

For detailed historical/operational doctrine, `docs/ONBOARD-full.md` remains a deeper reference. If an older status statement there conflicts with this file, the current repository and this current-state handoff win.

---

# Mission

SignalBoost is a Cognitive Operating System (COS) that powers specialized business modules and Portables. Portables perform business functions; COS owns reusable intelligence, memory, learning, planning, governance, cost control, verification, and provider selection.

External AI/data providers are replaceable compute or enrichment resources. They are not the owner of SignalBoost intelligence.

Target loop:

```text
Observe → Remember → Learn → Reason → Act → Verify → Improve
```

---

# 2026-08-10 Current Platform State

## COS-first architecture is complete; runtime independence is configuration-dependent

The architecture no longer treats Claude/OpenAI/Gemini as the default brain.

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
Local/open COS reasoning
    ↓
Confidence gate
    ├─ sufficient → use COS result
    └─ insufficient → autonomous bounded research
                         ↓
                      retain verified knowledge
                         ↓
                      reload context + retry local reasoning
                         ↓
                      fail closed / governed fallback according to policy
    ↓
Verification
    ↓
Learning / memory / ROI telemetry
```

Primary implementation: `saas/lib/ai/cos/cosFirstAnswer.ts`.

Important runtime truth: COS retrieves Enterprise Memory / Knowledge Graph / Continuous Learning context before testing whether the local model is configured. If local inference is unavailable, COS may still research and retain approved knowledge, but it cannot synthesize an independent final answer until a model endpoint is configured.

Required independent-reasoning variables:

```dotenv
COS_LOCAL_FIRST_ENABLED=true
LOCAL_AI_BASE_URL=https://<private-open-model-endpoint>/v1
LOCAL_AI_MODEL=<served-model-name>
LOCAL_AI_API_KEY=<server-side-secret>
LOCAL_AI_ALLOWED_HOSTS=<exact-hostname>
LOCAL_AI_ALLOW_CLOUD_FALLBACK=false
```

Loopback/internal appliance endpoints (`localhost`, `127.0.0.1`, `::1`, `ai-brain`) remain supported. A production SaaS deployment may instead use a separately hosted private open-model inference service. Remote endpoints must use HTTPS, require `LOCAL_AI_API_KEY`, and their exact hostname must be explicitly listed in `LOCAL_AI_ALLOWED_HOSTS`. This avoids turning the inference URL into an unrestricted SSRF/network egress primitive.

The repository already contains a self-hosted open-model stack under `appliance/local-ai/`, supporting vLLM and llama.cpp with OpenAI-compatible endpoints. That stack or an equivalently secured private service supplies compute; it does not make OpenAI/Anthropic/Gemini the reasoning provider.

For an isolation benchmark, leave OpenAI/Anthropic/Gemini reasoning disabled and require provenance to report `externalAiInvoked: false`.

---

# Core Principles

## COS is the brain

Every Portable should use shared COS intelligence and governance rather than creating a provider-owned reasoning silo.

## AI is the last resort

Never call an external model when deterministic code, known knowledge, cache, durable reuse, a verified skill, or local COS reasoning can solve the task adequately.

## Local/internal first

```text
Deterministic / known knowledge
→ exact / semantic / durable reuse
→ verified skill / learned procedure
→ local/private open-model reasoning
→ approved cloud compute or commercial data provider only when policy permits and needed
```

## Never pay twice

Do not regenerate known content, rediscover known buyers, rerun identical expensive searches, or buy company intelligence that SignalBoost already owns with sufficient confidence/freshness.

## Providers are replaceable

OpenAI, Anthropic, Gemini, Mistral, DeepSeek, Qwen, local models, CRM vendors, communication providers, and prospect-data providers are edges around a provider-neutral core.

## Human control is preserved

Consequential actions remain behind applicable approval boundaries, including publishing, spending, provider-key changes, infrastructure/environment changes, DNS changes, migrations, deletion/disablement, and sensitive production/provider mutations.

---

# COS Execution Model

1. **Deterministic / Business Rules** — formatting, validation, routing, permissions, calculations, known workflows.
2. **Knowledge / Reuse** — exact cache, semantic cache, durable response/procedure reuse.
3. **Memory / Context** — Enterprise Memory and bounded context reconstruction/compaction.
4. **Reasoning / Skills** — Goal Engine, reusable skills, learned procedures, local COS reasoning.
5. **Replaceable Compute / Providers** — private/open-model compute first; external providers only when justified and permitted.

Completed outcomes return to memory, knowledge, learning and telemetry so future work gets cheaper and better.

---

# Learning Doctrine

Accumulation is not learning. Learning must improve future execution. Durable learned items preserve source/provenance, confidence, acquisition/verification time, freshness/expiry, scope, evidence, and reuse/outcome measurements where applicable.

Contradictions must not silently overwrite trusted knowledge. Continuous/background learning remains bounded and cost-governed.

---

# Cost / ROI Governance

Track provider calls avoided, cache/reuse hits, knowledge hits, local executions, external fallbacks, provider cost, avoided cost, latency, retries, successful outcomes, and learning reuse/effectiveness.

---

# Marketing & Sales State

Marketing & Sales core architecture is complete, including Enterprise Memory, Knowledge Graph, Continuous Learning, Goal Engine, Prospect Intelligence, Business Intelligence Corpus, Communication Hub, CRM production paths, Revenue Intelligence, Universal Adapter seams, campaign/outreach queues, approval gates, audit, telemetry, cost governance and localization guardrails.

The 5,000-company Business Intelligence Corpus goal is a data-population target, not unfinished architecture. Last dated production observation on 2026-08-10 was 461/5000 (9.22%); always use live status for the current number.

Owner/admin route: `/dashboard/data/business-intelligence-corpus`

Status API: `/api/admin/business-intelligence-corpus/status`

---

# Enterprise Release Candidate

A green Vercel deployment is necessary but not sufficient to call the enterprise product Release Candidate. The fail-closed profile is `saas/lib/release-candidate/marketing-sales.ts` and requires real evidence for deployment, tenant isolation, security, resilience, load/soak, observability, end-to-end integration, and documentation currency.

Missing evidence is `not_run`, not pass.

---

# Security / Secret Rules

- Never hard-code secrets.
- Never print full provider keys or tokens.
- Never expose secret values in logs, screenshots, PR bodies, email, or client UI.
- Use approved Vault/environment-variable/server-side storage boundaries.
- Preserve tenant/org scoping and RLS/server-role assumptions.
- Keep owner/admin routes server-gated.
- Remote private inference endpoints must be HTTPS, authenticated, and exact-host allowlisted.

---

# Localization

Core supported languages: English (`en`), Spanish (`es`), Portuguese (`pt`), Polish (`pl`), Russian (`ru`). New user-facing copy must follow repository i18n guardrails.

---

# Build / Test / Deploy Rules

- Prefer coherent batches of related changes.
- Read a file before changing it.
- Preserve existing behavior unless the task requires change.
- Run/observe relevant typecheck, production build and tests before calling a batch successful.
- Never claim CI/build/deployment passed unless it actually did.
- Never call a branch commit production.
- Re-check current `main` after concurrent work.

---

# Documentation Map

Marketing & Sales:
- `docs/marketing-sales-current-state.md`
- `saas/docs/marketing-sales-module-design.md`
- `docs/business-intelligence-corpus.md`
- `docs/enterprise-release-candidate.md`

COS / enterprise architecture:
- `saas/lib/ai/cos/`
- `saas/lib/ai/local-inference.ts`
- `saas/lib/cos/`
- `saas/lib/cos-core/`
- `saas/lib/enterprise/`
- `saas/lib/enterprise-ai-os/`
- `appliance/local-ai/`

Detailed historical/operational onboarding: `docs/ONBOARD-full.md`.

---

# Status Language

Use precise actual states. A plan is not a campaign; a queue row is not a sent email; an attempted publish is not a published asset; a branch is not production; a green deployment is not enterprise RC acceptance; architecture support for local inference is not proof that a production inference endpoint is configured and healthy.

---

# 2026-08-10 Change Log

- Confirmed COS retrieval occurs before the local-inference configuration gate.
- Confirmed research → retain → reload → local retry is implemented.
- Added secured support for a production-reachable private open-model inference endpoint using HTTPS + API key + exact-host allowlisting.
- Documented required COS independent-runtime variables in `saas/.env.example`.
- Clarified that COS independence architecture is complete while independent runtime requires a configured and healthy open/local model endpoint.
- Preserved the existing self-hosted vLLM/llama.cpp appliance runtime.

---

# Definition of Success

The best AI call is the one that never has to happen.

The best external data call is the one avoided because SignalBoost already owns sufficient verified intelligence.

The best Portable continuously teaches COS without bypassing governance.

The best architecture lets providers be replaced without rewriting business intelligence or control logic.

The best enterprise release claim is one backed by recorded evidence.
