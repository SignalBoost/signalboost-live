# Portable Marketing & Sales Department — Architecture & Design (v2, aligned)

**A plug-and-play, COS-led department any enterprise can adopt by implementing one seam — built on SignalBoost's existing portable-module conventions.**

> This v2 supersedes the earlier draft. It is reconciled with the repo as of this commit: the `console-core`/`console-host` engine pattern, the `lib/cos` portable-module pattern, the Command Control Charter, and the live `outreach_queue` schema.

## 1. What it is
An autonomous Marketing/Sales department led by COS (Head of Department). COS initiates campaigns, builds them in five languages, surfaces them to a human only at an approval gate, publishes the approved ones, measures results, and improves next cycle. It is **portable** (lift one folder, implement one seam) and **enterprise-ready** (org-scoped, audited, secret-safe).

## 2. It is an assembly, not greenfield
Most of the spine already exists and is reused, not rebuilt:
- **Targeting brain (Stage 1):** `lib/cos/` mining + predictive (K-means/Apriori/forecast), already portable.
- **Action engine + publishers (Stage 4):** the `console-core` pattern — `validate → permission → execute → log`, self-registering executors, `AuthAdapter`/`LogAdapter` seams.
- **Honesty for gated platforms:** the existing `INCOMPLETE_ACTION_IDS` mechanism (hides unfinished actions in UI, refuses them server-side).
- **Distribution + approval (Stage 3):** the live `outreach_queue` (canonical) + the COSA video review queue (`cos_video_review_queue`) + the navbar approval bell.
- **Audit/logging:** `lib/hub/audit.ts` via the `LogAdapter` seam.

New code is the **department facade**: a barrel, a host seam, a lifecycle/director, and the publishing executors.

## 3. Portability seam (matches console-core)
The module imports nothing app-specific. It exposes one barrel and depends on injected adapters, mirroring `console-core`:
```
marketing-sales-core/
  index.ts            public barrel (the seam a buyer imports)
  types.ts            Campaign, Draft, Metric, lifecycle status — portable contracts, no app imports
  lifecycle.ts        legal transitions + who may make them (pure)
  director.ts         the autonomous Head: scheduled decide → initiate → drive
  intake.ts           directive → intent → audience (wraps lib/cos mining)
  drafting.ts         multilingual draft build (copy/script; asset via a publisher)
  approval.ts         approve / request-edits / reject / archive + audit hooks
  metrics.ts          ingest CTR/ROI/retention; feed director next cycle
  store.ts            MarketingStore interface + Supabase adapter (mirrors lib/cos MiningStore)
  i18n.ts             cosT-style resolver
  i18n/dictionaries.ts bundled en/es/pt/pl/ru (source of truth, no English default)
  executors/          publishers, self-registering (console-core style)
    types.ts          PublishExecutor contract
    youtube.ts        real (OAuth + Data API)
    tiktok.ts         registered but listed in INCOMPLETE_ACTION_IDS (platform approval pending)
    linkedin.ts       same
  migration.sql       schema (ms_* tables + RLS + audit), idempotent
marketing-sales-host/  the ONLY SignalBoost-coupled folder
  signalboostHost.ts  AuthAdapter bridge (verified session + role) → createHost(auth, log?)
  hostConfig.tsx      branding, panel router, catalog (mirrors consoleHostConfig.tsx)
```
App layer stays thin: `app/api/marketing-sales/<action>/route.ts` (gated: resolve actor → core) and `app/dashboard/marketing-sales/*` pages that re-export `marketing-sales-core/ui/*`.

## 4. Seams (reuse console-core contracts)
- **AuthAdapter:** `getCurrentUser() → { id, email?, role }`, `hasPermission(user, action)`; role ∈ `owner | admin | operator | viewer`.
- **LogAdapter:** `logAction(event)` — defaults to structured log; swappable for Datadog/etc.
- **MarketingStore:** `select/insert/update/count`, every row org-scoped. Supabase adapter live; another backend = another adapter (the `lib/cos` MiningStore precedent).
- An adopter swaps `marketing-sales-host/` only; the core is untouched.

## 5. Publishers are honest executors
A publisher registers via `registerExecutor({ providerId, actionId, schema, run })` and reads secrets from env via the host. `run()` returns `{ ok, liveUrl?, externalId? }` or `{ ok:false, error }`. **A campaign reaches `published` only when an executor returns a real `liveUrl`.** TikTok/LinkedIn are registered but flagged in `INCOMPLETE_ACTION_IDS`, so they are hidden in the UI and refused server-side until platform approval — the module cannot fabricate a publish.

## 6. Lifecycle (charter-aligned)
```
intake → drafting → needs_approval → ┬ approved → publishing → published → measuring
                                     ├ edits_requested → drafting
                                     ├ rejected
                                     └ archived
```
COS drives every transition **except** `needs_approval → approved | edits_requested | rejected`, which a human owns. This satisfies the Command Control Charter: COS may **recommend, draft, document, and execute-to-the-gate**; it may **not** set strategy or force a decision. The human approval **is** the management decision. Decision outcomes use the charter vocabulary (Open / Acknowledged / Resolved / Accepted Risk) and are written to an immutable audit row. UI uses business-oriented language and the one-screen HMI rule (split the monitor, don't lengthen the page).

## 7. The autonomous director (COS as Head)
Registered via the host scheduler, per org it: pulls signals (mining + prior metrics) → decides what to initiate → runs intake/drafting → drops drafts in the approval queue (the bell pings the human) → on approval calls enabled executors and records **real** results → ingests metrics for next cycle. Its report is assembled only from executor results and tool returns — the same honesty discipline that fixed the outreach phantom-send problem, applied to an autonomous loop.

## 8. Data model (org-scoped, host-provisioned via migration.sql)
`ms_campaigns`, `ms_drafts` (per-lang), `ms_publish_results` (connector, live_url, ok), `ms_metrics`, `ms_audit` (append-only). Reuses live `outreach_queue` for outreach-channel drafts and `cos_video_review_queue` for video review; both map onto the department's review surface. Every table carries `org_id` so an enterprise's brands stay isolated without the module running a tenancy system.

## 9. Enterprise fit (why it sells)
RBAC via `AuthAdapter.role`; immutable `ms_audit`; connector secrets only through host crypto/env, never in core or logs; `org_id` isolation; bundled five-language i18n; compliance **evidence** (audit trail + data-handling hooks — certification stays organizational); Console surfaces queue depth, publish success/failure, connector health.

## 10. Honest reality map
| Stage | Status | Note |
|---|---|---|
| 1 Initiate / mine / predict | Real (reuse `lib/cos`) | Wrapped behind intake/drafting. |
| 2 Multilingual video | Wall — money | Drafts carry `asset_url:null` until a paid render/TTS executor is funded. |
| 3 Approval + audit | Real today | Queue, review page, bell, audit exist. |
| 4 Publish YT/TikTok/LinkedIn + monetize | One real, two gated | YouTube upload buildable; auto-monetization not API-settable by anyone; TikTok/LinkedIn need platform approval. |
| 5 Monitor / retrain | Real after Stage 4 runs | Cannot learn from performance that doesn't exist yet. |
| 6 Executive console | UI buildable now | KPIs fill in as Stages 4–5 produce numbers. |

## 11. Adoption checklist (plug-and-play)
1. Copy `marketing-sales-core/`. 2. Run `migration.sql`. 3. Implement `marketing-sales-host/` (AuthAdapter + config + secrets). 4. Mount the thin app routes/pages. No core edits, ever.

## 12. Packaging note
Stays **in-repo as a barrel** (`index.ts`) for now — extractable later to `packages/marketing-sales-core` in one local pass, per `docs/console/package-extraction.md`. Do **not** attempt the packages move incrementally.

## 13. Build sequence
1. Scaffold the shell (`types`, `lifecycle`, `store` interface, `host` seam, executor registry + `types`, `i18n/dictionaries`, `migration.sql`, `index.ts`) — compiles, does nothing yet. 2. First vertical: wire the existing approval queue end-to-end through the module. 3. Director loop. 4. YouTube executor. 5. Console UI. 6. `signalboostHost.ts` last — proving the core never depended on it.