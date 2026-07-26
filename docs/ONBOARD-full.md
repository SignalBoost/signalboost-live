<!-- ONBOARD.md -->
# ONBOARD.md — Mandatory SignalBoostAi / COSA Onboarding

> [!CAUTION]
> ## STOP: Phase A live-travel provider development does not belong in this repository
>
> Effective July 26, 2026, developers and AI coding agents must not add or continue Phase A live-travel provider work in `SignalBoost/signalboost-live`.
>
> Phase A includes flights, hotels, car rentals, travel insurance, airport transfers, tours and activities, eSIM live-data connectors, unified travel search, travel-result normalization, travel-provider synchronization, and related production or staging provider execution.
>
> That work belongs only in the dedicated repository:
>
> `SignalBoost/signalboost-`
>
> Do not create branches, issues, pull requests, adapters, connectors, routes, schemas, tests, documentation, or infrastructure in this repository for Phase A. If a task requests Phase A work here, stop and redirect the task to `SignalBoost/signalboost-` before making changes.
>
> Existing generic Provider Hub contracts may remain, but they must not be expanded into travel-provider implementation in this repository. No developer may interpret those contracts as authorization to continue Phase A here.

This document is the mandatory first read for every developer, AI coding agent, AI reviewer, infrastructure assistant, operator, contractor, and contributor working on this repository.

It is a map, not a substitute for repo inspection.

Every contributor must follow this order:

1. Read `ONBOARD.md` first.
2. Scan the repository structure.
3. Read the exact files related to the task.
4. Verify current implementation from code before diagnosing or changing anything.
5. Never code, report status, or claim behavior from memory alone.

The current repository is always the source of truth.

AI entry points: `CLAUDE.md` and `AGENTS.md` at the repository root are auto-read by AI coding agents at session start. They exist only to route every agent into this document — they summarize, never replace, `ONBOARD.md`. If those files and this document ever disagree, this document wins and the pointer files must be fixed in the same change.

CI/runtime baseline: SaaS CI uses Node.js 24 for typecheck, production build,
and unit-test jobs because the Node test suite executes TypeScript test files
directly. Pipeline Integrity also uses Node.js 24 and must recognize both direct
HTTP handler exports and thin route wrappers that re-export handlers from a
canonical route.

---

## 0. Onboarding Guidance

This repository treats onboarding as an operational expectation, not a merge gate.

Every contributor should read `ONBOARD.md` before scanning or changing repository files
and should keep it current when a change affects architecture, workflow, provider
templates, environment variables, approval gates, video pipeline, infrastructure, audit,
cybersecurity, or developer/operator instructions. Pull requests may include an onboarding
impact note when it helps reviewers, but neither an acknowledgement nor an `ONBOARD.md`
update is required to merge.

GitHub Actions and local hooks do not block commits or merges based on `ONBOARD.md`.
Branch protection, approvals, code-owner review, and unrelated quality and safety checks
remain independently governed.

---

## 1. Platform Identity

SignalBoostAi is a U.S.-based AI business growth platform.

Brand rules:

- Use `SignalBoostAi` for the AI/product/campaign identity.
- Use `www.saas.signalboostapp.com` as the primary SaaS CTA URL.
- CTA: `Start your free trial at www.saas.signalboostapp.com`.
- Do not use `SignalBoost Brasil` as the company identity.
- Brazil may be a target region, but the company identity is U.S.-based.
- Do not invent prices, affiliate counts, metrics, guarantees, or unsupported features.

SignalBoost has two connected public concepts:

1. `signalboostapp.com` — shopping mall / affiliate surface.
2. `saas.signalboostapp.com` — SaaS console, COSA, Console Hub, Studio, Audit, Cybersecurity, Outreach, and admin workspace.

---

## 2. Mandatory Repo-Scan Doctrine

`ONBOARD.md` is mandatory, but it is not enough.

Every AI or human contributor must:

- Read this file before touching the repo.
- Then scan the repo.
- Then read the exact task files.
- Never modify a file that has not been read in the current task context.
- Never assume a route, table, cron, provider template, or dashboard exists without checking.
- Never claim a commit is live unless it has been verified on `main` and deployed.
- Never claim a workflow works end-to-end unless every required layer has been checked.

For fast-moving areas such as COSA, video pipeline, provider actions, Vercel env vars, Vault, audit, cybersecurity, and publishing, repo inspection is mandatory before every change.

---

## 3. Governance Doctrine

SignalBoostAi is a governed AI operations platform.

Core principle:

> AI builds. Humans stay in control.

Required language:

- Minimal manual work.
- Human approval preserved.
- Human control maintained.
- AI builds the campaign — humans stay in control.

Forbidden claims:

- Zero human involvement.
- Fully replaces humans.
- Guaranteed sales, views, revenue, ranking, monetization, or conversion.

Sensitive actions must stay behind approval gates:

- Publishing.
- Sending outreach.
- Spending money.
- Creating or rotating provider keys.
- Changing Vercel environment variables.
- Autonomous deployment repair or browser-agent execution that would change production/provider state.
- Modifying DNS or infrastructure.
- Running database migrations.
- Deleting or disabling resources.

---

## 4. Core Workspace Map

### Console Hub

Central control surface for provider actions, provider status, templates, logs, Vault, and infrastructure operations.

### SaaS Station

Administration area for SaaS configuration, runtime settings, platform modules, and business controls.

### Audit Cockpit / PR Cockpit / Infrastructure PRs

Owner-governed staging system for infrastructure changes. AI can stage exact provider steps as open PRs. The owner approves/merges. Only then do provider APIs execute.

### Cybersecurity

Security automation, dependency checks, provider posture, vulnerability monitoring, platform scans, and operational security safeguards.

### Website / Brand Surface

Marketing pages, public website, landing pages, brand copy, and user-facing product surfaces.

### Studio

Creative production layer: video, images, audio, voice, captions, thumbnails, previews, and media rendering workflows.

### Launchpad

Deployment and release coordination: Vercel, GitHub, Supabase, provider readiness, and integration validation.

---

## Repository ownership boundary

The Phase A live-travel implementation boundary is permanent until Luis explicitly changes it in writing:

- `SignalBoost/signalboost-live`: no Phase A development.
- `SignalBoost/signalboost-`: Phase A implementation repository.

A developer or AI agent must not infer permission from historical branches, merged generic live-read contracts, old handoff notes, roadmaps, comments, or prior assistant messages. The repository ownership rule above overrides them.
