# ONBOARD.md — Mandatory SignalBoostAi / COSA Onboarding

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

## 0. Mandatory Enforcement

This repository treats onboarding as an operational control, not a suggestion.

Every pull request that changes platform, COSA, provider, infrastructure, workflow, security, video, audit, dashboard, Supabase, or Vercel behavior must:

- Confirm in the PR body that `ONBOARD.md` was read before scanning or changing files.
- Update `ONBOARD.md` when the change affects architecture, workflow, provider templates, environment variables, approval gates, video pipeline, infrastructure, audit, cybersecurity, or developer/operator instructions.
- Explain the onboarding impact, or explicitly state that there is no onboarding behavior change.

Mandatory acknowledgement text for PRs:

```text
ONBOARD.md read before repo scan: YES
```

If a PR fails onboarding enforcement, the failure message must explain:

1. What failed.
2. Why it failed.
3. Which files triggered the rule.
4. Exactly how to fix it.

The failure should never be vague. Developers must know immediately what to do.

Important limitation: GitHub cannot technically stop someone from cloning or opening a file locally before reading this page. The repository enforces this through PR checks, PR templates, branch protection, review doctrine, and owner expectations. Any contributor who bypasses the onboarding order is violating repository policy.

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

### Browser Runtime (Mission 001)

The portable Browser Runtime lives in `saas/lib/browser-runtime` and must remain independent of Next.js UI, Supabase, and provider SDKs. Mission 001 advances the runtime only through bounded, testable slices.

The executable sandbox adapter uses adapter ID `signalboost.sandbox.v1` and the isolated `/browser-sandbox/login` route. Sandbox tasks must:

- use only `http` or `https` origins explicitly listed in `allowedOrigins`;
- re-check the live page origin after navigation and before and after click, fill, wait, and screenshot steps;
- resolve secrets only while the live page remains on an approved origin, then re-check immediately before filling;
- reference credentials and the test setting through secret references such as `sandbox://credentials/email` and `sandbox://settings/value`, never literal values;
- fill the harmless sandbox value and capture evidence before the approval boundary;
- stop at a checkpoint requiring approval before any protected save;
- never include a protected-save click in the pre-approval task;
- require a separately signed, task-bound approval token for the post-approval sandbox save task;
- verify the visible `save-success` state and capture evidence after the protected save; and
- remain local/test-only until a separately reviewed production provider adapter is approved.

The sandbox launch profile rejects `execute_change` tasks. The harmless sandbox protected-save phase remains `prepare_change` and is allowed only through a separate bounded task and approval token. Production/provider state changes, real credential use, saves, redeploys, financial actions, and other sensitive operations remain outside Mission 001 unless Luis explicitly approves them through the existing governed approval flow.

### Owner/Admin

High-privileged administration. Use strict owner/admin role gates.

### Marketing + Sales Engine / COSA

COSA is the Campaign Operating System / Campaign Orchestration and Signal Agent. It is the autonomous marketing and sales engine for strategy, outreach, videos, localization, approval, publishing, tracking, learning, and optimization.

---

## 5. COSA Mission

COSA turns an owner command into governed business execution.

Typical COSA flow:

1. Owner gives one command.
2. COSA interprets goal, audience, offer, channel, language, and region.
3. COSA builds marketing and sales strategy.
4. COSA creates campaign assets: script, video, captions, metadata, outreach copy, tracking links, titles, tags, descriptions, and CTA.
5. COSA creates real approval records, not chat-only text.
6. COSA renders final branded previews.
7. Owner approves, holds, rejects, or requests edits.
8. After approval, COSA publishes automatically when configured.
9. COSA tracks performance.
10. COSA learns and recommends next actions.

Important: a written campaign plan in chat is not a real campaign. A real campaign must create a database row and appear in the appropriate dashboard.

---

## 6. COSA Strategy, Algorithms, Prediction, and Optimization

COSA should behave like a senior marketing strategist, sales strategist, campaign analyst, and operator.

It should apply:

- Ideal customer profile selection.
- Buyer pain identification.
- First-three-second hook design.
- Sales objection handling.
- Emotional trigger mapping.
- Rational business reason to act.
- Offer and CTA design.
- Funnel and monetization planning.
