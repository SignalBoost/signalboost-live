# ONBOARD.md — Mandatory SignalBoostAi Engineering Onboarding

This is the mandatory first read for every developer, AI coding agent, AI reviewer, operator, contractor, and contributor working on `SignalBoost/signalboost-live`.

The repository is always the source of truth. This document is an index and operating doctrine, not a substitute for reading the current code.

## Required reading order

1. Read this file.
2. Read `docs/mission-002-eae-handoff.md` for the current Mission 002, Portable Product, and Enterprise Autonomy Engine state.
3. Scan the repository structure.
4. Read the exact implementation and test files for the task.
5. Inspect recent merged and open pull requests before changing fast-moving code.
6. Never diagnose, code, or report status from memory alone.

The previous full onboarding handbook remains available in repository history at commit `c6356abe109b8bbc4e4244af991eb934f1abbebf`. When working on legacy COSA, video, social publishing, Press & Media, Console Hub, Browser Runtime, audit remediation, provider onboarding, Vault, or infrastructure behavior, consult that historical version together with current code and current documentation.

---

## 1. Platform identity

SignalBoostAi is a U.S.-based AI business growth platform.

Public surfaces:

- `signalboostapp.com` — digital shopping mall and affiliate surface.
- `saas.signalboostapp.com` — SaaS console, COSA, Console Hub, Studio, Audit, Cybersecurity, Outreach, Supervisor, and admin workspace.

Brand rules:

- Use `SignalBoostAi` for the AI/product/campaign identity.
- Use `www.saas.signalboostapp.com` as the primary SaaS CTA URL.
- Do not invent prices, affiliate counts, performance metrics, guarantees, or unsupported features.

---

## 2. Governance doctrine

Core principle:

> AI builds. Humans stay in control.

Sensitive actions must remain behind the existing approval and authorization gates, including:

- publishing;
- sending outreach;
- spending money;
- creating or rotating provider keys;
- changing environment variables;
- DNS or infrastructure changes;
- database migrations;
- deletion or disabling of resources;
- production repair;
- provider mutation;
- browser execution against production or real provider accounts.

Never claim that a plan, diagnostic result, review record, generated artifact, branch commit, staged PR, or approval requirement means execution occurred.

---

## 3. Engineering rules

Every contributor must:

- build from current `main`;
- inspect recent PRs before editing a fast-moving subsystem;
- read every file before modifying it;
- preserve newer merged behavior;
- prefer small focused PRs;
- keep behavior deterministic where required;
- fail closed at governance, identity, tenant, approval, and execution boundaries;
- preserve five-language operator support where the subsystem already requires English, Spanish, Portuguese, Polish, and Russian;
- never expose credentials, tokens, authorization headers, cookies, browser storage, provider responses, stack traces, or secret values;
- never claim a test, build, deployment, PR, commit, or merge succeeded without verification.

Do not overwrite a current implementation with code from an older branch or obsolete PR.

---

## 4. Portable Product doctrine

SignalBoost is the laboratory and reference integration environment. It must not become a mandatory runtime dependency for commercial portable products.

Every commercial portable must:

- operate outside SignalBoost without source-code modification;
- remain white-label and plug-and-play where intended;
- keep portable core logic separate from SignalBoost host integration;
- use buyer-supplied provider accounts, applications, keys, and spend where applicable;
- preserve manual operation as a first-class reliability floor;
- avoid hidden SignalBoost-only dependencies;
- expose deterministic, serializable contracts;
- document architecture, security, compliance, setup, testing, and known limitations.

Recent merged portable-product work includes:

- PR #480 — Enterprise Autonomy Engine foundation and portable doctrine;
- PR #482 — read-only Portable Product Catalog;
- PR #484 — Portable Product Dependency Graph;
- PR #488 — Portable Product Readiness Dashboard.

Catalog, manifest, dependency, and readiness surfaces are inspection-only. They do not package, license, provision, execute, mutate providers, or sell products by themselves.

---

## 5. Mission 002 — Universal Provider Framework

Mission 002 establishes the provider-neutral Universal Provider Framework under `saas/lib/provider-framework/` and the governed manual-review path for outcomes that cannot execute automatically.

The provider framework is the canonical metadata and SDK boundary for registration, lifecycle, capability discovery, configuration, health, versioning, rate limits, webhook and scheduler metadata, authentication metadata, environments, risk, approval requirements, evidence, and verification.

The framework itself must not contain:

- orchestration;
- policy bypass;
- Browser Runtime execution;
- Supervisor dispatch execution;
- credentials;
- provider mutations;
- provider-specific business logic that belongs in an adapter.

Existing Mission 001 BPAL remains the browser-provider metadata foundation and is bridged into the universal framework rather than replaced.

---

## 6. Mission 002 Manual Review — current state

The full phase history, PR map, architecture, file map, test baseline, and roadmap are documented in:

`docs/mission-002-eae-handoff.md`

Current completed behavior includes:

- durable manual-review persistence and idempotent routing;
- fingerprint and revision binding before routing;
- authenticated bounded list and detail APIs;
- strict runtime response allowlists;
- read-only operator list, filters, pagination, diagnostics, and detail views;
- keyboard and screen-reader accessibility;
- safe focus restoration;
- bounded clipboard announcements;
- request cancellation;
- stale-response prevention;
- independent list, diagnostics, and detail state;
- isolated diagnostics and detail retry controls;
- GET-only network behavior;
- no lifecycle or execution controls.

Relevant merged PRs include:

- #460 — durable manual-review routing;
- #466 — read-only Manual Review API;
- #474 — runtime response-allowlist hardening;
- #487 — accessibility and keyboard navigation;
- #489 — focus-restoration hardening;
- #490 — stale-request protection;
- #491 — independent Mission Review UI state.

PR #483 is obsolete and must not be merged.

### Mandatory Mission Review boundary

Mission Review remains:

- authenticated;
- admin/operator-only;
- inspection-only;
- read-only;
- GET-only.

Keep these notices visible:

- Manual review only
- No repair has been executed
- Production execution disabled
- Provider mutation disabled

Do not add approval, workflow retry, replay, resolve, repair execution, provider mutation, GitHub mutation, browser execution, shell execution, LLM execution, automatic production repair, or production execution through this UI or its APIs.

Before changing Mission Review, inspect:

- `saas/app/dashboard/supervisor/missions/reviews/MissionReviewClient.tsx`;
- API routes under `saas/app/api/internal/supervisor/missions/reviews/`;
- manual-review lifecycle and store code under `saas/lib/supervisor/`;
- `saas/lib/i18n/supervisorSocLocales.json`;
- all `saas/tests/missionReview*.node.test.ts` files;
- `docs/mission-002-phase*.md`;
- `docs/mission-002-eae-handoff.md`.

### Next bounded Mission 002 work

The next recommended UI-only slice is safe timestamp rendering:

- use one shared timestamp formatter;
- preserve locale formatting for valid values;
- return the localized unavailable label for missing, malformed, non-finite, or formatting-failure values;
- never render `Invalid Date`;
- do not change API contracts, database schema, authentication, stores, diagnostics calculations, request cancellation, or mission lifecycle behavior.

---

## 7. Enterprise Autonomy Engine

The Enterprise Autonomy Engine (EAE) is a standalone, white-label, plug-and-play strategic intelligence product.

Architecture:

```text
Enterprise systems
    -> Enterprise Autonomy Engine
    -> versioned Enterprise Intelligence Bus
    -> COS
    -> existing governed COS pipeline
```

EAE is before COS.

EAE responsibilities:

- enterprise observation and context;
- deterministic reasoning;
- prediction;
- multiple candidate plans;
- policy-aware ranking;
- objectives, risks, relationships, dependencies, and strategic recommendations;
- immutable, tenant-scoped, JSON-serializable intelligence envelopes.

COS responsibilities remain:

- orchestration;
- approvals;
- workflow coordination;
- execution management;
- governed handoff to existing execution systems.

EAE must not bypass, duplicate, or silently replace COS governance.

### Merged EAE work

- PR #480 — portable EAE foundation, deterministic contracts, evidence fusion, policy dispositions, tenant isolation, secret rejection, and no-execution boundary.
- PR #485 — deterministic pre-COS reasoning layer, perception, prediction, multiple plans, ranking, provenance, and Enterprise Intelligence Envelope v1.

PR #486 covered the Enterprise Digital Twin/context layer during the handoff. Always recheck its current status and current `main` before starting new EAE work.

### EAE safety boundary

Until a later separately reviewed and explicitly approved execution phase, EAE must not add:

- network mutation;
- provider SDK execution;
- provider mutation;
- browser execution;
- automatic approval;
- spending;
- publishing;
- infrastructure changes;
- automatic production repair.

Recommended sequence after the digital-twin/context layer:

1. Enterprise Knowledge Graph maturation;
2. provider-neutral Enterprise Memory;
3. Enterprise Objective Engine;
4. Enterprise Risk Engine;
5. Enterprise Strategy Engine;
6. Enterprise Intelligence Bus v2 hardening;
7. explicit COS integration through versioned contracts.

---

## 8. Mission 001 and Browser Runtime boundary

Mission 001 Supervisor, BPAL, durable coordination, Vercel health intelligence, sandbox Browser Runtime, execution history, and operator diagnostics remain governed systems with their own documentation and tests.

Production BrowserExecutor execution, Vercel browser automation, real-provider credentials, and external provider mutations remain disabled unless a later explicitly approved architecture changes that boundary.

Sandbox or dry-run capability must never be described as production execution.

---

## 9. Validation baseline

Inspect `saas/package.json` and the affected subsystem before running commands.

For Mission Review work, the expected focused baseline currently includes:

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

Also run subsystem-specific tests for provider framework, Supervisor, BPAL, approval, portable products, or EAE when those areas are touched.

Broad repository failures must be reported accurately and distinguished from focused feature results. A failing workflow must never be described as green.

---

## 10. Pull-request workflow

For each task:

1. Start from current `main`.
2. Create a focused branch.
3. Change only the required files.
4. Preserve newer behavior, localization, allowlists, and safety notices.
5. Add focused deterministic tests.
6. Run relevant prior suites, typecheck, build, and `git diff --check`.
7. Open a PR with exact test results and remaining failures.
8. Merge only after required checks and requested review conditions are satisfied.

Documentation-only changes must still preserve truthfulness and current architecture.

---

## 11. Documentation map

Current project handoff:

- `docs/mission-002-eae-handoff.md`

Mission phase documents:

- `docs/mission-002-phase*.md`

Portable products:

- `docs/portables/README.md`
- `docs/portables/enterprise-autonomy-engine.md`
- other per-portable documents under `docs/portables/`

Cross-cutting governance and audit documentation includes:

- `docs/command-control-charter.md`
- `docs/AUDIT_MATRIX.md`
- `docs/red-team/mission-001-red-team-review.md`
- `docs/onboarding-enforcement.md`

Historical full onboarding handbook:

- repository version of `ONBOARD.md` at commit `c6356abe109b8bbc4e4244af991eb934f1abbebf`.

When documentation and current code disagree, inspect the implementation and update the documentation in the same focused change.

---

## 12. Final safety reminder

A review record is not a repair.

A diagnostic is not execution.

A plan is not approval.

An approval requirement is not approval.

A branch is not production.

A merged PR is not a verified deployment.

A sandbox browser run is not provider automation.

An EAE recommendation is not a COS action.

Human control, explicit approval boundaries, tenant isolation, secret protection, deterministic verification, and truthful status reporting must be preserved.