# Audit Center — Backlog & Priorities

_Maintained by the dev. Ordered by my read of impact vs. effort. P0 is in the
drop that accompanies this doc; everything below is queued._

---

## DONE (shipped to main)
- Deterministic findings engine, full-provider collectors, processor (LLM egress sanitizer).
- Five MVP reports — Executive Summary, Identity & Access, Provider Inventory, Secrets & API Key Exposure, Remediation Roadmap. Owner-gated, 5 languages, deterministic core.

## P0 — Cost controls foundation _(this drop)_
- `user_audit_usage` table (token + cost ledger).
- `lib/ai/usage.ts`: `cachedSystem()` (ephemeral prompt cache) + `recordUsage()` + `estimateCostUsd()`.
- Wired into the audit Executive-Summary Anthropic call: caching on the static system prefix, token logging per call.
- **Action required:** run the migration; **verify the placeholder USD rates in `usage.ts`** against current provider pricing before using `cost_usd` for invoicing.

---

## P1 — Apply caching + metering to the Chief of Staff (support route) — HIGHEST $ IMPACT
The audit call is owner-only and low-volume; the **real token cost** is `app/api/support/route.ts` — a large static system prompt plus ~25 tool definitions, called repeatedly. This is where prompt caching delivers the advertised input-cost reduction.
- Change: pass `system: cachedSystem(systemContent)` and mark the tools block cacheable; capture `msg.usage`; `recordUsage({ feature: 'support.chief-of-staff', ... })`.
- Low risk in logic, but it's a large critical file — do it as a careful, isolated change.

## P2 — Meter the customer-facing Concierge (enables EXTERNAL-user billing) — the stated goal
Billing/throttling *external* users requires instrumenting the customer-facing call (Concierge, OpenAI), not the owner-only audit.
- Capture OpenAI usage (`prompt_tokens` / `completion_tokens`); `recordUsage({ feature: 'concierge', userId })`. (OpenAI caches automatically — no `cache_control` needed.)
- Add a **pre-call throttle check**: sum the user's recent `user_audit_usage`, and block / degrade to a cheaper model when over the plan limit.

## P3 — Billing & throttle POLICY _(needs your product input)_
Measurement is built; policy is a decision: per-plan monthly token/cost caps, and over-limit behavior (hard block vs. degrade-to-cheaper-model vs. metered overage). I can implement once you set the numbers.

## P4 — Usage dashboard
Read `user_audit_usage`: owner view of per-user cost, and a per-user self-view of their own consumption. Closes the loop on "track exactly what each external user costs us."

## P5 — Audit Center landing page + nav
A `/hub/audit` index linking the five reports with one-line descriptions, plus a Hub nav entry. Small, improves discoverability now that the reports exist.

## P6 — PDF / CSV export
Per-report export (the deliverable a B2B buyer actually keeps). PDF for the exec summary, CSV for the tabular reports.

## P7 — "Create PR fix" from Remediation
Wire actionable Remediation items with a `suggestedFixTemplateId` to the existing `infrastructure_prs` / pr-engine flow, so a fix can be staged as a PR from the report.

## P8 — Audit run history / trends
Persist each run's score + counts to show readiness trend lines over time.

---

### Why this order
P1–P2 are where the money is (high-volume calls); P0 built the rails they ride on. P3 is blocked on your pricing decision. P4–P8 are product polish that's valuable but not cost-critical. If you'd rather I jump to P5/P6 for a sales-demo polish pass instead, say so — otherwise I'll proceed P1 → P2.
