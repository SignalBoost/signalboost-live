# ONBOARD.md

# SignalBoost Engineering Blueprint
## Cognitive Operating System (COS)

**Version:** 1.5  
**Updated:** 2026-08-12  
**Overall engineering progress estimate:** ~98% — not an Enterprise Release Candidate declaration  
**COS Independence / Autonomous-Intelligence Architecture:** COMPLETE  
**COS Independent Runtime:** REQUIRES A CONFIGURED OPEN/LOCAL MODEL ENDPOINT  
**Marketing & Sales Core Architecture:** COMPLETE  
**Self-Healing Supervisor native monitoring:** ACTIVE, WITH REMAINING PROBE GAPS  
**Enterprise Release Candidate:** EVIDENCE-BASED — never infer from architecture or a green deployment

---

## Mandatory first-read rule

This file is the canonical starting point for every developer, AI coding agent, reviewer, operator, contractor, and infrastructure assistant working on this repository.

1. Read `ONBOARD.md`.
2. Read `docs/HANDOFF-2026-08-12.md` for the latest dated engineering delta.
3. Scan current `main`.
4. Read the exact files related to the task.
5. Verify implementation from code before diagnosing, changing, or reporting status.
6. Never report behavior from memory alone.

`AGENTS.md` and `CLAUDE.md` are entry-point summaries. `docs/ONBOARD-full.md` is the deeper historical/operational reference. Current repository evidence and this current-state handoff win over stale documentation.

---

# Mission

SignalBoost is a Cognitive Operating System that powers specialized business modules and Portables. COS owns reusable intelligence, memory, learning, planning, governance, cost control, verification, provider selection and reusable operational knowledge.

External AI/data providers are replaceable compute or enrichment resources. They do not own SignalBoost intelligence.

```text
Observe → Remember → Learn → Reason → Act → Verify → Improve
```

---

# COS execution order

```text
Request / Goal
→ deterministic business rules
→ exact / semantic / durable reuse
→ Enterprise Memory
→ Knowledge Graph
→ Continuous Learning / bounded context
→ local/private COS reasoning
→ confidence/evidence gate
→ bounded research or replaceable provider only when justified and permitted
→ verification
→ learning / memory / ROI telemetry
```

Primary answer path: `saas/lib/ai/cos/cosFirstAnswer.ts`.

Independent reasoning requires a configured private/open-model endpoint. Architecture support is not proof that a production endpoint is healthy.

Typical configuration:

```dotenv
COS_LOCAL_FIRST_ENABLED=true
LOCAL_AI_BASE_URL=https://<private-open-model-endpoint>/v1
LOCAL_AI_MODEL=<served-model-name>
LOCAL_AI_API_KEY=<server-side-secret>
LOCAL_AI_ALLOWED_HOSTS=<exact-hostname>
LOCAL_AI_ALLOW_CLOUD_FALLBACK=false
```

Remote private inference must use HTTPS, authentication and exact-host allowlisting. The repository also contains a self-hosted open-model stack under `appliance/local-ai/`.

---

# Core principles

- COS is the reusable intelligence/governance layer; Portables should not create provider-owned reasoning silos.
- AI is the last resort when deterministic code, known knowledge, cache, durable reuse or verified skills suffice.
- Prefer local/private compute before approved commercial AI providers.
- Never pay twice for knowledge or work SignalBoost already owns with sufficient confidence and freshness.
- Providers are replaceable edges around a provider-neutral core.
- Preserve tenant isolation, auditability and explicit execution boundaries.
- Consequential actions remain behind applicable approval controls.

---

# 2026-08-12 COS / Supervisor state

Major merged capabilities added during the 2026-08-12 engineering sequence include:

- portable buyer connector runtime and host exposure;
- deterministic connector delegation recipes;
- delegated evidence compaction and bounded evidence packets;
- connector-aware Supervisor reasoning;
- incident-aware connector recipe routing;
- adaptive evidence sufficiency scoring;
- durable learned-knowledge/recipe reuse;
- buyer-hosted durable recipe memory and SQL adapter;
- recipe quality scoring, expiry/replacement and confidence lifecycle;
- deterministic evidence reranking and Unicode-safe retrieval grounding;
- robotics/physics learning curriculum integration;
- native Self-Healing Supervisor monitoring runtime;
- Vercel deployment/provider observation connected to native monitoring;
- SignalBoost platform-health intelligence connected to native monitoring.

See `docs/HANDOFF-2026-08-12.md` for the dated handoff.

---

# Self-Healing Supervisor — authoritative monitoring doctrine

The Self-Healing Supervisor is intended to be **proactive**, not merely reactive to incidents delivered by another monitoring product.

Native monitoring is a first-class capability and should be enabled by default for a plug-and-play installation. A buyer that already has monitoring may run `hybrid` mode or intentionally choose external-only monitoring.

Canonical implementation:

- `saas/self-healing-host/native-monitoring-policy.ts`
- `saas/self-healing-host/native-monitoring-runtime.ts`
- existing Vercel observer/provider-health path
- existing SignalBoost platform-health intelligence
- `docs/portables/self-healing-monitoring-current-state-20260812.md`

Current native coverage includes Vercel deployment/provider health plus platform-health conditions such as queue growth, scheduler failures, provider failures, resource pressure, stale leases/heartbeats, verification failures and audit failures.

Existing external webhook adapters remain available for Datadog, PagerDuty, AWS CloudWatch/EventBridge, Prometheus Alertmanager, Splunk, Azure Monitor, Grafana Alerting and Google Cloud Operations. They are real deterministic adapters but remain `staged` until live-provider validation promotes them to `certified`.

### Remediation workflow

```text
Monitor / Observe
→ detect degradation, risk or incident
→ collect bounded evidence
→ diagnose / reason
→ select registered repair capability
→ policy / risk classification
→ routine + explicitly pre-authorized bounded repair may execute automatically
→ consequential action requires approval
→ verify
→ audit
→ learn
```

Automatic routine repair never means arbitrary mutation. The action must remain inside an explicitly registered capability with allowed provider/resource/method/parameter scope, reversibility and execution limits.

### Remaining native monitoring work

As of 2026-08-12, the next real native probe families are:

- API latency and 5xx/error-rate trends;
- database latency/error/connection pressure;
- storage capacity/error health;
- TLS/certificate expiry.

Branch `feat/native-proactive-monitors-20260812` was created, but attempted repository writes were blocked by the connector safety gate. Treat these four probes as **not implemented yet**. Do not add placeholders or claim completion from policy signal names alone.

---

# Learning doctrine

Accumulation is not learning. Durable learned items should preserve provenance, confidence, acquisition/verification time, freshness/expiry, scope, evidence and reuse/outcome measurements where applicable. Contradictions must not silently overwrite trusted knowledge. Background learning remains bounded and cost-governed.

---

# Cost / ROI governance

Track provider calls avoided, cache/reuse hits, knowledge hits, local executions, external fallbacks, provider cost, avoided cost, latency, retries, successful outcomes and learning reuse/effectiveness.

---

# Marketing & Sales state

Marketing & Sales core architecture is complete, including Enterprise Memory, Knowledge Graph, Continuous Learning, Goal Engine, Prospect Intelligence, Business Intelligence Corpus, Communication Hub, CRM production paths, Revenue Intelligence, Universal Adapter seams, campaign/outreach queues, approval gates, audit, telemetry, cost governance and localization guardrails.

The 5,000-company Business Intelligence Corpus is a data-population target, not unfinished architecture. Always use live status rather than a historical count.

Owner/admin route: `/dashboard/data/business-intelligence-corpus`  
Status API: `/api/admin/business-intelligence-corpus/status`

---

# Enterprise Release Candidate

A green Vercel deployment is necessary but not sufficient to declare Enterprise RC. The fail-closed profile is `saas/lib/release-candidate/marketing-sales.ts` and requires real evidence for deployment, tenant isolation, security, resilience, load/soak, observability, end-to-end integration and documentation currency.

Missing evidence is `not_run`, not pass.

---

# Security / secrets

- Never hard-code or expose secrets.
- Never print full provider keys/tokens.
- Use approved Vault/environment/server-side storage boundaries.
- Preserve tenant/org scoping and RLS/server-role assumptions.
- Keep owner/admin routes server-gated.
- Remote private inference must be HTTPS, authenticated and exact-host allowlisted.

---

# Localization

Core supported languages: English (`en`), Spanish (`es`), Portuguese (`pt`), Polish (`pl`), Russian (`ru`). New user-facing copy must follow repository i18n guardrails.

---

# Build / test / deploy rules

- Prefer coherent batches of related changes.
- Read files before changing them.
- Preserve existing behavior unless the task requires change.
- Reuse existing real collectors/adapters instead of duplicating them.
- Do not add placeholders merely to increase feature/adapter counts.
- Run/observe relevant typecheck, build and tests before calling a batch successful.
- Never claim CI/build/deployment passed unless it actually did.
- Never call a branch commit production.
- Re-check current `main` after concurrent work.

---

# Documentation map

Latest handoff:
- `docs/HANDOFF-2026-08-12.md`

Self-Healing Supervisor:
- `docs/portables/self-healing-monitoring-current-state-20260812.md`
- `docs/portables/self-healing-monitoring-connections.md`
- `docs/portables/self-healing-technical-walkthrough.md`
- `docs/portables/self-healing-operations-runbook.md`
- `docs/portables/self-healing-integration-guide.md`
- `docs/portables/self-healing-evaluation-brief.md`

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

Historical/operational detail:
- `docs/ONBOARD-full.md`

---

# Status language

Use precise actual states. A plan is not execution; a queue row is not a sent email; an attempted publish is not a published asset; a branch is not production; a green deployment is not Enterprise RC acceptance; architecture support is not proof of configured runtime; a staged adapter is not certified; a policy signal is not proof that its collector exists.

---

# Definition of success

The best AI call is the one that never has to happen. The best external data call is the one avoided because SignalBoost already owns sufficient verified intelligence. The best Portable teaches COS without bypassing governance. The best architecture lets providers be replaced without rewriting business intelligence or control logic. The best self-healing system detects trouble early, resolves explicitly pre-authorized routine conditions safely, escalates consequential actions, verifies every outcome and learns from the result.
