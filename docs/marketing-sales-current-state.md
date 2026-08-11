# Marketing & Sales — Current State and Developer Handoff

> Read `ONBOARD.md` first. This document is the current Marketing & Sales status reference as of 2026-08-10 and supersedes older draft/reality-map statements that describe this subsystem as partially scaffolded.

## Status

- **Core Marketing & Sales software:** 100% built at the architecture/product-code level.
- **Enterprise release-candidate acceptance:** not automatically 100%. It becomes Release Candidate only when real target-environment evidence passes every required RC gate.
- **Business Intelligence Corpus architecture/workflow:** complete. Corpus population is operational data growth, not unfinished architecture.
- **Last production corpus count observed on 2026-08-10:** 461 unique reusable companies out of the 5,000-company target (9.22%). Treat this as a dated operational observation; always read the live status endpoint/page for the current count.

## Current execution architecture

```text
Owner / user goal
      ↓
COS / COSA
      ↓
Deterministic rules + exact/semantic/durable reuse
      ↓
Enterprise Memory + Knowledge Graph + Continuous Learning + user memory
      ↓
Local COS reasoning
      ↓
Confidence gate
  ├─ sufficient → return/use COS result
  └─ insufficient/unavailable → governed external-model fallback
      ↓
Goal Engine / skills / roles / governed execution
      ↓
Prospect Intelligence / Business Intelligence Corpus
      ↓
Communication Hub / CRM Hub / Universal Adapter
      ↓
Human approval where consequential
      ↓
Send / publish / execute
      ↓
Revenue Intelligence + outcome telemetry
      ↓
Enterprise Memory / Knowledge Graph / learning update
```

### COS-first rule

Claude/OpenAI are not the default brain. The support/intelligence path first attempts SignalBoost-owned intelligence and local reasoning. A cloud model is an escalation path when the local path is not configured, fails, or scores below the configured confidence threshold. Low-confidence gaps are persisted for learning rather than silently treated as successful local reasoning.

Primary implementation: `saas/lib/ai/cos/cosFirstAnswer.ts` and the governed support/route orchestration.

## Business Intelligence Corpus

Canonical flow:

```text
Company need
   ↓
Internal corpus lookup
   ↓
confidence + freshness sufficient?
   ├─ yes → use internal record; no provider call
   └─ no  → queue refresh / call configured provider if permitted
                ↓
             normalize + validate + score
                ↓
             corpus upsert
                ↓
             Enterprise Memory
                ↓
             Knowledge Graph
                ↓
             reuse next time
```

Important rules:

- Never rediscover a company that SignalBoost already knows well enough.
- Provider fallback is allowed only when internal confidence/freshness is insufficient.
- Existing paid/discovered outreach history is reused first.
- The corpus dashboard is owner/admin operational tooling at `/dashboard/data/business-intelligence-corpus`.
- The 5,000 target is a population target, not a software-completion gate.

Primary implementation: `saas/lib/business-intelligence-corpus/`, `saas/lib/prospect-intelligence/corpus-policy.ts`, and `saas/lib/prospect-intelligence/corpus-telemetry.ts`.

## Marketing & Sales capability inventory

The major architecture is present and should be reused, not rebuilt:

- COS-first intelligence, Enterprise Memory, Knowledge Graph, Continuous Learning, semantic/exact/durable reuse, local reasoning and cloud fallback.
- Goal Engine, reusable Skill Registry, enterprise AI roles and governed execution.
- Prospect Intelligence with internal-first Business Intelligence Corpus integration.
- Communication Hub with Gmail/Google Workspace, Microsoft 365/Exchange Online, SMTP and a Universal Email Adapter.
- CRM production paths for HubSpot plus the shared production CRM adapter used by Salesforce, Dynamics 365, Pipedrive and Zoho CRM.
- Revenue event/intelligence/operations layers and outcome feedback.
- Universal Adapter/provider-neutral integration architecture.
- Campaign/COSA workflows, outreach queues, human approval gates, publishing connectors and measurement loops.
- Five-language platform localization guardrails (en/es/pt/pl/ru).
- Enterprise governance, audit, safety and release-candidate evaluators.

Descriptor-only or buyer-unconfigured integrations are not automatically “live.” The shared integration registry intentionally returns `not_implemented` for capabilities that do not have a production method. Do not convert catalog presence into a false production claim.

## Release-candidate acceptance

Marketing & Sales now has a dedicated fail-closed RC profile in `saas/lib/release-candidate/marketing-sales.ts`. It requires passing evidence in all eight categories:

1. production deployment;
2. tenant isolation;
3. security/authorization/approval/secret handling;
4. backup and recovery;
5. load/soak performance;
6. observability/audit coverage;
7. end-to-end integration across COS/EAE, Prospect, Corpus, Communication, CRM, Revenue, Enterprise Memory and Universal Adapter boundaries;
8. current documentation.

Missing evidence is `not_run`, not pass. Warnings on required gates prevent RC status. Never manufacture operational evidence from architecture, unit tests or a green Vercel build.

Use `evaluateMarketingSalesReleaseCandidate()` to produce the deterministic snapshot from recorded real-environment evidence.

## What remains

There is no identified missing core Marketing & Sales architecture in the current scan. Remaining work is operational rather than foundational:

- continue growing/refreshing the 5,000-company corpus without paying twice;
- record and pass the real RC evidence set for the target production/enterprise environment;
- remediate any regression exposed by those exercises;
- keep provider-specific capability claims honest as buyer credentials/API approvals vary.

Do not reopen completed foundations merely to increase a completion percentage. New engineering work should be driven by a demonstrated regression, a failed RC gate, a measured cost/quality improvement, or a new business requirement.
