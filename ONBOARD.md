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
- reference credentials through secret references such as `sandbox://credentials/email`, never literal values;
- capture evidence before the approval boundary;
- stop phase 1 at a checkpoint before any protected save;
- persist a serializable execution record containing the exact completed and remaining step lists while retaining the live browser session through a separate runtime registry;
- require a second, separately signed token bound to the same task, incident, checkpoint, approved origins, exact remaining step IDs, one exact execution ID, and the digest of the phase-one approval that created the retained session;
- resume only the retained post-checkpoint steps without replaying navigation, credential entry, or preparation steps;
- permit protected-save steps in the task declaration only after the checkpoint, while the phase-1 token must neither authorize nor execute those steps;
- independently verify the complete two-phase evidence sequence before completion is accepted; and
- remain local/test-only until a separately reviewed production provider adapter is approved.

Every terminal Browser Runtime result (`paused`, `completed`, or `failed`) must include the deterministic verification report produced by the portable verifier. Callers must not treat a paused or completed execution as valid unless that report has status `verified`; a failed execution must retain a failed verification report for audit and diagnosis.

The current resumable implementation retains browser sessions in process. A durable execution store may persist serializable records, but a process restart invalidates the live session and must fail closed rather than replaying or reconstructing protected steps automatically.

The sandbox launch profile rejects `execute_change` tasks. Production/provider state changes, credential use, saves, redeploys, financial actions, and other sensitive operations remain outside Mission 001 unless Luis explicitly approves them through the existing governed approval flow.

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

## 8A. Zero-Manual-Entry Master Schema Doctrine

`docs/zero-manual-entry-ui.md` defines the mandatory enterprise UI architecture, and `saas/config/master_config_schema.json` is the authoritative catalog of approved selectable values.

Rules:

- COSA, Campaign Studio, Launchpad, and new enterprise workflows must consume typed adapters derived from the master schema instead of defining page-specific option arrays.
- Goals, audiences, tones, regions, industries, roles, platforms, languages, formats, offer types, and CTA strategies must be changed in the master schema through the normal pull-request process.
- Enterprise campaign-generation inputs must use validated source URLs, structured selectors, or bounded generated suggestions; unrestricted campaign prose fields are not permitted except for the documented exceptions.
- Automated extraction and draft generation may occur before approval, but publishing, sending, spending, launching, deletion, and infrastructure changes remain behind the final HMI approval gate.
- Region entries must preserve the canonical campaign IDs `us`, `latam`, `brazil`, `poland`, and `global_ru`. Display labels or macro-region groupings must never replace or collapse those IDs.
- If a component, prompt, or local option list conflicts with the master schema and this doctrine, the master schema and this doctrine win.

---

## 9. Video Pipeline Doctrine

COSA video production is staged.

Required pipeline:

1. Campaign row created.
2. Base render starts.
3. Base video completes.
4. Voice/narration and captions are created or a cost-safe fallback advances the render.
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

Cost-control rules:

- Use premium providers such as FAL/Kling only when premium generation is explicitly required and approved.
- Use FFmpeg/internal preview paths for low-cost drafts and pipeline tests when appropriate.
- Failed tests must not keep spending money.
- Automatic retries must not use paid media providers unless a separate owner-approved paid-provider flag or workflow allows it.

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

## 12. Console Hub Provider Templates, Vault, Vercel Env, and Infrastructure PRs

SignalBoostAi has an autonomous provider-template workflow.

Provider templates are not just static documentation. In Console Hub, provider templates are live action definitions used by the app to render provider cards, actions, form fields, and operational workflows.

Important doctrine for developers:

- The Console Hub provider templates are the first place to check when a provider action, provider variable, live provider panel, or provider workflow is discussed.
- Do not ask the owner to repeatedly explain provider-template architecture. Read `ONBOARD.md`, then inspect `saas/lib/hub/console-catalog.ts`, `saas/lib/hub/provider-templates*.ts`, and the matching provider executors/routes.
- The provider templates define the provider action names, API service names, methods, endpoints, form fields, and live action IDs used by the console.
- Environment variable names are safe to reference in code. Secret values must never be exposed.
- A provider template can represent a live provider action, but the actual secret value may still live in Vercel environment variables, Vault, or provider-specific storage.
- Do not confuse the variable name with the secret value. Example: `OPENAI_API_KEY` is the safe variable name; the actual key value must remain hidden.
- If a provider action exists in Console Hub, inspect the template and executor before claiming the action is missing.
- If a provider template is changed, removed, renamed, or routed differently, update this onboarding document in the same PR.

The autonomous Vercel supervisor PoC listens for signed failed-deployment webhooks at `/api/autonomous-supervisor/vercel`, normalizes incidents, asks Gemini for JSON-only diagnosis when configured, and only stages UI-agent/env-var repairs as gated Infrastructure PR proposals. Browser-agent backup must fill values, capture a screenshot for Hub review, and hold for explicit owner approval before saving, redeploying, or changing production state.

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

## 12B. BYOK Campaign Studio Doctrine (public /agency)

The public agency page is the BYOK Campaign Studio: one prompt produces a complete organic campaign (YouTube copy, LinkedIn posts, press release) generated with the USER'S OWN AI provider key.

Rules:

- Users pay AI/media providers directly with their own keys. Platform keys are never used in BYOK user flows, and the platform never absorbs per-use AI costs.
- Positioning: sell the outcome ("your entire campaign from one prompt"), not pay-as-you-go. Pay-as-you-go is supporting detail.
- Provider integration follows the adapter/driver model in `saas/lib/agency/userProviders.ts`: catalog entry + small adapter implementing the shared contract. The engine, UI, and approval flows never change per provider.
- Only advertise a provider as live once its adapter exists. A user key unlocks billing, not capability.
- Logged-in users store keys once in `user_provider_keys` (AES-256-GCM via `lib/vault/crypto`, service-role access only, per-user unique). Anonymous users may paste a key per request; it is used in memory only, never stored, never logged.
- Press dispatch from the studio always inserts `press_campaigns` rows as `pending_owner_review` (`force_owner_review`). The journalist email is sent only after owner approval in `/dashboard/marketing/press-outreach` (`PressOutreachStudio`), via `dispatchPressReleaseToEditor` (Resend, owner BCC).
- Public generation and press-queue endpoints are IP rate-limited and origin-checked. Keep those guards when editing.

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

## 18. Mandatory ONBOARD Maintenance Rule

`ONBOARD.md` must stay current.

A PR must update this file when it changes any of the following:

- COSA behavior, campaign flow, video rendering, approval, publishing, localization, prediction, or optimization.
- Console Hub provider templates, provider routing, provider cards, provider executors, provider variable names, provider live panels, or provider action behavior.
- Vercel environment-variable handling, Vault handling, provider-key handling, secrets, DNS, infrastructure, workflow, or CI/CD behavior.
- Supabase schema, storage buckets, service-role behavior, migrations, or data model assumptions.
- Audit, cybersecurity, approval gates, owner/admin gating, or compliance behavior.
- Developer instructions, build/test/deploy process, or repo governance.

If a critical file changes and no user-facing or architecture-facing behavior changed, still add a short maintenance note under the change log below saying:

```text
No onboarding behavior change; mechanical/refactor-only update.
```

This keeps the onboarding document current and prevents future developers or AI agents from relying on stale assumptions.

---

## 19. Onboarding Change Log

Use this section for short notes when architecture, provider behavior, platform workflow, or governance rules change.

- 2026-07-07: Added explicit Console Hub provider-template doctrine. Provider templates are live app action definitions, not just documentation. Developers must inspect provider templates and matching executors/routes before asking the owner to explain provider architecture.
- 2026-07-07: Added stronger onboarding enforcement doctrine. PRs must acknowledge ONBOARD was read before repo scan, and critical changes must keep ONBOARD current or the check must fail with a clear reason and fix instructions.
- 2026-07-08: Added repository-enforced onboarding controls: PR template acknowledgement, stable required check naming, critical-file CI enforcement with an exact mechanical/refactor-only exception, CODEOWNERS coverage for sensitive areas, and branch-protection setup documentation.
- 2026-07-14: Added BYOK Campaign Studio doctrine (Section 12B): user-key-funded generation, adapter/driver provider model, per-user encrypted key vault (`user_provider_keys`), owner-gated real press dispatch, outcome-first positioning rule.
- 2026-07-14: Added AI entry-point files `CLAUDE.md` and `AGENTS.md` at the repository root. AI coding agents auto-read these at session start; they route every agent into ONBOARD.md. Reason: onboarding enforcement previously ran only on pull requests, which never fire in the owner's direct-to-main GitHub-web workflow, so AI agents never encountered this document.
- 2026-07-14: Added the zero-manual-entry master-schema doctrine (Section 8A), made `saas/config/master_config_schema.json` authoritative for enterprise selectors, preserved canonical campaign region IDs, and reaffirmed the final HMI approval gate for live actions.

---

- 2026-07-15: Added persistent AI Dock layout doctrine implementation: global SaaS pages now render through a shared AppShell with a reserved right-side assistant column on desktop/tablet, collapsed dock tab state, and mobile bottom-sheet behavior so Concierge interactions no longer overlay workspace forms or actions.

- 2026-07-15: Added Issue #205 Enterprise Memory doctrine implementation: enterprise memory tables, canonical URL fingerprint deduplication, memory-aware Enterprise Intelligence reuse, refresh-job concurrency guards, campaign/approval/confidence history, and CI guard scripts (`verify:issue-205`) for enterprise architecture, localization, and pipeline regressions.

- 2026-07-15: Refactored Console Hub provider-action form rendering toward zero-manual-fill controls: fixed option fields now reuse the shared searchable selector, live remote selectors no longer fall back to unrestricted manual typing, dependent selectors reset when parent selections change, single live options auto-select, and Vercel deployment target selectors default to production while keeping existing approval/confirmation gates.

- 2026-07-15: Restored enterprise approval CI guard coverage in both the repository root and `saas/` workspace so root-level and SaaS package checks execute the same owner-approval/version-binding enforcement before merge.

- 2026-07-15: Added the autonomous Vercel supervisor PoC: signed failed-deployment webhook intake, normalized incident payloads, Gemini JSON diagnostics, and gated browser-agent/env-var repair staging through Infrastructure PRs with owner approval required before save or redeploy.

- 2026-07-15: Added Mission 001 executable browser sandbox adapter: portable bounded task construction, local `/browser-sandbox/login` test portal, secret-reference credential resolution, evidence capture, and a mandatory approval checkpoint before any protected save. No production provider or credential is connected.

- 2026-07-15: Hardened Mission 001 origin confinement: the runtime now validates the live page after navigation and around every browser interaction, rejects redirect escapes, and re-checks origin after secret resolution before filling.

- 2026-07-15: Integrated deterministic Mission 001 verification into every terminal Browser Runtime result. Paused and completed executions are valid only when the embedded verification report is `verified`; failed executions retain a failed report for audit and diagnosis.

- 2026-07-15: Added Mission 001 in-process resumable continuation: phase 1 stores the exact execution boundary and retains the live session separately, phase 2 requires a new checkpoint-bound token for only the remaining steps, and completion verifies the combined evidence without replaying login, credential entry, or preparation. Missing or crashed sessions fail closed.

- 2026-07-15: Bound Mission 001 phase-two approvals to one exact retained execution ID and the originating phase-one approval-token digest. Cross-execution replay and phase-one token substitution now fail closed before a retained session can be consumed.

- 2026-07-16: Added a local Mission001 GitHub commit helper that reads a GitHub PAT from an untracked root `.env` file, plus a safe `.env.example` placeholder and usage instructions. Real PAT values must remain local and must never be committed.
- 2026-07-16: Added Mission 001 Sprint 11 supervisor core contracts: provider-neutral incident and repair-plan validation, Observer/Thinker/Policy/Executor/Verifier/Audit interfaces, deterministic conservative policy behavior, fail-closed orchestration skeleton, and contract tests. Live Vercel observation and execution remain deferred.

- 2026-07-16: Added Mission 001 Sprint 12 Vercel Observer: a read-only provider observer with injected secret resolution, narrow Vercel client, deterministic deployment-state normalization, bounded read retries, sanitized normalized incidents, stable deduplication keys, and focused no-network tests. It does not diagnose or repair incidents.

## 20. Mandatory Final Reminder

This file is the starting point.

It does not remove the duty to inspect the repo.

Every developer and AI agent must read this file first, then scan the repository, then read the task-specific files, then act.

If a claim cannot be verified from current code, live provider result, database state, or deployment output, do not present it as fact.