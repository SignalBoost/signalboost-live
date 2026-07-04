# ONBOARD.md — Mandatory SignalBoostAi / COSA Onboarding

This document is the mandatory first read for every developer, AI coding agent, AI reviewer, infrastructure assistant, and operator working on this repository.

It is a map, not a substitute for repo inspection.

Every contributor must follow this order:

1. Read `ONBOARD.md` first.
2. Scan the repository structure.
3. Read the exact files related to the task.
4. Verify current implementation from code before diagnosing or changing anything.
5. Never code, report status, or claim behavior from memory alone.

The current repository is always the source of truth.

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

### Owner/Admin
High-privilege administration. Use strict owner/admin role gates.

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
- Traffic channel planning.
- Region and language localization.
- Pre-launch prediction hypothesis.
- Post-launch measurement.
- Continuous optimization from results.

COSA decisioning should include:

- Recommended hero style.
- Recommended format.
- Scene structure.
- Traffic plan.
- Monetization plan.
- Prediction summary.
- Approval gate status.
- Quality score readiness.

Predictions are hypotheses, not guarantees.

---

## 7. Campaign Quality Gates

Before a campaign preview is treated as ready, COSA should check:

- Hero selected.
- Format selected.
- Visual scene design.
- Motion/non-text visual proof.
- Branded URL present.
- Traffic plan defined.
- Monetization plan defined.
- Localization correct.
- Approval gates enforced.
- Mined or starter signals included.
- Prediction summary included.
- Clear CTA visible or included.

For videos, final approval should require a final branded preview, not a raw base render.

---

## 8. Multilingual and Regional Doctrine

Core supported languages:

- English (`en`)
- Spanish (`es`)
- Portuguese (`pt`)
- Polish (`pl`)
- Russian (`ru`)

Default regional mapping for SignalBoostAi demo campaigns:

- English → United States / U.S. business audience (`us`)
- Spanish → LATAM, neutral Latin American Spanish (`latam`)
- Portuguese → Brazil, Brazilian Portuguese (`brazil`)
- Polish → Poland (`poland`)
- Russian → global Russian-speaking business audience, no political framing (`global_ru`)

Rules:

- Do not treat Spanish as Mexico-only unless explicitly requested.
- Do not create one generic translated video when five regional campaigns are requested.
- Create separate regional narratives with distinct hooks, pains, objections, CTAs, titles, descriptions, captions, tags, and tracking.
- Avoid political framing in Russian-language campaigns.

---

## 9. Video Pipeline Doctrine

COSA video production is staged.

Required pipeline:

1. Campaign row created.
2. Base render starts.
3. Base video completes.
4. Voice/narration and captions are created.
5. Final brand banner is burned into the video.
6. Final branded preview becomes visible.
7. Owner approval gate opens.
8. Publishing proceeds only after approval.
9. Published link and tracking are stored.
10. Measurement runs later.

Mandatory final branding:

- `SignalBoostAi`
- `www.saas.signalboostapp.com`

Raw/base renders are not final. They may be short, unvoiced, uncaptained, unbranded, or unsuitable for publication.

A final preview must include voice/captions where applicable and burned-in brand/URL.

Cost-control rule:

- Use premium providers such as FAL/Kling only when premium generation is required.
- Use FFmpeg/internal preview paths for low-cost drafts and pipeline tests when appropriate.

---

## 10. Publishing Doctrine

Publishing requires real provider configuration and owner approval.

Rules:

- Do not publish raw drafts.
- Do not publish unbranded videos unless the owner explicitly overrides.
- Do not publish without approval.
- YouTube metadata must be localized when campaign language is localized.
- Tracking links should include platform, language, and region where supported.
- Email the owner when publishing completes.

Preferred YouTube/channel identity: `SignalBoostAi`.

---

## 11. Email Approval Doctrine

The owner should be able to approve final videos from email.

Email approval should support:

- Watch preview.
- Approve and publish.
- Hold / not yet.
- Request edits with comments.

Security rules:

- Email approval links must be signed.
- Links must not expose secrets.
- Approval from email must still update the same governed campaign record.
- Edit comments must be stored on the campaign record.
- A hold action must prevent publishing until later approval.

---

## 12. Provider Templates, Vault, Vercel Env, and Infrastructure PRs

SignalBoostAi has an autonomous provider-template workflow.

The system can stage or execute provider operations through Console Hub templates, including:

- Provider API calls.
- Provider status checks.
- Provider key creation or rotation when supported by provider APIs.
- Vercel environment variable changes when a Vercel executor/template exists.
- Vault storage of secrets.
- Supabase actions.
- GitHub actions.
- Stripe actions.
- Email provider actions.
- AI provider actions.
- Video provider actions.
- Infrastructure/provider maintenance actions.

Mandatory rule:

Infrastructure, env-var, provider-key, DNS, migration, and other sensitive changes must normally be staged through Infrastructure PRs / Cockpit PRs.

Infrastructure PR doctrine:

- AI stages exact `templateId` + JSON payload steps.
- The PR stays open.
- Owner reviews it in the infrastructure cockpit.
- Owner clicks Merge/Approve.
- Only then provider APIs execute.
- Every action is policy-gated and audit-logged.

Never bypass this model for risky actions unless the owner explicitly instructs a direct live action.

---

## 13. Vault and Secret Rules

Secrets must never be hard-coded.

Rules:

- Store provider keys in Vault or approved environment variables.
- Never print full secret values.
- Never commit keys.
- Never expose tokens in logs, screenshots, email, PR body, or UI.
- Mask returned keys.
- Use Vault for long-term secret storage where available.
- Use Vercel environment variables for runtime values where appropriate.
- Use provider templates and Cockpit PRs for key/env workflows.

---

## 14. Audit, Compliance, and Cybersecurity

Audit and cybersecurity are core platform capabilities, not optional add-ons.

COSA and Console Hub should support:

- Provider action audit logs.
- Infrastructure PR audit trail.
- Security posture checks.
- Dependency monitoring.
- Provider configuration checks.
- Repo scanning for unsafe patterns.
- Secret leakage prevention.
- Approval enforcement.
- Brand/content compliance checks.
- Campaign quality scoring.
- Owner/admin role enforcement.

ChatGPT/OpenAI reasoning may be used as a lead audit/review layer when configured or requested. Claude/Anthropic may be used for other assistant or generation tasks, but audit leadership must follow the current project configuration and owner instruction.

Do not hard-code vendor hierarchy as a permanent fact if the repo configuration changes. Verify current model/provider configuration before changing audit behavior.

---

## 15. Design System Guardrails

SignalBoostAi uses a premium dark glassmorphism style.

Preferred visual language:

- Deep navy/black backgrounds.
- Gold accent: `#ffc300`.
- Cyan accent: `#1af0ff`.
- White primary text.
- Muted white secondary text.
- Subtle borders: `rgba(255,255,255,.08-.14)`.
- Rounded cards, usually 14-24px.
- Glass panels with paired `backdropFilter` and `WebkitBackdropFilter` when used.
- Inline styles are common in legacy SaaS dashboard pages.

Rules:

- Read the existing file before styling.
- Match the file’s current style convention.
- Do not introduce random UI libraries, icon libraries, fonts, or Tailwind unless the file already uses that pattern.
- Do not break responsive layout.
- Do not create panels/modals without an obvious close path.
- Do not hide important actions behind clipped or fixed-height containers.

---

## 16. Developer and AI Agent Rules

Every contributor must:

- Read `ONBOARD.md` first.
- Then scan the repo.
- Then read exact files before changing them.
- Treat repo code as source of truth.
- Use current implementation over memory.
- Be honest about what was changed and what remains undone.
- Never claim tests/builds passed unless actually run or reported by CI.
- Never claim deployment is live unless verified.
- Never skip approval gates.
- Never expose secrets.
- Never publish, send, spend, delete, rotate, or modify infrastructure without the correct gate.

For code changes:

- Prefer small focused commits.
- Preserve existing behavior unless task requires behavior change.
- Do not rewrite large files unnecessarily.
- Check imports, types, and route paths.
- Be explicit about out-of-band steps such as Vercel env vars, provider dashboard setup, vault keys, or merge/deploy requirements.

---

## 17. Status Language

Use precise status language.

Allowed:

- `draft`
- `waiting_approval`
- `approved`
- `queued`
- `running`
- `rendering`
- `ready`
- `completed`
- `published`
- `failed`
- `held`
- `changes_requested`

Never call something complete if only one layer is done.

Examples:

- A strategy written in chat is not a campaign.
- A campaign row without video is not a preview.
- A raw base render is not a final video.
- A branch commit is not live production.
- A staged Infrastructure PR has not executed provider actions.
- A Vercel env var is not active until the correct deployment/redeploy path completes.

---

## 18. Mandatory Final Reminder

This file is the starting point.

It does not remove the duty to inspect the repo.

Every developer and AI agent must read this file first, then scan the repository, then read the task-specific files, then act.

If a claim cannot be verified from current code, live provider result, database state, or deployment output, do not present it as fact.
