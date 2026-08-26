# COS Learning + Identity Enforcement Handoff — 2026-08-26

## Purpose

This handoff records the production fixes and remaining enforcement gaps discovered on 2026-08-26. It is intentionally evidence-based: a merged branch or green Preview is not treated as Production proof, and a runtime rule is not described as non-bypassable developer enforcement when repository controls still permit direct pushes.

## 1. Owner-directed learning: root cause and production fix

### Observed defect

Owner-directed material submitted through **Feed COS** was being retained and embedded, but downstream fact promotion was not happening.

The failure was not ingestion. The failure was between retained/embedded content and structured knowledge promotion:

```text
manual feed
→ retained                WORKING
→ embedded                WORKING
→ fact extraction         STARVED / NOT ATTEMPTED
→ structured promotion    NOT HAPPENING
→ downstream reuse        therefore incomplete
```

The generic promotion job sorted the full backlog oldest-first and re-applied generic autonomous-source confidence/relevance gates. That contradicted Directed Study's explicit policy that owner study intent establishes topic relevance while grounding and factual-truth checks still remain mandatory.

### Production fix

PR **#1522 — Fix continuous promotion of owner-directed COS learning** was merged to `main` as:

`ed26bc7c074f7c254dd1b2af255a22952545d629`

Production deployment:

`dpl_7M8qrT9qskYaEGkmgm74yzYnZZoE` — **READY**

Production acceptance on the merged deployment included:

- mandatory COS tests: **285/285 passed**;
- route-config guard passed;
- strip-safety guard passed;
- five-language i18n guards passed;
- optimized Next.js compile passed;
- TypeScript passed;
- Production aliases include `saas.signalboostapp.com`.

### What changed

- Owner-directed rows now have a priority selection path instead of waiting behind the entire generic historical backlog.
- The downstream promotion candidate carries owner-directed provenance into the promotion decision.
- Owner-directed authority bypasses only the **document-level topic relevance/confidence veto** that conflicts with explicit Directed Study intent.
- Source-kind admission, provenance, non-empty evidence requirements, grounded fact extraction, malformed-claim rejection and ungrounded-claim rejection remain mandatory.
- A dedicated authenticated cron route was added:

`/api/cron/cos-directed-study-promotion`

- It runs in bounded batches every 15 minutes:

`8,23,38,53 * * * *`

- It checks the owner-directed backlog before waking inference compute, so an empty queue stays cheap.
- Each run requests at most five owner-directed promotion documents under the existing bounded route deadline.
- The ordinary generic promotion job remains separate; owner-directed study does not disable autonomous learning.

### Live database baseline captured before first observed production worker run

At the production verification point on 2026-08-26:

- rows carrying `owner_directed_study`: **353**;
- rows carrying both the current owner-directed authority markers: **240**;
- older/legacy owner-directed rows missing the newer second marker: **113**;
- full-authority owner-directed rows pending promotion: **240**;
- owner-directed promotion attempts observed at that instant: **0**;
- autonomous/non-manual learning rows created in the preceding 24 hours: **44**.

This proves autonomous acquisition/source feeding was active. The new manual-feed promotion code was Production READY, but the first post-deploy database attempt had not yet been observed at that snapshot.

### Known legacy compatibility gap

The **113 older owner-directed chunks** have valid historical evidence such as:

- `owner_directed_study`;
- `submitted_by:...`;
- `study_intent:...`;
- `material_kind:...`;

but predate the newer `admission_basis:owner_directed_intent` marker. The current priority worker therefore recognizes the 240 newer full-marker rows first. Do **not** describe all 353 historical rows as covered until legacy compatibility/backfill is explicitly implemented and verified without fabricating provenance.

---

## 2. SignalBoost/COS identity behavior: current Production contract

There are two distinct identity surfaces and both are designed to avoid model-memory self-identification errors.

### A. Public SignalBoost company identity

The owner-approved canonical company definition is code-derived in:

`saas/lib/ai/cos/cosMemoryLayerDefinitions.ts`

Canonical public description:

> SignalBoost is a privately owned U.S. AI platform that develops intelligent software and automation solutions for small and medium-sized businesses, as well as enterprise and Fortune 500 organizations. Its platform supports English, Spanish, Portuguese, Polish, and Russian.

PR **#1490 — Fix public SignalBoost identity fallback** merged a deterministic, model-free path for the owner-requested identity shape:

`what is SignalBoost and who own/owns it?`

The implementation is in:

`saas/lib/ai/cos/deterministicUtilities.ts`

The result is recorded as:

- source: `deterministic-signalboost-identity`;
- confidence: `1`;
- `model_generated: false`;
- local reasoning not invoked;
- external AI not invoked.

This identity answer remains available even when COS reasoning is unavailable.

### B. COS/service self-identity and model/provider questions

Public questions such as:

- `What model powers COS?`
- `Which LLM do you use?`
- `Who made you?`
- `Who trained you?`
- `Are you ChatGPT?`
- `What kind of AI are you?`

are intercepted deterministically in:

`saas/lib/ai/cos/cosFirstAnswer.ts`

using:

`asksAboutServiceIdentity(...)`

from:

`saas/lib/ai/cos/publicDisclosureGate.ts`

The intercept happens **before any reasoner call**. The base model is therefore never asked to identify itself on the public path.

The approved public answer states that COS is SignalBoost's own reasoning layer and that underlying model, provider and infrastructure details are not published on that channel. Equivalent replies exist for English, Spanish, Portuguese, Polish and Russian.

This directly prevents the previously observed false self-attribution in which a base model claimed it was a large language model trained by another vendor.

### Public disclosure release gate

Every public COS answer is also checked before release by `publicDisclosureViolations(...)`.

The gate blocks, among other things:

- self-attributed model/provider names;
- infrastructure/provider identifiers;
- internal environment variables and internal routes;
- internal subsystem self-attribution;
- internal evidence labels and provenance-funnel notation;
- internal confidence/threshold disclosure when self-attributed.

General technical discussion is still allowed. For example, COS may explain knowledge graphs or mixture-of-experts models as general concepts; the rule blocks **self-attribution/internal disclosure**, not the vocabulary itself.

---

## 3. Identity enforcement hardening added on 2026-08-26

Before this handoff, the identity implementation existed and its focused tests existed, but the two dedicated suites were **not included in the mandatory Vercel COS deployment gate**.

That meant runtime behavior was deterministic, but a future code change could weaken it without those identity-specific regressions automatically failing the normal deployment test list.

Fix branch:

`fix/cos-identity-enforcement-docs-20260826`

The mandatory gate now includes:

- `tests/deterministicUtilities.node.test.ts`
- `tests/publicDisclosureGate.node.test.ts`

These tests pin the owner-requested identity behavior, including:

- the deterministic SignalBoost public identity answer;
- no model/external-AI invocation for that deterministic answer;
- detection of the full COS/service identity question family;
- five-language service-identity detection;
- the self-identity intercept occurring before the first reasoner call;
- the implementation-boundary reply being releasable and not phrased as an outage;
- blocking false claims such as `I am a large language model, trained by Google`;
- blocking public self-attribution to model/provider/infrastructure/internal systems;
- preserving ordinary technical discussion without false-positive disclosure blocking.

After this branch is accepted and merged, a normal Vercel build cannot pass if these identity regressions fail.

---

## 4. Important: broader COS behavioral contract PR #1521 is NOT complete

Do not confuse the deterministic identity enforcement above with the separate **COS behavioral contract / mandatory onboarding** work.

PR **#1521 — Enforce COS behavioral contract and mandatory onboarding** is still open.

Its own acceptance text correctly says it must not be described as non-bypassable until the behavioral gates pass **and `main` branch protection is enabled with the required onboarding check**.

A Codex review found a real P2 gap: the proposed contract was injected through `COS_GENERAL_REASONING_DISCIPLINE`, but direct COS inference paths such as the autonomy runtime mission director/model brain can call the provider-neutral AI port without receiving that discipline. Therefore the contract is **not globally enforced** yet.

Required repair before #1521 can be accepted:

```text
behavioral contract
→ centralize at shared COS inference boundary
   OR explicitly inject into every direct COS inference path
→ deterministic regression proves no direct path bypasses it
→ exact Preview green
→ merge
→ Production READY
→ branch-protection / required-check enforcement
→ then call it non-bypassable
```

Do not merge #1521 in its current reviewed state merely because the intent is correct.

---

## 5. Repository-level non-bypassability gap

At the latest repository check on 2026-08-26, GitHub reported `main` as:

`protected: false`

with required status-check enforcement off.

Therefore:

- runtime identity behavior is deterministic and server-enforced;
- identity-specific Vercel regressions can be made mandatory for the normal build;
- but repository governance is **not fully non-bypassable** while direct pushes to unprotected `main` remain possible.

This environment currently exposes branch-protection **read** access but not a branch-protection write action. Do not claim that repository-level non-bypassability has been enabled until GitHub reports `main` protected and the required checks are visible.

---

## 6. Status language to use

Use these exact distinctions until newer live evidence supersedes them:

```text
Autonomous public/source acquisition              WORKING / LIVE
Manual Feed COS retention                         WORKING / LIVE
Manual Feed COS embedding                         WORKING / LIVE
Owner-directed priority promotion code            PRODUCTION READY
First observed post-fix owner promotion DB run    VERIFY LIVE BEFORE CLAIMING
Legacy 113 owner-directed rows                     COMPATIBILITY/BACKFILL PENDING
SignalBoost public company identity                DETERMINISTIC / PRODUCTION
COS public self-identity intercept                 DETERMINISTIC / PRODUCTION
Public internal/model disclosure gate              SERVER-ENFORCED / PRODUCTION
Identity regression in mandatory Vercel gate       ADDED ON FIX BRANCH; MERGE/PROD PROOF REQUIRED
Broader COS behavioral contract (#1521)            OPEN / NOT GLOBALLY ENFORCED
GitHub non-bypassable main enforcement             NOT ENABLED (`main` unprotected)
```

Always re-query `main`, Production Vercel state, Supabase learning counts and PR #1521 before changing these labels.
