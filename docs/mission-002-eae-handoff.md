# Mission 002 and Enterprise Autonomy Engine Developer Handoff

> Mandatory companion to the repository-root `ONBOARD.md`. Read `ONBOARD.md` first, then use this document for the current Mission 002 Manual Review and Enterprise Autonomy Engine development state.

Last updated: 2026-07-24

## Repository and working model

Repository: `SignalBoost/signalboost-live`

Use small, focused pull requests. Build from current `main`, inspect recent merged work before editing, and preserve all existing safety and compatibility boundaries. Never replace a current implementation with an older branch version.

## Non-negotiable boundaries

Mission Review remains authenticated, admin/operator-only, inspection-only, read-only, and GET-only. Do not add approval, workflow retry, replay, resolution, repair execution, provider mutation, GitHub mutation, browser execution, shell execution, LLM execution, automatic production repair, or production execution through this surface.

Keep these operator notices visible:

- Manual review only
- No repair has been executed
- Production execution disabled
- Provider mutation disabled

All response payloads must use explicit runtime allowlists. All persisted and displayed metadata must remain sanitized. Never expose credentials, tokens, authorization headers, provider responses, stack traces, browser objects, cookies, browser storage, or secret values.

## Mission 002 purpose

Mission 002 establishes a governed provider-neutral foundation and a durable manual-review path for outcomes that cannot execute automatically. The Manual Review subsystem records and exposes review information to operators without authorizing or performing a repair.

## Mission 002 completed progression

### Phases 1–4

The core mission lifecycle, outbox behavior, deterministic fingerprint binding, revision checks, and fail-closed execution prerequisites were completed before the current UI sequence. Fingerprint and revision validation must continue to occur before durable review routing.

### Phase 5 — Durable manual-review routing

Merged through PR #460.

Implemented durable manual-review persistence and hardened routing. The subsystem includes the service-role persistence boundary, durable store implementation, in-memory test implementation, idempotent duplicate routing behavior, and tests for stale revisions, duplicate delivery, fingerprint mismatches, rejected policy outcomes, and manual-review routing.

### Phase 6 — Read-only Manual Review API

Merged through PR #466.

Added authenticated inspection endpoints for bounded review listing and review detail. The API uses strict response allowlists, bounded filters, and cursor pagination. No write methods or lifecycle mutation were introduced.

### Phase 7 — Read-only operator page

Merged before the later hardening sequence.

Added the internal Mission Review operator page using the Phase 6 API. The page exposes list, filters, pagination, detail inspection, safety labels, and fingerprint visibility in detail only. It includes no mutation controls.

### Runtime allowlist hardening

PR #474 was fixed and merged. The implementation added runtime response parsing instead of unchecked JSON casts, corrected numeric narrowing, and completed detail-response allowlist handling.

### Accessibility and keyboard navigation

PR #487 merged the effective accessibility implementation. The older PR #483 became obsolete and must not be merged.

The current UI uses native buttons for detail activation, visible keyboard focus, accessible labels, semantic status/error announcements, bounded clipboard feedback, Escape-to-close, and focus restoration.

PR #489 subsequently hardened focus restoration so the opener is focused only when it remains connected and enabled.

### Phase 10 — Stale request protection

PR #490 merged.

The Mission Review client now uses independent `AbortController` instances and monotonic request identifiers for list and detail requests. New requests cancel earlier requests; stale responses cannot replace newer state; closing detail aborts its request; unmount aborts active requests; aborted requests do not surface operator errors; and opening review B cannot display review A.

### Phase 11 — Independent UI state

PR #491 merged with merge commit `ed607a24c84d09f5519188b69c8bb85e20995b21`.

List, diagnostics, and detail now have independent loading, error, cancellation, and stale-response state. Diagnostics failure preserves list data; list failure preserves diagnostics; detail failure preserves list data; and retries reload only their own inspection stream. The UI remains GET-only and read-only.

## Current Mission Review architecture

The current Mission Review operator surface provides:

- durable manual-review storage;
- deterministic and idempotent routing;
- authenticated bounded list and detail APIs;
- runtime response allowlists;
- read-only operator list and detail views;
- diagnostics inspection;
- cursor pagination and bounded filters;
- keyboard and screen-reader accessibility;
- safe focus restoration;
- bounded clipboard announcements that never expose fingerprint values;
- independent list, diagnostics, and detail state;
- request cancellation and stale-response prevention;
- isolated diagnostics and detail retry controls;
- GET-only network behavior;
- no lifecycle or execution controls.

Before changing this area, inspect at least:

- `saas/app/dashboard/supervisor/missions/reviews/MissionReviewClient.tsx`
- the Mission Review API routes under `saas/app/api/internal/supervisor/missions/reviews/`
- the manual-review store and lifecycle code under `saas/lib/supervisor/`
- `saas/lib/i18n/supervisorSocLocales.json`
- all `saas/tests/missionReview*.node.test.ts` tests
- the phase documents under `docs/mission-002-phase*.md`

## Next Mission 002 work

The next recommended bounded slice is Phase 12: Safe Timestamp Rendering.

Create one shared safe timestamp formatter for the Mission Review UI. Valid timestamps should retain current locale rendering. Missing, malformed, non-finite, or formatting-failure inputs must return the localized unavailable label. The page must never display `Invalid Date` and must not crash because of timestamp formatting.

Apply the helper to review created/routed times, diagnostics oldest/newest routed times, and mission-summary created/updated times. Do not change API contracts, validation, database schema, authentication, stores, diagnostics calculations, request cancellation, or lifecycle behavior.

After Phase 12, preferred UI-only maintenance order is:

1. shared safe formatting helpers for strings, numbers, timestamps, and clipboard presentation;
2. behavior-preserving component extraction for review list, diagnostics, detail, filters, and pagination;
3. performance cleanup with stable callbacks, memoized derived values, and no feature changes.

## Mission Review validation baseline

Use the scripts that exist on current `main`; inspect `saas/package.json` before running commands. The expected focused baseline includes:

```bash
npm run test:mission-review-state
npm run test:mission-review-request-safety
npm run test:mission-review-a11y
npm run test:mission-review-ui
npm run test:mission-review-diagnostics
npm run test:mission-review-api
npm run test:mission-manual-review
npm run typecheck
npm run build
git diff --check
```

New bounded work should add a focused test script and preserve all prior focused suites. Do not claim success unless the relevant command actually completes successfully. Broad repository failures must be named accurately and distinguished from feature-specific results; they must not be described as green when they are not.

## Portable Product doctrine and current work

SignalBoost is the reference integration environment, not a mandatory runtime dependency for commercial portables. Every commercial module must operate outside SignalBoost without source-code modification, remain provider-neutral where its contract requires portability, expose buyer-supplied provider configuration, and preserve manual operation as a first-class reliability floor.

Recent merged portable-product work includes:

- PR #480 — Enterprise Autonomy Engine foundation and portable doctrine;
- PR #482 — internal read-only Portable Product Catalog;
- PR #484 — deterministic Portable Product Dependency Graph;
- PR #488 — admin-only Portable Product Readiness Dashboard.

Portable catalog, manifest, graph, and readiness surfaces are inspection-only. They do not package, license, provision, execute, mutate providers, or sell products by themselves.

## Enterprise Autonomy Engine architecture

The Enterprise Autonomy Engine (EAE) is a standalone, white-label, plug-and-play strategic intelligence product. Its intended flow is:

```text
Enterprise systems
    -> Enterprise Autonomy Engine
    -> versioned Enterprise Intelligence Bus
    -> COS
    -> existing governed COS pipeline
```

EAE is before COS. EAE reasons; COS retains orchestration, approvals, workflow coordination, and execution management. EAE must not bypass, duplicate, or silently replace COS governance.

### Merged EAE foundation

PR #480 established portable, tenant-scoped, deterministic contracts for observations, world state, candidate plans, decisions, policy dispositions, and COS envelopes. It rejects cross-tenant input, unsupported schemas, duplicate observations, non-finite values, executable values, and secret-shaped fields. It adds no network calls, storage dependency, browser execution, provider SDK, LLM call, production mutation, or automatic approval.

PR #485 added the deterministic pre-COS reasoning layer: perception classification, prediction, multiple candidate plans, policy-weighted deterministic ranking, immutable JSON-serializable Enterprise Intelligence Envelope v1, stable provenance, tenant preservation, and an explicit `pre_cos_reasoning_only` boundary.

### Enterprise Digital Twin work

PR #486 was open during this handoff and must be rechecked before any new EAE task. Its intended scope is the portable enterprise context and digital-twin layer: typed entities and relationships, deterministic relationship graph, bounded traversal, tenant/environment isolation, secret rejection, immutable context snapshots, applicable policy/objective/dependency selection, and Enterprise Intelligence Envelope v2.

Do not assume PR #486 remains open or unchanged. Inspect GitHub and current `main` first.

### Recommended EAE sequence

After the digital-twin/context layer is merged and verified, continue through bounded, independently testable slices:

1. Enterprise Knowledge Graph maturation;
2. provider-neutral Enterprise Memory;
3. Enterprise Objective Engine;
4. Enterprise Risk Engine;
5. Enterprise Strategy Engine;
6. Enterprise Intelligence Bus v2 hardening;
7. explicit COS integration through versioned contracts.

All of these remain pre-COS reasoning work until a separately approved execution phase. No EAE phase may introduce network mutation, provider execution, browser execution, automatic approval, spending, publishing, infrastructure mutation, or production repair merely because reasoning is available.

## Engineering workflow

For every task:

1. Read root `ONBOARD.md`.
2. Inspect current `main` and recent PRs.
3. Read the exact files and tests involved.
4. Confirm whether a similarly named PR is obsolete or superseded.
5. Create a focused branch from current `main`.
6. Preserve newer code, localization, response allowlists, and safety notices.
7. Add focused deterministic tests.
8. Run all relevant prior suites, typecheck, build, and `git diff --check`.
9. Open a PR with exact test results and remaining failures.
10. Merge only after the required checks and requested review conditions are satisfied.

Avoid large rewrites. Never state that a local commit was pushed, a PR was opened, checks passed, or a merge occurred unless verified through the repository or CI.

## Historical PR map for this handoff

- #460 — durable Mission 002 manual-review routing
- #466 — read-only Mission 002 Manual Review API
- #474 — Mission Review UI response-allowlist hardening
- #483 — obsolete accessibility PR; do not merge
- #487 — merged Mission Review accessibility and keyboard navigation
- #489 — merged focus-restoration hardening
- #490 — merged stale-request protection
- #491 — merged independent Mission Review UI state
- #480 — merged EAE foundation and portable doctrine
- #482 — merged Portable Product Catalog
- #484 — merged Portable Product Dependency Graph
- #485 — merged deterministic pre-COS EAE reasoning
- #486 — Enterprise Digital Twin/context PR; recheck current status
- #488 — merged Portable Product Readiness Dashboard

## Final safety reminder

The presence of a plan, review record, diagnostic result, digital twin, EAE recommendation, approval requirement, or operator page does not mean a repair or business action occurred. A read-only inspection result must never be represented as execution. Production/provider browser execution, real-provider credentials, provider mutations, automatic repairs, workflow replay, and automatic production actions remain disabled unless a later, separately reviewed and explicitly approved architecture changes those boundaries.
