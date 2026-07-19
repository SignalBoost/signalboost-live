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

### COSA Final-Video Approval Email Handoff

When the finalizer or brand-banner worker creates a newer final branded artifact after an approval email was already sent, `saas/scripts/cos-video-approval-rearm.mjs` runs after the banner-upgrade step. It may only re-arm `draft` or `waiting_approval` video campaigns that are not approved, rejected, or archived; have a ready, branded, voiced final video; have a valid prior `metadata.video.approvalRequestedAt`; and have the newest valid `brandBannerUpgradedAt`, `brandedAt`, or `voiceCompletedAt` later than that request.

Artifact identity must prefer the permanent `metadata.video.brandDebug.objectPath`, then `voiceObjectPath` or `finalObjectPath`. URL identity is only a fallback and must ignore signed query strings. The identity hash also binds the final and banner schema versions. Processing is bounded to recent artifacts and a small number of campaigns per run so old campaigns cannot create a notification backfill.

The re-arm worker does not send email and does not publish. It atomically clears only the stale video-level `approvalRequestedAt` and `approvalNotification` markers once for the new artifact. The existing `/api/cos/video-approval-notify` route remains the only approval-email sender, and `/api/cos/campaign-queue/email-action` remains the secure approve, hold, and request-edits handler. Hold and request-edits keep the campaign unapproved. Publishing remains impossible without `approved_at` and `approved_by`; after a successful connector publication, the existing publish core stores and emails the real live URL.

### Launchpad

Deployment and release coordination: Vercel, GitHub, Supabase, provider readiness, and integration validation.


### Supervisor Executor Bridge (Mission 001)

The Mission 001 policy-to-executor bridge lives in `saas/lib/supervisor/executors`. It is a provider-neutral routing layer, not a repair engine. The Policy Engine is the authorization boundary: only `approved` decisions with explicit approved step IDs may reach the dispatcher. `blocked` and `approval_required` outcomes are terminal.

Supported executor kinds are exactly `api`, `browser`, and `manual`. Unknown kinds and missing executor registrations fail closed. The API executor is a non-mutating stub and does not call Universal Runner or provider SDKs. The browser executor is disabled and does not import or invoke Browser Runtime, Playwright, Chromium, Stagehand, or browser-use. The manual executor only routes incidents to human review and must not claim a repair succeeded.

Dispatcher at-most-once tracking is in-memory for Sprint 14: duplicate and concurrent duplicate dispatch IDs are rejected for the lifetime of a dispatcher instance, but process-restart durable tracking is deferred. All dispatch results and audit payloads must stay serializable and sanitized; never include credentials, tokens, authorization headers, raw provider responses, stack traces, or browser objects.

### Browser Runtime (Mission 001)

### Sprint 15 — Browser Runtime Dry-Run Adapter

Sprint 15 connects the Supervisor BrowserExecutor to Browser Runtime task contracts only as a deterministic dry-run translation boundary. The BrowserExecutor now constructs a validated `BrowserRuntimeDryRunPackage` and returns `dry_run_ready`; it does not execute the package, launch a browser, import Playwright/Chromium, create a BrowserSession, access any provider account, resolve credentials, click controls, submit forms, modify Vercel, or mutate production/sandbox provider state.

The adapter accepts only a validated incident, repair plan, approved step IDs, browser dispatch metadata, an injected clock, and optional deterministic ID helper. It has no Observer, Thinker, Policy Engine, provider mutation client, BrowserSession, Playwright, secret resolver, credential, or LLM dependency. It fails closed if `requiresBrowser` is false, `targetOrigin` is missing or not an HTTPS origin, credentials/query/fragment/path scope are present, approved step IDs are unknown/duplicated/reordered, API and browser scope are mixed, unsupported actions appear, executable JavaScript or shell content is present, targets are natural-language-only, selectors broaden scope, or plaintext secret material appears.

Supported dry-run actions are exactly `navigate`, `click`, `fill`, `select`, `read`, `screenshot`, `request_approval`, `verify`, and `stop`. Click/fill/select/read require structured targets (`role` plus accessible `name`, `label`, `testId`, exact `text`, or explicit `css` when safe). Fill values must be non-secret literals or references such as `secretRef`, `tokenRef`, `credentialRef`, or `valueRef`; references are preserved but never resolved.

Protected Supervisor steps map to Browser Runtime checkpoints without collapsing approval controls. Supervisor policy approval proves only that the dispatcher may route the exact approved step IDs. Browser Runtime signed task approval and continuation approval remain separate future controls; the dry-run adapter creates no approval token and does not mark a Browser Runtime task approved. Deterministic package fingerprints cover incident/plan identity, target origin, approved step order, mapped task, approval requirements, verification requirements, and schema version. The package verifier is static and side-effect-free.

Known limitation: Browser Runtime live execution remains disconnected. The next recommended sprint is to enable execution only against an isolated local sandbox portal using signed Browser Runtime approvals and never against production/provider accounts.


The portable Browser Runtime lives in `saas/lib/browser-runtime` and must remain independent of Next.js UI, Supabase, and provider SDKs. Mission 001 advances the runtime only through bounded, testable slices.

The executable sandbox adapter uses adapter ID `signalboost.sandbox.v1` and the isolated `/browser-sandbox/login` route. Sandbox tasks must:

- use only `http` or `https` origins explicitly listed in `allowedOrigins`;
- re-check the live page origin after navigation and before and after click, fill, wait, and screenshot steps;
- resolve secrets only while the live page remains on an approved origin, then re-check immediately before filling;
- reference credentials through secret references such as `sandbox://credentials/email`, never literal values;
- require approval claims to match the task's exact `issuedAt` and `expiresAt` values, reject malformed timestamps, and reject approval windows that do not end after they begin;
- limit every signed approval window to no more than one hour, accepting the exact one-hour boundary and rejecting any longer window before browser launch;
- accept only bounded canonical signed approval envelopes: exactly two base64url segments, a finite token size, no unsupported claim fields, and no more than 128 signed step/origin scope entries;
- encode signed approval claims using deterministic canonical JSON and reject alternate whitespace, key ordering, duplicate-key, or otherwise equivalent JSON encodings before any approval is authorized;
- consume each verified phase-one and continuation approval exactly once per governed sandbox adapter instance, rejecting reused token digests or nonces before another browser session opens or a protected continuation runs;
- capture evidence before the approval boundary;
- stop phase 1 at a checkpoint before any protected save;
- persist a serializable execution record containing the exact completed and remaining step lists while retaining the live browser session through a separate runtime registry;
- require a second, separately signed token bound to the same task, incident, checkpoint, approved origins, exact remaining step IDs, one exact execution ID, and the digest of the phase-one approval that created the retained session;
- resume only the retained post-checkpoint steps without replaying navigation, credential entry, or preparation steps;
- permit protected-save steps in the task declaration only after the checkpoint, while the phase-1 token must neither authorize nor execute those steps;
- independently verify the complete two-phase evidence sequence before completion is accepted; and
- remain local/test-only until a separately reviewed production provider adapter is approved.

Every terminal Browser Runtime result (`paused`, `completed`, or `failed`) must include the deterministic verification report produced by the portable verifier. Callers must not treat a paused or completed execution as valid unless that report has status `verified`; a failed execution must retain a failed verification report for audit and diagnosis.

The current resumable implementation retains browser sessions in process. Retained execution records and live sessions expire with the approved task boundary; expired state must be removed and closed automatically. A durable execution store may persist serializable records, but a process restart invalidates the live session and must fail closed rather than replaying or reconstructing protected steps automatically.

The sandbox launch profile rejects `execute_change` tasks. Production/provider state changes, credential use, saves, redeploys, financial actions, and other sensitive operations remain outside Mission 001 unless Luis explicitly approves them through the existing governed approval flow.


### Sprint 16 — Isolated Sandbox Browser Execution

Sprint 16 connects the Supervisor BrowserExecutor to the Browser Runtime public interface only for the isolated repository sandbox portal at the exact configured loopback origin (tests use `http://localhost:4173`). Browser execution remains disabled for production, preview, Vercel, Stripe, Supabase dashboards, GitHub settings, AWS, Cloudflare, real provider accounts, real credentials, and external authenticated websites.

The sandbox execution boundary is a strict promotion contract: a schema-valid Sprint 15 dry-run package is re-verified, fingerprint-checked, confirmed as `targetEnvironment: sandbox`, confined to the exact configured sandbox origin, checked for ordered approved step scope and checkpoint structure, and then promoted without adding, removing, reordering, signing, or resolving any steps or secrets. Supervisor policy approval remains only a dispatch authorization; Browser Runtime phase-one signed task approval and separately signed continuation approval are still mandatory and bind to the exact promoted task, checkpoint, retained execution, remaining step IDs, and phase-one approval digest.

The harmless local scenario opens `/browser-sandbox/login`, fills only `sandbox://` test references through the Browser Runtime context, captures pre-approval evidence, pauses before the protected save checkpoint, resumes only after continuation approval, clicks the sandbox-only Protected save control, waits for the success marker, captures post-save evidence, and accepts completion only when deterministic Browser Runtime verification is `verified`. Audit events record dispatch/package/execution identifiers, sandbox origin, approved/completed steps, checkpoint status, continuation status, artifact references, verification report, and terminal status while excluding secret literals, cookies, authorization headers, browser storage, raw HTML, Playwright objects, and sensitive stack traces.

Known limitation: the execution and retained-session stores remain in-process test infrastructure. Production BrowserExecutor, Vercel browser automation, live provider credentials, and external provider mutations remain prohibited. The next recommended sprint is sandbox execution persistence plus operator-visible audit history, not production/provider browser execution.



### Mission 001 — Platform Self-Diagnostics

Mission 001 includes a read-only Health Monitor for the Supervisor architecture itself. It evaluates Supervisor health, lease/fencing integrity, dispatcher status, Observer/Thinker/verification/audit/persistence latency, BPAL registry integrity, provider registration integrity, scheduler/webhook processing, queue depth, active/stale work, expired leases, missed heartbeats, reconciliation backlog, verification failures, audit failures, five-language localization completeness, and CI validation state.

The monitor reports every subsystem as `healthy`, `warning`, `critical`, `unknown`, or `maintenance`, calculates an overall platform health score from availability, reliability, verification rate, audit success, scheduler success, webhook success, Supervisor health, provider health, and queue health, and emits deterministic alerts for stale leases, missing heartbeats, verification/audit failures, growing queues, repeated webhook/scheduler/provider failures, broken BPAL/provider/capability registration, localization regression, and CI regression.

Health snapshots, subsystem metrics, alerts, recoveries, and trend buckets are persisted as sanitized metadata only. No raw logs, credentials, provider secrets, browser objects, provider responses, mutation handles, repair controls, provider mutations, Browser Runtime execution, or approval-gate bypass are introduced. The Supervisor Operations Center remains admin-only and read-only while displaying Platform Health, Subsystem Health, Trend Graphs, Recent Alerts, Recent Recoveries, Current Warnings, and Health History.

### Mission 001 — Canonical Browser Provider Abstraction Layer

The canonical Browser Provider Abstraction Layer (BPAL) now lives only in `saas/lib/browser-provider/`, with `saas/lib/browser-provider/index.ts` as the public entry point. BPAL is metadata and policy support only: it defines provider adapter contracts, registry behavior, capabilities, origins, navigation profiles, selectors, evidence profiles, verification profiles, health, versioning, and Supervisor/worker metadata mapping. It does not execute browser tasks, import Playwright, invoke Browser Runtime, resolve credentials, call provider SDK clients, log into Vercel, mutate provider state, or enable production Browser execution.

The canonical Vercel adapter is `VercelBrowserAdapter` under `saas/lib/browser-provider/vercel/`. It is read-only, non-executing, and `supportsProduction()` remains false. The legacy `saas/lib/browser-provider/providers/vercel-provider.ts` file is only a compatibility re-export; new imports must use the public BPAL entry point. `npm run validate:bpal` enforces the one-registry/one-adapter/one-Vercel-adapter rule and blocks forbidden execution, credential, provider-mutation, and Browser Runtime coupling inside BPAL. All operator-facing BPAL labels use `browserProvider.*` keys in English, Spanish, Portuguese, Polish, and Russian.

The admin-only `/dashboard/supervisor/providers` route is the operator-facing BPAL diagnostics and policy-review surface. It may expose only deterministic, detached, deeply frozen, read-only metadata from the canonical registry: provider health/version, exact logical origins, capability risk and maturity, declared API/browser/manual channels, approval requirements, and evidence/verification profile identities. It must fail closed if a provider claims production execution, executable worker capacity, execution dependencies, unverified policy, or a production environment. The page must not contain forms, mutation controls, provider requests, Browser Runtime calls, credentials, secrets, or any path that enables production/provider Browser execution.

Durable BPAL capability-selection explanations must bind a Supervisor `ExecutionDecision` to the exact detached diagnostics metadata that justified its provider capability and channel choice. They must fail closed on provider, capability, version, policy, environment, risk, maturity, verification, origin, failover, Browser-on-demand, channel, or approved-step mismatches. Persisted selection-audit events are metadata-only and cannot authorize, approve, retry, replay, resume, dispatch, launch, or execute work; they must never contain credentials, tokens, browser objects, screenshots, provider responses, or mutable callbacks, and production Browser execution remains disabled.

### Sprint 18 — Federated High-Availability Supervisor Control Plane

Mission 001 now includes an active-active Supervisor coordination foundation. Multiple Supervisor instances may be healthy at the same time, but exactly one fenced owner may control a given work item, dispatch, or execution. Ownership is time-limited by leases and protected by monotonically increasing fencing tokens. A restarted process receives a new runtime ID, stale owners cannot renew/release/transition/dispatch/complete, and expired leases may be reassigned with a higher generation.

Provider work is routed through provider-isolated worker contracts so a Vercel worker failure does not define global policy or block future providers. Shared governance uses versioned capability and high-availability policy metadata. API remains the preferred execution path; Browser Agent is only an automatic backup for pre-authorized routine continuity workflows in sandbox/dry-run contexts. Human intervention remains required for consequential, unsupported, uncertain, production-browser, stale-fence, CAPTCHA/2FA, billing, credential, ownership, permission, deletion, or irreversible operations.

Browser sessions remain memory-bound and non-migratable. No audit or persistence record can resume a lost browser session. Replacement work must claim a new lease/fence, create a new execution ID, obtain new Browser Runtime approvals, and use new nonce/token material. Production and real-provider Browser execution remain disabled. New operator-facing Supervisor HA labels must exist in English, Spanish, Portuguese, Polish, and Russian.


### Sprint 19 — Durable Federated Supervisor Coordination Store

Mission 001 durable coordination replaces process-local Supervisor ownership in production. Supabase/Postgres tables now persist Supervisor instances, runtime identities, work items, leases, monotonically increasing fencing generations, and immutable sanitized coordination events. Production must use the durable store through dependency injection and fail closed when it is unavailable; it must never silently fall back to an in-memory coordination authority.

Atomic lease acquisition is performed by a Postgres RPC/transaction that locks the target work item, verifies owner health and provider/tenant-scoped availability, rejects unexpired active leases, increments the work-item fencing generation exactly once, inserts the lease, and transitions the work item to `leased`. Renewal, release, transition, dispatch, continuation, and completion paths must assert the exact lease ID, instance ID, runtime ID, and fencing token before any protected action. Stale owners cannot dispatch or complete work.

Durable records are coordination/audit metadata only. They cannot authorize replay, cannot reconstruct a lost browser session, cannot persist Browser/Page/Context objects, and cannot store approval tokens, credentials, cookies, secrets, authorization headers, or browser storage. Browser owner loss marks browser work abandoned; retries require a new execution ID, new policy decision, and fresh Browser Runtime approvals. Production and real-provider Browser execution remain disabled.

RLS is enabled for coordination tables. Anonymous reads are denied, public client writes are not granted, mutation RPCs are reserved for server/service-role paths, and authenticated operator visibility is read-only and sanitized. All new operator-facing labels must exist in English, Spanish, Portuguese, Polish, and Russian.

### Sprint 17 — Durable Sandbox Execution Records and Operator Audit History

Sprint 17 adds sanitized durable history for Mission 001 sandbox executions only. The persistence layer records serializable execution summaries, immutable sanitized audit events, and safe evidence references/digests in Supabase-backed tables plus a provider-neutral store interface. These records are audit-only: they cannot authorize, replay, resume, approve, retry, or launch a browser task.

Live browser sessions remain in memory only. A restart invalidates paused continuations; reconciliation must mark non-terminal sandbox executions `abandoned_after_restart` or expired and require a new execution ID plus new approvals. Completed records require verified deterministic Browser Runtime verification, and verification failure must never be stored as success.

Authenticated operator read-only access is exposed through `/api/internal/supervisor/executions` and `/api/internal/supervisor/executions/[executionId]`, with an admin-only dashboard history page at `/dashboard/supervisor/executions`. No Sprint 17 route or UI may resume, approve, retry, execute, launch a browser, mutate a provider, use real credentials, or enable production repair. Production BrowserExecutor execution, Vercel browser automation, and real-provider automation remain disabled.


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

Dynamic provider/action registry:

- `public.provider_registry` stores configuration-driven integration rows for provider/action routing, endpoint templates, header templates, payload templates, JSON config schemas, output-path mappings, and channel metadata.
- `saas/lib/engine/universalRunner.ts` is the provider-neutral backend runner for these rows. It hydrates templates from runtime variables, executes HTTP(S) requests, and maps provider responses through saved JSON paths without provider-specific imports.
- Registry rows can model new software APIs or approved local hardware channels, but secrets must still be backend-only references or service-role-resolved values; do not store plaintext user/provider secrets in registry rows.
- Sensitive live actions routed through registry rows remain subject to the same owner/HMI approval, payment confirmation, audit, and infrastructure-governance gates described in this document.

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

Concierge approval-path rule:

- When a user asks where to approve a pending campaign, outreach draft, or content asset, Concierge must not give generic navigation advice.
- Concierge must name the exact console or queue, provide the absolute `https://saas.signalboostapp.com/...` URL, and state the precise button/action for that asset.
- Current approval paths: COSA campaigns use the COSA Campaign Console at `/dashboard/cosa` and the `Approve campaign` button; press/outreach drafts use the Press Outreach Owner Approval Queue at `/dashboard/marketing/press-outreach` and the `Approve & mark published` button; final video/content assets use the COSA Video Pipeline Approval Queue at `/dashboard/cosa/video-pipeline` and the `Approve and publish` action.

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

Audit remediation consent and patch workflow:

- When an audit scan or readiness report has actionable findings, the user-facing workflow must explicitly ask whether the user wants SignalBoost AI to prepare fixes. The prompt must provide affirmative and defer options in English, Spanish, Portuguese, Polish, and Russian.
- Choosing the affirmative option may only prepare or open the remediation review path. It must not write code, mutate providers, change environment variables, run migrations, or alter production.
- Code findings must still go through a generated preview, visible diff, and explicit `Confirm & Push Pull Request` action. Provider and infrastructure findings remain behind the PR Cockpit owner `Merge/Approve` gate.
- The Executive Risk Summary must overlay persisted `audit_finding_state` rows before scoring or counting actionable work. Findings marked `resolved`, `accepted`, or `wont_fix` must not continue to appear as active fix offers; `in_progress` remains actionable.
- Repository patch preflight must resolve `@/*` imports against the correct workspace: root `app/`, `lib/`, and `components/` paths use the repository-root alias, while `saas/*` paths use the SaaS alias. Genuine missing imports must continue to fail closed.

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

### Vercel Deployment Health Intelligence

The Vercel Deployment Health Intelligence workflow is a read-only operator workflow, not a repair or Browser execution path. It observes recent Vercel deployments through the Vercel API, detects failed/repeated/stuck/canceled/unknown deployment health incidents, generates deterministic read-only diagnostic plans, reads deployment details/events/log summaries, environment-variable names only, and production aliases when required, verifies evidence coverage, and persists every run to Supabase for operator review. It must never redeploy, cancel, mutate projects, read environment variable values, rotate secrets, save provider settings, call Browser Runtime, or use Playwright/Chromium.

Required runtime inputs are `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, and optional `VERCEL_TEAM_ID`; operators can review history in the admin-only Supervisor Vercel health page and can trigger/read the internal API only as admins. Automatic read-only entry paths now include `/api/cron/vercel-observation` (secured by `CRON_SECRET`) and `/api/webhook/vercel` (secured by `VERCEL_WEBHOOK_SECRET`). Both paths normalize provider/project identity against authorized Vercel connections, write only sanitized trigger metadata to `vercel_observation_triggers`, deduplicate by deterministic fingerprint, create or reuse existing `supervisor_work_items`, and require the existing Supervisor lease/fencing model before running the same Vercel Deployment Health Intelligence workflow. They do not persist raw webhook bodies, request headers, signatures, tokens, secrets, or environment-variable values, and they do not add a second scheduler, queue, incident schema, health workflow, or audit store.

### Mission 002 — Universal Provider Framework

Mission 002 adds the provider-neutral Universal Provider Framework under `saas/lib/provider-framework/`. It is the canonical registration, lifecycle, metadata, capability-discovery, configuration, health, version, rate-limit, webhook, scheduler, authentication, environment, risk, approval, evidence, and verification contract for future providers. It is metadata and SDK-boundary only: it does not contain orchestration, policy, Browser Runtime, Supervisor dispatch, provider-specific business logic, network calls, credentials, or mutations.

Future providers such as GitHub, Stripe, Cloudflare, Supabase, AWS, Azure, Google Cloud, and Namecheap must be onboarded through the canonical universal provider registry plus provider-specific safe SDK/observer/thinker/test code. Browser Runtime, Supervisor, Dispatcher, Policy, Verification, Audit, and dashboards must consume provider capabilities through framework metadata rather than hardcoded provider-specific branches. Existing BPAL metadata remains the Mission 001 browser-provider foundation and is bridged into the universal framework instead of replaced.

### Mission 001 — Global AI Kill Switch and Restore

The global `system_status.ai_autonomous_execution_enabled` flag is the emergency stop control for autonomous AI ingress. The Supabase migration seeds one `global` row, enables RLS, and permits mutation only to authenticated database owners/admins; the server-side admin route separately requires the established application admin gate and writes an audit event. The SaaS Edge Proxy (the Next.js 16 successor to Middleware) checks this flag for autonomous cron, webhook, Supervisor, and autonomous-supervisor API ingress and returns HTTP 503 with the global-disable message when autonomy is disabled or its status cannot be verified. Normal human traffic does not perform this check and continues normally. The admin-only Supervisor Operations Center contains the visible kill/restore control. Restoring the flag only re-enables ingress; it never bypasses existing owner approval gates.

Emergency navigation is part of the shared `PremiumCustomerNavbarV2` AppShell navigation: authenticated owners/admins receive a persistent, high-visibility `🛑 Supervisor SOC (Kill Switch)` link to `/dashboard/supervisor` in both the desktop global navigation and the responsive hamburger menu. The client-side visibility condition is discovery-only; the Supervisor route and kill/restore API retain their established server-side admin gates. No global Command palette currently exists in this application.

## 18. Mandatory ONBOARD Maintenance Rule

`ONBOARD.md` should stay current.

Contributors should update this file when a change affects any of the following:

- COSA behavior, campaign flow, video rendering, approval, publishing, localization, prediction, or optimization.
- Console Hub provider templates, provider routing, provider cards, provider executors, provider variable names, provider live panels, or provider action behavior.
- Vercel environment-variable handling, Vault handling, provider-key handling, secrets, DNS, infrastructure, workflow, or CI/CD behavior.
- Supabase schema, storage buckets, service-role behavior, migrations, or data model assumptions.
- Audit, cybersecurity, approval gates, owner/admin gating, or compliance behavior.
- Developer instructions, build/test/deploy process, or repo governance.

If a critical file changes and no user-facing or architecture-facing behavior changed, a maintenance note may be added under the change log below. This documentation guidance never blocks a commit or merge.

Keeping onboarding documentation current helps future developers and AI agents avoid stale assumptions.

---

## 19. Onboarding Change Log

- 2026-07-19: Removed ONBOARD.md merge gating from GitHub Actions, local commit hooks, and pull-request guidance. ONBOARD.md remains recommended onboarding and maintenance documentation, while unrelated branch protection, code-owner review, and quality/safety checks remain in place.
- 2026-07-19: Restored the Audit remediation consent boundary and working code-fix path. Audit reports and repository scans now explicitly ask whether the user wants SignalBoost AI to prepare fixes in English, Spanish, Portuguese, Polish, and Russian; accepting opens review only and never mutates production. Persisted handled finding states are overlaid before executive scoring/counts, code changes still require preview plus `Confirm & Push Pull Request`, root and SaaS `@/*` aliases are validated against their correct workspaces, and the worker integrity guard no longer mistakes quoted TypeScript source strings for executable imports.
- 2026-07-19: Restored the COSA final-video approval email handoff with a bounded metadata-only re-arm worker after banner upgrade. Stable object-path identity, schema binding, newest valid artifact timestamp selection, recent-artifact limits, archive/rejection/approval exclusions, and optimistic concurrency prevent duplicate or historical approval emails. The existing Vercel notifier, email-action endpoint, owner approval gate, connector publisher, and live-link email sender remain the only execution path.
- 2026-07-19: Hardened root-app analytics routes: provider-wide analytics now require a trusted platform operator (not marketing-admin access), reject all caller-selected organization identifiers and malformed/unknown query parameters, pass normalized bounded filters rather than raw URLs, return no fabricated fallback metrics, and send no-store responses. These routes remain read-only and do not alter the governed execution pipeline or approval boundaries.
- 2026-07-18: Added persistent emergency routing: injected a globally accessible, owner/admin-gated `🛑 Supervisor SOC (Kill Switch)` link to the Mission 001 Supervisor SOC and Kill Switch into the shared AppShell navigation and responsive hamburger menu to ensure immediate human override capability during AI failures. The server-side Supervisor and kill/restore authorization gates remain unchanged.
- 2026-07-18: Added Mission 001 Global AI Kill Switch and Restore toggle: Supabase flag, Vercel Edge Middleware ingress block, and admin UI override to ensure fail-safe human parity and recovery. Autonomous cron, webhook, and Supervisor ingress now fails closed when status cannot be verified; restoring autonomy never bypasses any approval gate.
- 2026-07-18: Added an explicitly approved GitHub auto-merge helper in the Console Hub GitHub executor. `autoMergeOnApproval(branchOrPR, approve)` refuses to run without an approval flag/command, fetches PR or branch details, merges to `main`, records branch/commit/status details, and falls back to an `ours` merge commit only when GitHub reports a conflict. This changes provider action behavior but preserves the required human approval gate before merge.
- 2026-07-18: Added the Concierge approval-path rule: when users ask where to approve pending campaigns, outreach drafts, or content/video assets, responses must name the exact local approval queue, give the absolute SaaS URL, and state the exact approval action instead of generic navigation advice.
- 2026-07-17: Added Mission 001 Universal Provider Runtime execution support for a read-only GitHub adapter: canonical registry capability resolution now rejects duplicate capabilities, GitHub observations run through durable Supervisor ownership/lease/fencing checks, read-only GitHub API normalization/verification/scheduler/webhook helpers persist only sanitized evidence/audit metadata, and the Supervisor Operations Center exposes GitHub status without mutation controls or credential display.
- 2026-07-17: Added Mission 001 platform self-diagnostics: the Supervisor Operations Center now computes read-only platform health snapshots, subsystem status, alert/recovery history, trend buckets, and self-verification for Supervisor, lease, fencing, dispatcher, Observer/Thinker/verification/audit/persistence latency, BPAL/provider registration, scheduler/webhook processing, queue depth, stale work, expired leases, missed heartbeats, localization completeness, and CI state. The Health Monitor persists snapshots/alerts/recoveries/metrics only as sanitized metadata and adds no repair controls, provider mutations, Browser Runtime execution, credentials, raw logs, or approval-gate bypass.
Use this section for short notes when architecture, provider behavior, platform workflow, or governance rules change.

- 2026-07-17: Enhanced the Mission 001 Supervisor Operations Center with query-driven operational filtering/search, explicit Supervisor Cluster and Metrics sections, verification percentages, and dashboard test coverage while preserving read-only, admin-authenticated, non-mutating Supervisor/BPAL/Vercel data reuse.
- 2026-07-17: Added Mission 002 Universal Provider Framework as the provider-neutral metadata, lifecycle, capability-discovery, configuration, health, version, rate-limit, webhook, scheduler, authentication, environment, risk, approval, evidence, verification, registration, and SDK-boundary layer for future providers. Existing Mission 001 BPAL remains intact and is bridged into the universal framework; no GitHub, Stripe, Cloudflare, Supabase, AWS, Azure, Google Cloud, or Namecheap provider implementation, provider mutation, Browser Runtime path, Supervisor dispatch path, credential handling, or approval bypass was added.
- 2026-07-17: Added the Mission 001 Supervisor Operations Center at `/dashboard/supervisor` as an admin-authenticated, tenant-aware, read-only monitoring dashboard that reuses existing Supervisor coordination rows, Vercel health runs, durable audit timelines, canonical BPAL diagnostics, trigger ingestion, leases, fencing, and verification data. The SOC exposes no repair, redeploy, browser launch, provider mutation, credential, or environment-value controls and adds no new persistence, audit, work, or incident model.
- 2026-07-17: Added Vercel Deployment Health Intelligence as an end-to-end read-only workflow: Vercel API observation, deterministic diagnostics, deployment/event/env-name/alias evidence collection, verification, Supabase persistence, admin API, and operator visibility. The workflow cannot redeploy, mutate Vercel, read env values, or execute browser automation.
- 2026-07-17: Hardened Vercel Deployment Health Intelligence for Mission 001 governance: runs now require durable Supervisor work ownership, active lease and fencing validation when invoked through governed context, exact read-only inspection scope, canonical BPAL metadata resolution, policy channel selection, stronger deterministic verification, sanitized audit timeline persistence, and read-only operator visibility. Production Browser execution, Vercel mutations, token persistence, and environment-variable value reads remain disabled.
- 2026-07-17: Added Mission 001 durable Vercel observation scheduling and webhook trigger ingestion. The new cron and signed webhook entry paths are read-only, bounded, sanitized, durably deduplicated in `vercel_observation_triggers`, handed off to existing Supervisor work items and lease/fencing, and reuse Vercel Deployment Health Intelligence. Vercel mutations, production Browser execution, raw webhook persistence, signature/token persistence, and parallel scheduler/queue/audit/incident architectures remain disabled.
- 2026-07-17: Further hardened Vercel Deployment Health Intelligence fail-closed behavior: evidence timestamps now use the injected Supervisor clock, metadata redaction covers evidence payloads, durable work-state transition and audit-sink failures reject governed runs, and verification re-checks governed BPAL selection invariants. Read-only API inspection and production Browser disablement are unchanged.

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

- 2026-07-16: Hardened paid provider gates: wallet-funded non-zero render providers now require a server-side approval reference before reservation/provider execution, and the FAL/Kling marketing-sales video host requires the `COSA_PAID_VIDEO_PROVIDER_APPROVED` runtime flag before submitting paid video jobs.

- 2026-07-16: Bound Mission 001 retained execution records and live in-process browser sessions to the approved task expiry. Expired continuations are removed and closed automatically, duplicate retained execution IDs fail closed, and resume rejects expired or orphaned state without consuming protected steps.
- 2026-07-16: Added the dynamic `provider_registry` schema and provider-neutral universal runner for configuration-driven integration actions. New software API or approved local-channel integrations can be represented by database rows with endpoint, payload, schema, and output-path mappings, while secrets and sensitive actions remain governed by backend-only resolution and approval gates.
- 2026-07-16: Hardened the universal runner contract to support blueprint aliases (`request_template`, `response_mapping.output_path`), backend-only credential reference resolution, dynamic auth/header hydration, and structured offline/error diagnostics without provider-specific SDK imports.

- 2026-07-16: Added deterministic Vercel Thinker planning for Mission 001 supervisor incidents: read-only deployment/event/log planning, env-name-only inspection to reduce false-positive missing-variable diagnoses, production alias inspection for canceled production deployments, and latest-failed-deployment Observer selection. Thinker remains non-executing; protected repairs still require policy approval.
- 2026-07-16: Hardened Mission 001 Browser Runtime approval time binding: signed approvals now match the exact task issue/expiry window and fail closed on malformed timestamps, invalid verification clocks, or non-positive approval windows.

- 2026-07-16: Added Mission 001 Sprint 14 policy-to-executor bridge: provider-neutral executor registry, dispatcher validation, sanitized dispatch audit events, in-memory at-most-once dispatch protection, and non-mutating API/browser/manual executor stubs. This proves routing only; Browser Runtime and API mutations remain disabled, and durable process-restart dispatch tracking is deferred.
- 2026-07-16: Added Mission 001 Sprint 15 Browser Runtime dry-run adapter: BrowserExecutor now translates approved browser scope into a validated, fingerprinted dry-run package only. It does not launch Playwright/Chromium, resolve credentials, access providers, or execute Browser Runtime tasks; live execution is deferred to an isolated sandbox-only sprint.
- 2026-07-16: Added Mission 001 Sprint 16 isolated sandbox browser execution: dry-run packages can be promoted only to the exact local repository sandbox origin with Browser Runtime signed phase-one and continuation approvals, deterministic verification, evidence capture, sanitized audit events, and no production/provider credential access. Production BrowserExecutor and Vercel browser automation remain disabled; Sprint 17 should add sandbox persistence and operator-visible audit history only.
- 2026-07-16: Added Mission 001 Sprint 17 durable sandbox audit history: sanitized Supabase execution, audit-event, and evidence-reference records; admin-only read APIs and operator UI; restart reconciliation that abandons non-terminal records without resuming browser sessions; and explicit confirmation that persisted records cannot authorize replay or production/provider automation.
- 2026-07-16: Hardened the Mission 001 Browser Runtime session launch boundary. Session factories and launch-profile providers now receive only a detached, frozen provider/adapter/mode/approved-origin scope; approval tokens, task and incident identity, timestamps, executable steps, and metadata remain inside the runtime and never cross the browser-launch boundary.
- 2026-07-16: Hardened Mission 001 Browser Runtime approval envelopes: tokens are bounded before signature or JSON work, must use canonical two-segment base64url form, reject unsupported signed claims, and cap signed step/origin scopes at 128 entries. This does not broaden origins or enable production/provider execution.
- 2026-07-16: Bounded Mission 001 Browser Runtime approvals to a maximum one-hour validity window. Longer signed windows fail closed before session launch; this narrows authorization and does not enable production/provider execution.
- 2026-07-16: Canonicalized Mission 001 Browser Runtime approval claim JSON. Issuance now uses deterministic top-level key ordering, and verification rejects validly signed alternate encodings or duplicate-key payloads before claim authorization. This narrows approval acceptance and does not enable production/provider execution.
- 2026-07-16: Added bounded single-use approval replay protection to the Mission 001 sandbox Browser Runtime adapter. Verified phase-one and continuation token digests and nonces are consumed before browser session launch or protected continuation; replay and capacity exhaustion fail closed. This remains local/test-only and does not enable production/provider execution.

- 2026-07-16: Added Mission 001 Sprint 18 federated high-availability Supervisor contracts: active-active instance identity, durable work-item leases, monotonically increasing fencing tokens, provider-isolated worker routing, versioned API-first smart-failover policy, dispatcher fence checks, five-language operator labels, and documentation confirming production/real-provider Browser execution remains disabled.

- 2026-07-16: Added Mission 001 durable federated coordination store: Supabase/Postgres-backed Supervisor instances, work items, atomic lease RPCs, monotonic fencing, exact owner renewal/release/transition checks, expired-lease reconciliation, read-only operator APIs, five-language HA labels, and fail-closed production wiring. Production never falls back to in-memory coordination, stale owners cannot execute, and lost browser sessions cannot resume.

- 2026-07-16: Consolidated overlapping Browser Provider Abstraction Layer implementations into one canonical metadata-only BPAL under `saas/lib/browser-provider/`, added a canonical public entry point, read-only non-executing Vercel adapter, Supervisor metadata mapping, five-language `browserProvider.*` labels, and `npm run validate:bpal` duplication/execution guard. Production/provider Browser execution remains disabled and BPAL handles no credentials or mutations.
- 2026-07-16: Added the admin-only BPAL Supervisor diagnostics and policy-review surface. It renders only deterministic, deeply frozen read-only provider metadata, exact origins, capability policy, evidence, and verification identities; it has zero execution capacity and no production/provider Browser, credential, secret, request, or mutation path.
- 2026-07-16: Hardened Mission 001 BPAL registration as the canonical cross-model integrity boundary: provider support decisions and metadata are detached and frozen at registration; capability, origin, navigation, selector, evidence, and verification references are validated fail-closed; navigation templates reject traversal and alternate-origin forms; and Vercel capability bindings are explicit. This remains metadata-only, read-only, non-production, and adds no browser execution, credentials, provider requests, or mutations.
- 2026-07-16: Added durable Mission 001 BPAL capability-selection explanations and audit events. Supervisor decisions are bound fail-closed to the exact detached provider capability, policy, environment, origin, verification, channel, and empty executable-step scope; persisted records are metadata-only and cannot authorize or execute Browser Runtime or provider work.
- 2026-07-16: Added the governed Mission 001 BPAL selector boundary. BPAL-backed Supervisor channel selection now validates one exact registered provider capability against the same detached diagnostics snapshot, uses content-bound audit event identity, and durably appends the metadata-only selection audit before returning a decision. Unknown provider/capability scope and audit persistence failures fail closed. This does not enable provider requests, credentials, approvals, Browser Runtime execution, mutations, or production Browser execution.

- 2026-07-17: Added COSA multi-stage video pipeline stabilization scaffolding: BullMQ/Redis queues for video rendering, voice-over, and brand overlay workers; a secured `cos-voice-dispatch` cron route for `waiting_for_voice` campaigns; S3-compatible render bucket pre-flight verification with optional provisioning/fallback; and local-vs-cloud render routing based on queue depth and CPU load. This preserves owner approval gates and prevents render jobs from enqueueing when storage is unavailable.

## 20. Mandatory Final Reminder

This file is the starting point.

It does not remove the duty to inspect the repo.

Every developer and AI agent must read this file first, then scan the repository, then read the task-specific files, then act.

If a claim cannot be verified from current code, live provider result, database state, or deployment output, do not present it as fact.
