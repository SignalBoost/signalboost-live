# Mission 002 Onboarding Supplement

This supplement is part of the mandatory onboarding context for active Mission 002 work. Read the root `ONBOARD.md` first, then this file before working on Mission Review.

---

## Mission 002 Phase 12 — Mission Review Timestamp Hardening

### Status

Active project / PR #493.

### Objective

Harden Mission Review timestamps so ordering, validation, rendering, and serialization remain deterministic and safe.

### Required boundaries

- Mission Review remains read-only.
- API access remains GET-only.
- Do not add repair, retry, approval, execution, or provider-mutation controls.
- Preserve current diagnostics, response allowlists, fingerprint protections, localization fields, and operator notices.
- Production execution, provider mutation, and browser execution remain disabled.

### Required timestamp behavior

- Validate timestamps before rendering or sorting.
- Normalize valid timestamps consistently.
- Keep unknown or malformed timestamps explicit rather than inventing dates.
- Preserve deterministic ordering when timestamps tie or are absent.
- Keep timestamp and fingerprint serialization bounded and stable.
- Prevent malformed values from reordering or crashing the Mission Review timeline.

### Validation

Run the relevant Mission Review timestamp, state, UI, diagnostics, API, typecheck, and production-build checks before completion.

---

## Planned Project — PR #483 Mission Review Accessibility and Keyboard Navigation

Repository: `SignalBoost/signalboost-live`

Pull request: #483 — `Improve Mission 002 manual-review accessibility and keyboard navigation`

### Working rules

- Work directly on the existing PR branch.
- Do not create another branch or pull request.
- Make PR #483 mergeable and green.
- Update the existing PR branch with the latest `main` before resolving failures.
- Do not merge PR #483 as part of this task.

### Required inspection

Before changing code, inspect:

- the current PR diff;
- merge conflicts with `main`;
- failed GitHub Actions checks;
- `MissionReviewClient.tsx`;
- Mission Review UI and accessibility tests.

Never replace the current Mission Review client with an older copy. Preserve all work merged after the original PR branch was created.

### Required preservation

Preserve, in particular:

- client-side response allowlists;
- the diagnostics panel and diagnostics parsing;
- timestamp validation and display protections;
- fingerprint validation and copy protections;
- current localization fields;
- current request-safety protections;
- all newer Mission 002 state and diagnostics behavior.

### Read-only boundary

The Mission Review page must remain read-only.

API requests must remain GET-only. Do not add mutation controls, repair controls, approval actions, retry actions, provider calls, browser execution, COS execution, Supervisor execution, or production state changes.

Keep these notices visible:

- Manual review only
- No repair has been executed
- Production execution disabled
- Provider mutation disabled

### Required accessibility behavior

Ensure all of the following:

- A native `button` opens review details.
- Enter activates the detail button.
- Space activates the detail button.
- Space activation prevents page scrolling.
- The detail opener has visible keyboard focus.
- Filters have accessible labels.
- Pagination controls have accessible labels.
- Loading state uses a status announcement.
- Error state uses an alert announcement.
- Empty results are announced.
- Fingerprint copy produces bounded ARIA live feedback.
- Escape closes the detail section.
- Closing details restores focus to the opener when possible.
- Focus restoration fails safely when the opener is no longer available.

### Implementation guidance

- Prefer native semantic controls instead of recreating button behavior with generic elements.
- Keep ARIA live messages short, bounded, and cleared or replaced deterministically.
- Do not expose raw API errors, diagnostic payloads, fingerprints, or unbounded copied text through live regions.
- Preserve current localization architecture; add or reuse translation fields rather than hard-coding replacement English copy where localized fields already exist.
- Keep detail state independent from filters and pagination unless current tested behavior requires closure after a result disappears.
- Do not weaken response parsing or allowlists to satisfy UI tests.

### Required validation

Run from `saas`:

```bash
npm run test:mission-review-a11y
npm run test:mission-review-ui
npm run test:mission-review-diagnostics
npm run test:mission-review-api
npm run test:mission-manual-review
npm run typecheck
npm run build
git diff --check
```

Fix every relevant failure.

### Completion report

Report:

- conflicts resolved;
- files changed;
- commit SHA;
- exact test results;
- remaining failed checks, if any;
- confirmation that the UI remains read-only;
- confirmation that API requests remain GET-only;
- confirmation that PR #483 was updated but not merged.

### Non-negotiable prohibitions

Do not:

- create a new branch;
- create a new PR;
- merge PR #483;
- remove newer diagnostics or allowlist protections;
- replace `MissionReviewClient.tsx` with an older file version;
- add mutations, repair actions, retries, approvals, execution controls, or provider controls;
- weaken TypeScript, tests, validation, or accessibility assertions.
