# ONBOARD.md — Mandatory SignalBoostAi / COSA Onboarding

> [!CAUTION]
> ## STOP: Phase A live-travel provider development does not belong in this repository
>
> Effective July 26, 2026, developers and AI coding agents must not add or continue Phase A live-travel provider work in `SignalBoost/signalboost-live`.
>
> Phase A includes flights, hotels, car rentals, travel insurance, airport transfers, tours and activities, eSIM live-data connectors, unified travel search, travel-result normalization, travel-provider synchronization, and related staging or production provider execution.
>
> That work belongs only in `SignalBoost/signalboost-`.
>
> Do not create branches, issues, pull requests, adapters, connectors, routes, schemas, tests, documentation, or infrastructure in this repository for Phase A. If a task requests Phase A work here, stop and redirect the task to `SignalBoost/signalboost-` before making changes.
>
> Existing generic Provider Hub contracts may remain, but they must not be expanded into travel-provider implementation in this repository. Historical branches, merged generic live-read contracts, handoffs, roadmaps, comments, and prior assistant messages do not override this boundary.

This is the mandatory first read for every developer, AI coding agent, AI reviewer, infrastructure assistant, operator, contractor, and contributor working on this repository.

The current repository is always the source of truth. Read this file first, then inspect current `main`, recent pull requests, and the exact files involved in the task.

## Mandatory companion documents

Read these after this root file when the task touches the relevant area:

- Full historical and cross-cutting handbook: `docs/ONBOARD-full.md`
- Current Mission 002, Portable Products, and Enterprise Autonomy Engine handoff: `docs/mission-002-eae-handoff.md`
- First-class Provider Hub BYOK/BYOI portable: `docs/portables/provider-hub-byok-portable.md`

The full handbook preserves detailed doctrine for COSA, Console Hub, Browser Runtime, Mission 001, provider onboarding, audit, cybersecurity, publishing, infrastructure PRs, localization, navigation, and other established subsystems.

---

## 1. Core engineering rules

Every contributor must:

1. Read `ONBOARD.md` first.
2. Scan the repository structure.
3. Inspect recent merged and open pull requests.
4. Read the exact files and tests related to the task.
5. Verify current behavior from code before diagnosing or changing anything.
6. Never replace newer merged work with an older branch version.
7. Never claim a test, build, deployment, push, PR, or merge succeeded unless it was actually verified.
8. Prefer small, focused pull requests with one bounded purpose.
9. Preserve existing safety, approval, tenant, localization, and compatibility boundaries.
10. Fail closed when required state, ownership, policy, validation, or durable infrastructure cannot be verified.

Core principle:

> AI builds. Humans stay in control.

Sensitive actions remain behind explicit governance and approval gates, including publishing, sending outreach, spending money, provider-key changes, environment-variable changes, migrations, infrastructure mutation, deletion, and production/provider browser execution.

---

## 2. Current project: Mission 002

Mission 002 establishes the provider-neutral Universal Provider Framework and the durable Manual Review path for outcomes that cannot execute automatically.

The canonical provider framework lives under:

- `saas/lib/provider-framework/`

It defines provider registration, lifecycle, capabilities, configuration, health, versions, rate limits, webhook and scheduler metadata, authentication metadata, environments, risk, approval, evidence, and verification contracts.

The framework is a metadata and SDK boundary. It must not silently become a second orchestration engine, policy engine, browser runtime, dispatcher, credential store, or provider-specific business-logic layer.

Existing Mission 001 BPAL remains the browser-provider foundation and is bridged into the universal framework rather than replaced.

### Mission 002 Manual Review purpose

The Manual Review subsystem records and exposes outcomes requiring human inspection. A review record does not authorize or perform a repair.

The Manual Review surface must remain:

- authenticated;
- admin/operator-only;
- inspection-only;
- read-only;
- GET-only;
- bounded and paginated;
- sanitized;
- protected by explicit runtime response allowlists.

Keep these notices visible in the operator UI:

- Manual review only
- No repair has been executed
- Production execution disabled
- Provider mutation disabled

Do not add through this surface:

- approval or resolution actions;
- workflow retry or replay;
- repair execution;
- provider mutation;
- GitHub mutation;
- browser execution;
- shell execution;
- automatic production repair;
- automatic production actions.

### Completed Mission 002 Manual Review progression

The current progression includes:

- Phases 1–4: mission lifecycle, outbox behavior, deterministic fingerprint binding, revision validation, and fail-closed prerequisites.
- Phase 5 / PR #460: durable and idempotent manual-review routing.
- Phase 6 / PR #466: authenticated read-only list and detail API.
- Phase 7: internal read-only operator page.
- PR #474: runtime response-allowlist hardening.
- PR #487: effective accessibility and keyboard-navigation implementation.
- PR #489: safe focus-restoration hardening.
- Phase 10 / PR #490: AbortController cancellation and stale-response prevention.
- Phase 11 / PR #491: independent list, diagnostics, and detail state with isolated GET-only retries.

PR #483 was superseded by later accessibility work and must not be revived or merged.

### Current Manual Review architecture

The operator surface currently provides:

- durable manual-review storage;
- deterministic and idempotent routing;
- authenticated bounded list and detail APIs;
- runtime response allowlists;
- cursor pagination and bounded filtering;
- diagnostics inspection;
- keyboard and screen-reader accessibility;
- visible focus and safe focus restoration;
- bounded clipboard announcements;
- independent list, diagnostics, and detail state;
- request cancellation and stale-response prevention;
- isolated diagnostics and detail retries;
- GET-only network behavior;
- no lifecycle or execution controls.

Before changing this area, inspect at least:

- `saas/app/dashboard/supervisor/missions/reviews/MissionReviewClient.tsx`
- `saas/app/api/internal/supervisor/missions/reviews/`
- the Mission Manual Review store and lifecycle code under `saas/lib/supervisor/`
- `saas/lib/i18n/supervisorSocLocales.json`
- `saas/tests/missionReview*.node.test.ts`
- `docs/mission-002-phase*.md`
- `docs/mission-002-eae-handoff.md`

### Next recommended Mission 002 work

The next bounded UI-only slice is safe timestamp rendering.

Requirements:

- use one shared timestamp-formatting helper;
- preserve locale formatting for valid timestamps;
- return the localized unavailable label for missing, malformed, non-finite, or formatting-failure values;
- never render `Invalid Date`;
- never crash the page because of timestamp formatting;
- do not change API contracts, schema, authentication, stores, diagnostics calculations, cancellation, or lifecycle behavior.

After safe timestamps, preferred maintenance order is:

1. shared safe formatting helpers;
2. behavior-preserving component extraction;
3. performance cleanup without feature changes.

---

## 3. Portable Product doctrine

SignalBoost is the reference integration environment, not a mandatory runtime dependency for commercial portables.

Every portable should:

- operate outside SignalBoost without source-code modification;
- remain provider-neutral where required by its contract;
- use buyer-supplied provider accounts, applications, credentials, and spend;
- preserve manual operation as a first-class reliability floor;
- expose clear installation, configuration, security, compliance, and test documentation;
- separate portable core logic from SignalBoost-specific host integration.

### Provider Hub BYOK/BYOI

Provider Hub is a first-class portable and shared provider foundation for SignalBoost products.

It must support two audiences without weakening either boundary:

- authenticated SignalBoost end users who connect and use their own supported provider accounts through a safe self-service experience;
- companies that license Provider Hub as a standalone, embedded, white-label, or managed enterprise deployment.

The end-user experience must remain available inside SignalBoost while the enterprise product is extracted and hardened. A preview route may reuse an existing verified BYOK surface, but it must not imply that unimplemented provider adapters or enterprise controls are production-ready.

Provider Hub must preserve tenant isolation, secret redaction, buyer ownership of accounts and spend, manual setup as a reliability floor, bounded metadata, and explicit approval for consequential changes. It composes the Universal Provider Framework but must not become a second COS, orchestration engine, policy engine, browser runtime, or credential store.

Read `docs/portables/provider-hub-byok-portable.md` before changing BYOK, provider settings, provider configuration stores, provider onboarding, provider capability metadata, or portable dependencies on external providers.

Recent portable-product work includes:

- PR #480: Enterprise Autonomy Engine foundation and portable doctrine.
- PR #482: internal read-only Portable Product Catalog.
- PR #484: deterministic Portable Product Dependency Graph.
- PR #488: admin-only Portable Product Readiness Dashboard.

Catalog, manifest, graph, and readiness surfaces are inspection-only. They do not package, license, provision, execute, mutate providers, or sell products by themselves.

---

## 4. Enterprise Autonomy Engine

The Enterprise Autonomy Engine (EAE) is a standalone, white-label, plug-and-play strategic intelligence product.

Intended flow:

```text
Enterprise systems
    -> Enterprise Autonomy Engine
    -> versioned Enterprise Intelligence Bus
    -> COS
    -> existing governed COS pipeline
```

EAE is before COS.

- EAE reasons.
- COS retains orchestration, approvals, workflow coordination, and execution management.
- EAE must not bypass, duplicate, or silently replace COS governance.

### Current EAE foundation

PR #480 established portable, tenant-scoped, deterministic contracts for observations, world state, candidate plans, decisions, policy dispositions, and COS envelopes.

PR #485 added deterministic pre-COS reasoning, including perception, prediction, multiple candidate plans, policy-weighted ranking, immutable JSON-serializable envelopes, stable provenance, tenant preservation, and the explicit `pre_cos_reasoning_only` boundary.

PR #486 covered Enterprise Digital Twin and enterprise-context work during this project sequence. Always verify its present merge status and current implementation before beginning a new EAE task.

### Recommended EAE sequence

Continue in bounded, independently testable phases:

1. Enterprise Knowledge Graph maturation.
2. Provider-neutral Enterprise Memory.
3. Enterprise Objective Engine.
4. Enterprise Risk Engine.
5. Enterprise Strategy Engine.
6. Enterprise Intelligence Bus v2 hardening.
7. Explicit COS integration through versioned contracts.

These remain pre-COS reasoning capabilities until a separately reviewed execution phase is explicitly approved.

Do not introduce merely because reasoning exists:

- network mutation;
- provider execution;
- browser execution;
- automatic approval;
- spending;
- publishing;
- infrastructure mutation;
- production repair.

---

## 5. Validation baseline

Inspect `saas/package.json` and current workflows before running commands. For Mission Review changes, the focused baseline should include the scripts that exist on current `main`, such as:

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

New bounded work should add a focused test script and preserve all relevant prior suites.

Broad repository failures must be named accurately and distinguished from feature-specific results. A passing typecheck or focused suite does not make a failing repository-wide workflow green.

---

## 6. Pull-request workflow

For every task:

1. Start from current `main`.
2. Check recent merged and open PRs.
3. Confirm whether similarly named work is obsolete or superseded.
4. Use a focused branch.
5. Preserve newer code, localization, response allowlists, and safety notices.
6. Add deterministic focused tests.
7. Run relevant prior suites, typecheck, build, and `git diff --check`.
8. Open a PR with exact results and all remaining failures.
9. Merge only when the requested review and required checks are satisfied.

Never describe a branch commit as deployed production. Never describe a review record, diagnostic result, plan, recommendation, digital twin, or approval requirement as an executed repair or business action.

---

## 7. Full documentation map

For detailed cross-cutting doctrine, read:

- `docs/ONBOARD-full.md`
- `docs/mission-002-eae-handoff.md`
- `docs/portables/README.md`
- `docs/portables/provider-hub-byok-portable.md`
- `docs/command-control-charter.md`
- `docs/AUDIT_MATRIX.md`
- `docs/browser-provider-sdk.md`
- `docs/portables/browser-agent-compliance.md`
- `docs/portables/render-module.md`
- `docs/portables/press-media-portable-design.md`
- `saas/lib/cos/README.md`
- `saas/console-core/README.md`
- `saas/docs/provider-integration.md`

The repository and current code always win over stale documentation. When architecture, safety boundaries, provider behavior, developer workflow, or current project status changes, update the relevant documentation in the same focused PR.
