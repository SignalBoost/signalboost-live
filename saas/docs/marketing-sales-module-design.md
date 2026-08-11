# Portable Marketing & Sales Department — Architecture & Design (v3 current state)

> Read `ONBOARD.md` first. This v3 reflects the current repository as of 2026-08-10 and supersedes older “build sequence,” “one real/two gated,” and partially-scaffolded reality-map statements from v2. Current status summary: `docs/marketing-sales-current-state.md`.

## 1. Status

The Marketing & Sales software is now **architecture/product-code complete**. Remaining enterprise work is release-candidate evidence and environment-specific configuration, not missing core architecture.

Do not interpret “100% built” as “every optional third-party connector is configured for every buyer.” SignalBoost distinguishes:

- a completed provider-neutral architecture;
- production methods that exist for specific connectors;
- descriptor-only catalog capabilities that honestly return `not_implemented` until implemented/configured;
- buyer/provider API approvals, credentials and account setup that remain environment-specific.

The 5,000-company Business Intelligence Corpus target is also a data-population target, not a software-build percentage.

## 2. Current system architecture

```text
Business goal / owner directive
        ↓
COS / COSA
        ↓
Deterministic rules + exact/semantic/durable reuse
        ↓
Enterprise Memory + Knowledge Graph + Continuous Learning + user memory
        ↓
Local COS reasoning
        ↓
confidence sufficient?
   ├─ yes → COS-owned result
   └─ no  → governed cloud-model fallback
        ↓
Goal Engine / Skill Registry / AI roles
        ↓
Prospect Intelligence
        ↓
Business Intelligence Corpus (internal first)
        ↓
Communication Hub / CRM Hub / Universal Adapter
        ↓
Human approval for consequential send/publish/spend/change
        ↓
Execution / publication / outreach
        ↓
Revenue Intelligence / outcomes
        ↓
Enterprise Memory + Knowledge Graph + learning + ROI telemetry
```

The defining design rule is **COS owns the intelligence; providers are replaceable compute/data/execution resources**.

## 3. COS-first intelligence

The support/intelligence path no longer routes hard questions directly to Claude/OpenAI by default.

Current order is:

```text
business/deterministic rules
→ exact/semantic/durable reuse
→ Enterprise Memory / Knowledge Graph / Continuous Learning / user memory
→ local COS reasoning
→ confidence gate
→ governed external AI fallback only if needed
```

The local answer path records provenance and confidence. Low-confidence/unavailable local reasoning records a durable learning gap instead of pretending COS answered independently.

Primary implementation: `saas/lib/ai/cos/cosFirstAnswer.ts` and the governed support/route path.

## 4. Business Intelligence Corpus

The corpus is the internal-first company-intelligence memory shared by Prospect Intelligence, COS, Enterprise Memory, Knowledge Graph and Revenue Intelligence.

Canonical behavior:

```text
company lookup
→ corpus
→ sufficient confidence/freshness?
   ├─ yes: return internal; providerCalled=false
   └─ no: queue refresh and, if permitted, try configured enricher
→ normalize/score
→ persist corpus
→ persist Enterprise Memory
→ persist Knowledge Graph
→ reuse next time
```

The workflow is complete. Population continues toward the ~5,000 target. Last observed production count on 2026-08-10 was 461 unique companies (9.22%); always use the live page/status endpoint for the current number.

Operator page: `/dashboard/data/business-intelligence-corpus`.

## 5. Prospect Intelligence

Prospect discovery is no longer a one-use external-provider result. It is connected to the corpus/reuse policy so known companies are consulted before commercial-provider spend.

Existing paid/discovered outreach history is reusable source material. Deduplication is based on company/domain identity, not outreach-row count. Provider calls are reserved for missing, stale or low-confidence intelligence when policy allows them.

## 6. Communication Hub

The Communication Hub is the provider-neutral outbound communications layer used by COS/Marketing & Sales.

Production transports documented in the current repo include:

- Gmail / Google Workspace via Gmail API;
- Microsoft 365 / Exchange Online via Microsoft Graph;
- generic SMTP with TLS/STARTTLS and AUTH LOGIN;
- Universal Email Adapter for buyer-configured HTTPS email APIs.

Outbound work remains subject to `draft_only`, `approval_required`, or `automatic` policy. Consequential sends must not bypass the applicable human-approval boundary.

See `saas/lib/communication-hub/README.md`.

## 7. CRM Hub and sales integration catalog

The sales integration catalog is provider-neutral and intentionally honest about production capability.

Current production CRM paths include:

- HubSpot contact/activity methods implemented directly;
- Salesforce through the shared production CRM adapter;
- Microsoft Dynamics 365 through the shared production CRM adapter;
- Pipedrive through the shared production CRM adapter;
- Zoho CRM through the shared production CRM adapter.

Other catalog entries may be descriptor-only or partially implemented. Catalog presence is not permission to claim a live production method. The shared registry returns `not_implemented` where no production action exists.

Primary files: `saas/lib/integrations/catalog-sales.ts` and `saas/lib/integrations/crm-production.ts`.

## 8. Universal Adapter / provider-neutral seams

The platform supports provider-neutral configuration and execution boundaries so buyers can connect additional APIs without rewriting COS or the Marketing & Sales core.

Relevant seams include:

- Universal Email Adapter in Communication Hub;
- Universal Revenue/operations provider paths;
- dynamic `provider_registry` + `universalRunner` for configuration-driven HTTP(S) actions;
- enterprise integration builder/provider-framework metadata.

Secrets remain backend-only references. Sensitive actions remain approval/audit governed.

## 9. Campaign, outreach and publishing lifecycle

COSA/Marketing & Sales produces real governed records, not chat-only plans.

Representative lifecycle:

```text
strategy / targeting
→ draft/assets
→ approval queue
→ human approve / hold / request edits / reject
→ configured connector execution
→ provider-confirmed result/live URL
→ measurement
→ Revenue Intelligence / learning feedback
```

A campaign is not “published” merely because a plan exists or an API call was attempted. Provider-confirmed success/live evidence is required where the connector supports it.

## 10. Revenue Intelligence and closed-loop learning

Revenue/event layers connect campaign/outreach/CRM outcomes back to reusable intelligence. The architectural goal is a closed loop in which replies, meetings, conversions, revenue and failures improve future targeting and execution instead of remaining isolated telemetry.

Outcome evidence should feed Enterprise Memory, Knowledge Graph/learning and ROI/cost-avoidance measurement where applicable.

## 11. Enterprise controls

The Marketing & Sales system inherits SignalBoost governance:

- owner/admin/RBAC boundaries;
- human approval for consequential actions;
- secret-safe provider configuration;
- tenant/org scoping;
- audit evidence;
- five-language localization guardrails;
- budget/provider-call governance;
- no fabricated success states;
- release-candidate gates for real environment evidence.

## 12. Release-candidate acceptance

The dedicated fail-closed profile is `saas/lib/release-candidate/marketing-sales.ts`.

It requires real passing evidence for:

- deployment;
- multi-tenant isolation;
- security/approval/secret handling;
- resilience/recovery;
- load/soak performance;
- observability/audit coverage;
- end-to-end integration across COS/EAE, Prospect, Corpus, Communication, CRM, Revenue, Enterprise Memory and Universal Adapter boundaries;
- documentation currency.

Missing evidence is `not_run`, not pass. A warning on a required gate prevents Release Candidate status. See `docs/enterprise-release-candidate.md`.

## 13. Current reality map

| Area | Current status | Notes |
|---|---|---|
| COS-first intelligence/fallback | Built | Internal/local first; cloud fallback only when needed. |
| Enterprise Memory / Knowledge Graph / learning | Built | Shared reusable intelligence layer. |
| Prospect Intelligence | Built | Connected to internal-first corpus policy. |
| Business Intelligence Corpus workflow | Built | 5,000-company population continues as data growth. |
| Communication Hub | Built | Gmail, Microsoft 365, SMTP, Universal Email Adapter documented as production transports. |
| CRM core | Built | HubSpot + production adapter paths for Salesforce, Dynamics, Pipedrive, Zoho. |
| Revenue Intelligence / feedback | Built | Outcome/event/revenue layers exist; validate environment-specific flows in RC. |
| Universal Adapter architecture | Built | Provider-neutral/dynamic adapter seams exist. |
| Campaign/outreach approval/execution | Built | Consequential actions remain governed. |
| Localization | Built/guarded | EN/ES/PT/PL/RU guardrails remain mandatory. |
| Enterprise RC evidence | Operational validation | Must be recorded from the real target environment. |

## 14. Developer rule

Do not rebuild this subsystem from the old v2 sequence. Before changing anything:

1. read `ONBOARD.md`;
2. read `docs/marketing-sales-current-state.md`;
3. inspect the exact current implementation;
4. identify a demonstrated regression, failed RC gate, measured improvement or new requirement;
5. preserve COS-first/internal-first/provider-neutral/human-governed architecture.
