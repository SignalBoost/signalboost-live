<!-- ONBOARD.md -->

# SignalBoost — onboarding and handoff

**Last updated: 29 July 2026.** Read this before touching the Self-Healing Supervisor, the
buyer package, localization, or the supervisor database.

---

## 1. The one-line state

The Self-Healing Supervisor detects, diagnoses and evidences real production incidents
unattended; it installs as a zero-dependency npm package; it produces human-readable output in
English, Spanish, Portuguese, Polish and Russian; and a prospect can receive a redacted record
of a real incident through a link that needs no account.

The buyer evaluation package is now committed and merged. The next cross-cutting engineering
priority is to finish repository-wide localization so no user-facing English remains hardcoded
in executable UI, server responses, notifications, metadata, templates, or generated-content
surfaces.

---

## 2. How this repository is worked

Facts that change what a good deliverable looks like:

- **The owner works entirely in a browser** — primarily the GitHub web UI and Vercel dashboard.
  If an action is not realistically reachable from a browser, the deliverable should be a route,
  page, workflow, or downloadable artifact rather than terminal-only instructions.
- **Files are delivered as complete replacements.** Generated files should start with a
  first-line comment naming their repository path.
- **GitHub's editor can commit directly to `main`.** Use a focused branch and pull request for
  bounded work rather than depending on an operator to notice a branch selector.
- **Several agents may edit this repository in parallel.** Re-read the target file from current
  `main` immediately before editing it. Do not replace newer work with an older branch copy.
- **A migration committed to the repository is not proof that it ran in the database.** Verify
  applied state independently.
- **Never claim a test, build, deployment, push, PR, or merge succeeded unless it was actually verified.**

Core product principle:

> AI builds. Humans stay in control.

Sensitive actions remain behind explicit governance and approval gates, including credential
changes, permissions, deletion, spending, publishing, infrastructure mutation, provider
mutation, and production browser execution.

---

## 3. Completed Self-Healing Supervisor evaluation-package merge

### Pull request and merge

The buyer-facing evaluation package was prepared on branch:

`docs/self-healing-evaluation-package-20260728`

It was opened as **PR #893 — `docs(supervisor): publish evaluation and buyer package`** and
merged into `main` on 29 July 2026.

- Merge commit: `646ae3c57531f7701ff1ffde2d66ce6b98b97ee1`
- Changed files: 6
- Additions: 549
- Deletions: 25

### Files added or updated

1. **`.github/workflows/portable-package.yml`** — added the GitHub Actions workflow that checks
   the portable boundary, builds the package, runs `npm pack`, and retains a commit-addressed
   `.tgz` artifact for 90 days.
2. **`docs/portables/buyer-package/presentation.md`** — added the buyer presentation with the
   product position, installation model, evidence, limitations, editions, prices, pilot terms,
   support position, and next steps.
3. **`docs/portables/self-healing-technical-walkthrough.md`** — added the offline hands-on
   walkthrough covering package build, scratch installation, buyer-supplied `HostContext`, the
   acceptance scenario, negative control, language switching, and signed incident intake.
4. **`docs/portables/self-healing-evaluation-brief.md`** — expanded the engineering evaluation
   brief with package download/build instructions, reading order, test commands, proven claims,
   unproven claims, and the attack priorities.
5. **`docs/portables/self-healing-integration-guide.md`** — expanded the buyer integration guide
   with language behavior, human-readable versus machine-readable boundaries, execution-runner
   requirements, and live-environment acceptance requirements.
6. **`docs/portables/self-healing-support-terms.md`** — replaced commercial placeholders with
   the current pilot and first-year support commitments, channels, escalation route, supported
   versions, security reporting, and end-of-life notice.

### Validation completed before merge

All five pull-request workflow groups completed successfully:

- Audit Remediation Regression
- Pipeline Integrity
- Playwright Tests
- QA Scan
- Repo Targeting QA

The comprehensive SaaS node-test run completed **1,804 tests with 1,804 passing, zero failures,
zero cancellations, and zero skipped tests**.

The branch diff was confirmed as exactly six files. The workflow YAML parsed successfully and
no pasted-file separator artifacts were committed.

### Product boundaries preserved in the package

The documentation must continue to state these claims consistently:

1. No consequential step executes without a named human approval.
2. The portable runs inside the buyer's environment with no vendor-operated service in the
   execution path.
3. The product ships no execution runner; the buyer supplies the code that touches its systems.
4. Monitoring adapters mapped only against fixtures remain staged and unproven against the
   buyer's live traffic.
5. Seats and execution limits are contract terms, not enforced technical counters.
6. There is no SOC 2 report, ISO 27001 certification, or third-party penetration-test report.
7. Incident receipt, storage, audit visibility, and SIEM evidence are not held hostage by
   licensing state.

### Subsequent evaluation-plan work on `main`

A master evaluation plan was later added with phases, assigned roles, an 18-row functional
matrix, security-review questions, a findings register, fit questions, and sign-off criteria.
Its file header says `docs/portables/self-healing-evaluation-plan.md`, but the current repository
path is actually:

`docs/portables/portables/self-healing-evaluation-plan.md`

Do not create links that pretend the intended path already exists. Move the file to
`docs/portables/self-healing-evaluation-plan.md` in a separate focused cleanup and update all
references at the same time.

---

## 4. Build guards

`saas/package.json` currently runs this `prebuild` chain:

```text
validate:next-routes
validate:strip-safe
validate:i18n-copy
```

`validate:i18n-copy` currently chains:

```text
scripts/check-hardcoded-copy.mjs
scripts/migrate-page-copy-to-locales.mjs
scripts/check-generated-ui-locale-completeness.mjs
```

Two guards encode important product requirements:

- **`saas/scripts/check-hardcoded-copy.mjs`** is an AST-based hardcoded-copy guard. It currently
  scans `.tsx` files under `saas/app` and `saas/components`, checks literal JSX text and literal
  `placeholder`, `aria-label`, `title`, and `alt` values, and fails on new violations.
- **`saas/scripts/build-portable.mjs --check`** fails if the portable payload reaches a
  third-party package. Zero third-party dependencies is a commercial and security claim, not a
  cosmetic build preference.

The hardcoded-copy baseline is currently empty:

`saas/scripts/i18n-hardcoded-baseline.json`

Do not regenerate that baseline to hide newly introduced copy. A zero baseline is the required
steady state.

Vercel must continue to run prebuild before `next build`; otherwise a guard can exist in the
repository without protecting deployment.

---

## 5. The product

### What it is

The Self-Healing Supervisor is delivered as source that runs inside the buyer's environment.
There is no mandatory SignalBoost service, account, or telemetry path. The buyer implements a
`HostContext` supplying secrets, notifications, approvers, branding, durable data stores, SIEM
transport, and the execution runner that touches its systems.

**The core safety property:** no consequential step executes without a named human approving it,
in any edition, configuration, or licence state.

### Packaging

`saas/scripts/build-portable.mjs` walks the portable import graph, rewrites internal aliases,
excludes host-specific implementations, performs the dependency-boundary check, and emits the
installable package.

`.github/workflows/portable-package.yml` builds and publishes the `.tgz` artifact from pushes to
`main` that touch the portable boundary. A separate `portable-release.yml` may also exist; verify
which workflow is authoritative before adding or replacing release automation.

### Language behavior

The portable supports `en`, `es`, `pt`, `pl`, and `ru`, including region tags such as `pt-BR`
and `es-MX`. Human-facing approval requests, diagnoses, plan steps, expected results, stop
reasons, evidence summaries, and verification results follow the configured locale.

Machine-readable identifiers must not be translated. Audit event types, step identifiers,
incident types, error codes, schema versions, severities, and SIEM contract fields remain stable
in every language.

Translation applies when evidence or a notification is written. Historical evidence is not
silently rewritten when the configured language later changes.

Portable human-facing catalogues include:

- `saas/lib/supervisor/portable/notification-copy.ts`
- `saas/lib/supervisor/portable/observation-copy.ts`

A buyer writing its own notification sink should be able to import the same supported copy
rather than recreate English-only messages.

### Licensing

Licences are signed offline tokens. Entitlement is enforced at the execution boundary rather
than only in the browser UI.

Without a valid licence, diagnosis and dispatch may refuse, but receiving, recording, reading,
auditing, and SIEM visibility must remain available. A customer's incident history must never
be discarded because of billing state.

The browser licence screen is `/dashboard/supervisor/license`. The private signing key is shown
once and is not stored by the page.

Seats and execution limits are recorded in the token but are not technically enforced. Do not
sell or document them as implemented counters.

---

## 6. The database

The supervisor expects durable tables that may not exist merely because migrations are present
in the repository.

Use these checks before diagnosing an apparently empty capability:

- **`saas/supabase/checks/supervisor-table-inventory.sql`** — read-only inventory that reports
  expected tables as present or missing.
- **`saas/supabase/checks/supervisor-provisioning-bundle.sql`** — the required migrations in
  dependency order, made re-runnable for browser-based execution.

Re-run the inventory after each migration. Do not let a missing store appear to operators as a
valid empty result.

`provider_connections` has historically been absent. The observer can operate from explicit
`VERCEL_PROJECT_ID` and `VERCEL_PROVIDER_CONNECTION_ID` configuration, but current code and
schema must always be checked before relying on this statement.

---

## 7. Evidence and operation

### Evidence that exists

- A real cancelled production deployment was detected unattended and classified as
  `VERCEL_CANCELED` at warning severity.
- The supervisor planned, evaluated policy, resolved a read-only capability, dispatched an
  inspection, read deployment and alias state, verified the diagnosis, and produced fourteen
  audit events.
- The acceptance rehearsal covered financial, destructive, and credential-security categories
  with fifteen passing checks; consequential work paused, the approver was notified, and audit
  evidence was produced.
- Published rehearsal, drill, or production records can be shared without requiring the viewer
  to create an account. Identifiers must remain deeply redacted and tokens stored only as hashes.

### Observation-loop configuration

Relevant environment variables include:

```text
SUPERVISOR_LOCALE
VERCEL_PROJECT_ID
VERCEL_PROVIDER_CONNECTION_ID
VERCEL_API_TOKEN
VERCEL_TEAM_ID
VERCEL_OBSERVATION_ENVIRONMENT
SUPERVISOR_INTAKE_SECRET
OWNER_EMAILS
NEXT_PUBLIC_APP_URL
```

They are read at process start. Redeploy after changing them.

To produce a fresh cancelled-deployment incident safely, trigger a new Vercel deployment and
cancel that build while the existing live deployment continues serving. Always verify the
actual environment and current observer behavior before using the result as buyer evidence.

---

## 8. Buyer-package map

Buyer-package material is under `docs/portables/` unless an explicit current-path exception is
noted:

| Document | Audience and purpose |
| --- | --- |
| `buyer-package/presentation.md` | Primary buyer presentation with commercial terms |
| `buyer-package/overview.md` | Short first-touch overview |
| `buyer-package/README.md` | Delivery order and packaging guidance |
| `portables/self-healing-evaluation-plan.md` | **Current duplicated-path exception**; evaluation phases and sign-off |
| `self-healing-technical-walkthrough.md` | Offline 30-minute engineering walkthrough |
| `self-healing-evaluation-brief.md` | Attack surface, evidence, and known gaps |
| `self-healing-integration-guide.md` | Buyer interfaces and production acceptance |
| `self-healing-incident-intake-guide.md` | Incident intake contract |
| `self-healing-monitoring-connections.md` | Monitoring mappings and verification procedure |
| `self-healing-security-and-data-handling.md` | Security-review material and disclosed gaps |
| `self-healing-license-installation.md` | Licence installation guidance |
| `self-healing-operations-runbook.md` | Day-to-day operations |
| `self-healing-support-terms.md` | Support and procurement commitments |
| `self-healing-pilot-agreement.md` | Counsel draft; still requires legal-entity review |

The first buyer contact should remain bounded. Do not send every internal or legal document when
the presentation and a suitable redacted evidence link are sufficient for the first discussion.

### Current commercial position

- Enterprise: **$48,000 per production environment per year**
- Standard: **$30,000 per production environment per year**
- Pilot: **60 days at no cost**
- First year: negotiable for an appropriate reference design partner
- Severity 1 first substantive response target: **4 hours, 24/7**
- Severity 2–4 targets: **1, 2, and 5 business days**

Do not introduce per-incident metering while execution counts are not technically enforced.

---

## 9. Mandatory plan to eliminate all hardcoded English

### Goal

No user-facing English should be embedded directly in executable source outside the canonical
English locale or approved translation catalogue. English may remain the canonical source
language, but it must live in locale data or typed copy catalogues and must not be scattered
through rendering code, API responses, emails, metadata, or runtime templates.

The final rule is not merely “the page can translate.” The rule is:

> Every user-visible string has one canonical key or typed copy field, complete values for all
> supported languages, a locale-aware rendering path, and a CI rule that prevents regression.

### What counts as user-facing copy

Treat all of the following as localization scope:

- JSX text and component children;
- button, link, menu, tab, heading, label, helper, tooltip, empty-state, error, loading, success,
  warning, and confirmation text;
- `placeholder`, `aria-label`, `title`, `alt`, and other accessibility attributes;
- strings passed through variables or arrays into JSX;
- toast, alert, dialog, confirmation, banner, and notification messages;
- API response fields intended for a person, including `message`, `detail`, `reason`, and
  remediation guidance;
- page metadata, Open Graph text, document titles, descriptions, manifests, and install prompts;
- emails, approval requests, Slack/Teams/ServiceNow/PagerDuty messages, and support notices;
- report headings, generated-document wrappers, evidence summaries, and exported human-readable
  files;
- server-rendered copy, route copy, validation errors, forms, and onboarding instructions;
- portable-product messages and buyer-configurable branding copy;
- database seeds or stored templates that later render to a person.

Do **not** translate machine contracts: stable error codes, audit event names, schema identifiers,
step ids, provider ids, severity enums, environment names, protocol fields, or user-provided data.

### Current protection and its limits

The current AST guard is useful but incomplete. It scans literal JSX text and four literal
attributes only in `.tsx` files under `saas/app` and `saas/components`.

It does not by itself catch:

- a literal assigned to a variable and later rendered;
- string literals inside JSX expressions;
- `.ts` copy modules outside an approved locale catalogue;
- route handlers and `NextResponse.json` human-readable messages;
- `toast()`, `alert()`, `confirm()`, notification, or email call sites;
- Next.js metadata and manifest copy;
- root-level `app/` and `components/` if the scan is run only from `saas`;
- JSON, YAML, Markdown, SQL seeds, or stored runtime templates;
- server-side generated reports and exported files;
- dynamic generated content that arrives from AI or external providers.

Moving English from a component into an arbitrary unscanned `lib/` file is not completion. Copy
under `lib/i18n/` is acceptable only when it is a real locale catalogue with parity and tests.

### Required target architecture

1. **One supported-language contract.** Keep the platform language set explicit and shared:
   `en`, `es`, `pt`, `pl`, `ru`. Region tags normalize to the corresponding supported language
   unless a region-specific catalogue is intentionally provided.
2. **Canonical copy lives in locale sources.** English remains canonical, but components and
   routes reference keys or typed fields rather than repeating English fallbacks inline.
3. **Typed feature catalogues.** A feature may use `lib/i18n/<feature>Copy.ts` when all five
   language objects implement the same TypeScript type and the module contains no behavior that
   bypasses locale selection.
4. **Key-based dictionaries.** General UI may use locale JSON and the shared translation helper,
   but key parity must be enforced across all supported languages.
5. **No inline fallback debt.** Migrate call sites such as
   `t(dict, 'some.key', 'English fallback')` toward a key-only or typed-copy interface where the
   English canonical value comes from the locale source, not the render file. During migration,
   inline fallbacks are debt and must be inventoried rather than treated as the final design.
6. **Locale-aware server boundaries.** Route handlers return stable machine codes plus a
   localized human message only when the API contract actually exposes text to a person.
7. **Locale-aware metadata.** `generateMetadata`, manifests, share cards, and install surfaces
   resolve copy through the active locale.
8. **Notification catalogues.** Emails, approvals, chat notifications, support notices, and
   portable-host messages use the same locale contract as the UI.
9. **Generated content is separate from static UI.** `GeneratedContentLocalizer` and the
   translation API may translate user-visible free text, reports, documents, and AI output.
   They must not be used to excuse hardcoded navigation, controls, forms, or safety messages.
10. **Machine identifiers stay stable.** Translation must never alter audit keys, step ids,
    event types, error codes, or schema values.

### Required guard expansion

Extend `check-hardcoded-copy.mjs` or replace it with a shared AST-based localization suite that
covers the actual user-facing sinks.

The expanded guard should:

- scan both root and SaaS application surfaces where they exist;
- scan `.ts` and `.tsx` while using sink-aware rules to avoid flagging every technical string;
- detect literal JSX expressions and variables that are statically traceable to rendered copy;
- detect literal human messages passed to known UI sinks such as toast, alert, confirm, dialog,
  notification, and form-validation helpers;
- detect human-readable `NextResponse.json` fields and server-action return objects;
- detect literal metadata fields such as title and description;
- detect email and approval-notification templates outside approved locale catalogues;
- scan locale-bearing JSON/catalogue files for language parity and missing keys;
- maintain a narrow allowlist for proper nouns, trademarks, protocol literals, codes, test data,
  logs, and developer-only diagnostics;
- report the file, line, sink type, and offending string;
- fail CI on every new violation;
- retain a zero final baseline.

A stricter rule may discover existing debt. Inventory it in a dedicated report and remove it in
bounded feature batches. Do not make the debt disappear by broadly exempting files or by
regenerating the baseline after violations are introduced.

### Required migration phases

#### Phase A — inventory and contracts

- Produce a complete localization inventory by surface: root app, SaaS app, components, route
  handlers, metadata, notifications, portable copy, reports, and generated content.
- Identify every translation mechanism currently in use and choose the supported pattern for
  each surface.
- Define one shared `SupportedLanguage`/locale-normalization contract.
- Add key-parity and typed-catalogue tests.

#### Phase B — interactive UI

- Migrate visible copy in pages and components into locale dictionaries or typed feature-copy
  modules.
- Include accessibility text, empty states, loading states, errors, confirmations, tables,
  filters, pagination, and mobile layouts.
- Add rendered tests for `es`, `pt`, `pl`, and `ru` that fail when canonical English leaks into
  the selected non-English surface, except for an explicit allowlist.

#### Phase C — server and outbound communication

- Localize human-readable route/server-action responses.
- Localize emails, approval messages, chat integrations, support notices, and exports.
- Keep stable machine codes next to localized messages so clients and SIEM rules do not parse
  translated prose.

#### Phase D — metadata, documents, and generated content

- Localize page metadata, manifests, public share pages, and install prompts.
- Mark generated-content roots explicitly and verify translation uses original source text rather
  than translating a prior translation.
- Preserve technical blocks, code, ids, URLs, and user-entered text from unwanted translation.
- Verify translation-cache isolation by user, source hash, and target language.

#### Phase E — CI closure

- Run the expanded hardcoded-copy guard in `prebuild` and all required pull-request workflows.
- Require five-language key parity.
- Require focused localization tests for every new user-facing feature.
- Keep the baseline at zero.
- Prevent disabling the guard, widening exemptions, or replacing AST detection with regex-only
  detection.

### Acceptance criteria for “no hardcoded English”

The localization project is complete only when all of these are true:

1. The expanded guard scans every defined user-facing source surface and reports zero violations.
2. The hardcoded-copy baseline remains zero.
3. Every canonical user-facing key or typed field has `en`, `es`, `pt`, `pl`, and `ru` values.
4. Spanish, Portuguese, Polish, and Russian rendered tests expose no unapproved English UI copy.
5. Accessibility labels and form-validation messages follow the active locale.
6. Human-readable API, email, notification, metadata, export, and portable messages follow the
   active locale.
7. Generated content translates without translating machine identifiers or technical evidence.
8. Typecheck, build, focused localization tests, Playwright, and required repository workflows
   are green.
9. No feature is declared complete while its working UI still depends on an English-only string.

---

## 10. Known limits — disclosed, not hidden

- No execution runner ships with the portable.
- Eight monitoring adapters are mapped against fixtures and are not yet proven against each
  buyer's live traffic.
- In-memory dedupe and incident-record defaults do not survive independent serverless
  invocations; durable implementations are buyer-supplied interfaces.
- There is no unattended retry; recovery requires a person to start it.
- The product does not currently have SOC 2, ISO 27001, or a third-party penetration-test report.
- The master evaluation plan currently has a duplicated `docs/portables/portables/` path.
- Repository-wide hardcoded-English elimination is not complete until the expanded acceptance
  criteria in section 9 pass.

---

## 11. Open owner and product decisions

1. Mint and install the demonstration licence so the first buyer impression is not an expected
   unlicensed refusal.
2. Decide whether `signalboost-live` should remain public because source, buyer documentation,
   packaging, and licensing implementation are world-readable.
3. Complete legal-entity details and counsel review for the pilot agreement.
4. Publish a clean production incident record after the next safe cancelled deployment.
5. Move the master evaluation plan from `docs/portables/portables/` to `docs/portables/` and
   update all references.
6. Execute the localization phases in section 9 until the repository has zero hardcoded
   user-facing English across all defined surfaces.

---

## 12. Validation baseline

Always inspect current scripts before copying commands. For the Self-Healing Supervisor and
localization work, the validation set should include the relevant focused suites plus:

```bash
cd saas
npm run validate:i18n-copy
node scripts/check-hardcoded-copy.mjs --list
node scripts/build-portable.mjs --check
npm run typecheck
npm run prebuild
npm run build
```

Run the focused supervisor, portable-licence, acceptance-harness, and Playwright suites touched
by the change. Broad failures must be named accurately and distinguished from focused results.

Documentation-only changes still require diff review, path verification, Markdown/code-fence
inspection, and the repository's required pull-request workflows.

---

## 13. Standing rules earned the hard way

- When the workaround is “the operator must remember not to do the obvious thing in front of a
  customer,” treat that as a defect report, not a mitigation.
- Narrative UI written for a general case can overstate a specific record. Check every buyer-
  facing sentence against the exact run being shown.
- Verify every imported symbol and command in example code against current source before
  publishing technical documentation.
- A test suite that stays green when its safety property is deliberately removed is not testing
  that property.
- Generated-content translation is not a substitute for properly localized static UI.
- Moving English into an unscanned file is not localization.
- Do not change machine-readable identifiers when translating human-readable text.
- Update this file whenever the current product state, buyer package, localization architecture,
  safety boundary, or required validation process changes.

---

## 14. Completed report and document translation architecture

This section records the implementation completed immediately before this onboarding update. It
supplements the unfinished repository-wide work in section 9; it does not mean all hardcoded
user-facing English has been eliminated.

### Audit-specific historical report translation — PR #891

**PR #891 — `feat(audit): regenerate reports in the selected language`** was merged into `main`.

- Merge commit: `2b2a104177dfb81603f6260c43dc5eda06f247fb`
- Supported languages: `en`, `es`, `pt`, `pl`, `ru`

Behavior now established for audit reports:

- new audit reports are generated in the user's selected language;
- opening a historical audit under another language creates or reuses a translated display copy;
- translated finding fields and narrative are cached in `audit_logs`;
- switching back to a previously generated language reuses that cached copy;
- original `audit_findings` rows remain immutable;
- approval and remediation continue to use original finding identity and source records;
- the report narrative and source language are persisted for later translation;
- file paths, code, routes, environment variables, SQL identifiers, package names, URLs and quoted
  technical literals remain unchanged.

Primary files:

- `saas/lib/audit/reportTranslation.ts`
- `saas/app/api/hub/operator/audit/route.ts`
- `saas/app/api/hub/operator/audit/runs/route.ts`
- `saas/tests/auditReportTranslation.node.test.ts`

The audit-specific path must remain separate where governance requires it. A translated audit
finding is display-only and must never become the source for approval, patch generation, or
remediation execution.

### Platform-wide generated free-text translation — PR #892

**PR #892 — `feat(i18n): translate all generated reports and documents`** was merged into
`main`.

- Merge commit: `d4dcb1d2c14526a70992b50c3f4c3b5b09ece479`
- Supported languages: `en`, `es`, `pt`, `pl`, `ru`

Completed implementation:

- `saas/components/LanguageSuggestion.tsx` mounts translation behavior globally;
- `saas/components/i18n/GeneratedContentLocalizer.tsx` observes generated long-form DOM content;
- `saas/components/i18n/ReportTextLocalizer.tsx` remains a compatibility alias;
- `saas/app/api/i18n/translate-content/route.ts` provides one authenticated shared endpoint;
- `saas/lib/i18n/contentTranslation.ts` provides the bounded translation engine;
- `saas/supabase/migrations/20260729_generated_content_translations.sql` defines durable per-user
  translation caching;
- `saas/tests/generatedContentTranslation.node.test.ts` protects original preservation, global
  mounting, technical-literal safety and cache isolation contracts.

The global localizer covers eligible reports, documents, narratives, proposals, analyses,
assistant responses, headings, lists and long-form table values when the language dropdown
changes. It captures original text and retranslates from that original; it never translates a
previous translation. A `MutationObserver` detects newly rendered or changed content, requests
bounded batches, applies complete one-for-one results and leaves the original visible if
translation fails.

The shared server engine treats every segment as untrusted data rather than an instruction. It
preserves segment ids and order and rejects missing or mismatched output. It preserves names,
numbers, dates, certainty, URLs, email addresses, code, commands, file paths, route names,
environment-variable names, package names, model names and database identifiers.

No new Vercel environment variable was introduced. The path uses the existing AI model router
and the AI provider credentials already configured for the platform.

### Required markup for new generated-content surfaces

New reports and documents should declare a generated-content boundary using the established
attributes:

- `data-sb-generated-content`
- `data-sb-report` for reports
- `data-sb-document` for documents
- `data-sb-source-language` when the source language is known

Existing compatibility selectors also include `data-generated-content`, `data-report-content`,
`data-document-content`, `data-ai-content`, assistant-message role attributes, `article`,
`role=document`, `.prose`, `.markdown-body`, `.report-content`, `.document-content`,
`.assistant-message`, and `.message-content`.

Mark stable technical values with `data-sb-no-translate` or `translate=no`. The localizer already
skips scripts, styles, code, preformatted text, keyboard/sample text, form controls, buttons,
navigation and editable content.

Fixed buttons, controls, safety notices and navigation must still use locale keys. Do not place
known UI copy inside a generated-content boundary to bypass the hardcoded-copy guard.

### Durable cache deployment requirement

Apply this migration through the normal Supabase migration path in every environment where
cross-session translation reuse is required:

`saas/supabase/migrations/20260729_generated_content_translations.sql`

It creates `public.generated_content_translations` with:

- per-user ownership;
- a source hash rather than a duplicate source document;
- source-language, target-language and content-kind metadata;
- a translated JSON payload;
- uniqueness by user, source hash and target language;
- row-level security limiting a user to that user's cached copies.

The original feature table remains authoritative. The cache table is not a second document
store. Translation still works when the migration has not yet been applied, but a later browser
session may need to regenerate the copy. Cache failure must never hide the original.

### Boundaries and limitations

- The shared translation API is authenticated. Signed-out public generated content needs
  locale-authored copy, server-side localized generation, or a separately reviewed anonymous
  translation design.
- The browser layer translates rendered DOM text. It does not translate text embedded in images,
  screenshots, canvas output, audio, video, scanned PDFs, binary files, or third-party iframes.
- A downloaded PDF, DOCX, CSV, presentation, image, audio file, caption file, or other export does
  not change after the dropdown changes. Exporters must generate a new artifact in the selected
  language while preserving the original.
- Very large documents are processed in bounded segments. Features should preserve headings,
  paragraphs, lists and table structure rather than render one unbounded text node.
- Source-language detection exists when metadata is absent, but explicit stored language metadata
  is preferred.
- The global localizer is a compatibility and free-text layer, not evidence that static UI is
  fully localized.

### Required validation for this architecture

Localization or generated-content changes should include, where applicable:

```bash
cd saas
npm run validate:i18n-copy
node --test tests/generatedContentTranslation.node.test.ts tests/auditReportTranslation.node.test.ts
npm run typecheck
npm run prebuild
npm run build
npm run test:playwright
git diff --check
```

Manual acceptance must switch a current and historical report through all five languages,
confirm every translation derives from the original, confirm technical identifiers remain
unchanged, confirm translation failure leaves the original visible, confirm cache isolation by
user, test signed-out behavior separately, and regenerate downloadable artifacts in the selected
language.

The completed PRs solve generated report/document language switching. Section 9 remains the
mandatory plan for eliminating the rest of the hardcoded user-facing English in UI, APIs,
metadata, notifications, emails, exports, accessibility copy, public pages and portable runtime
surfaces.

---

## 15. Outreach — architecture, chokepoints, and the defects that shaped them

Every rule below exists because the alternative reached a real company.

### 15.1 Four independent paths can send

They share helpers but not control flow, and this is the most common source of "we fixed
that already" being wrong.

| Path | Entry point |
| --- | --- |
| Console Approve & Send | `PATCH /api/outreach/queue` — carries its own complete send implementation |
| Single send | `/api/outreach/send` |
| Batch send | `/api/admin/outreach/send-ready` |
| Background drafting | `lib/outreach/prospectCampaign.ts` via `/api/cron/prospect-campaign` |

A guard added to one protects none of the others. Verify each separately.

### 15.2 Enforcement happens at send time

Draft-time rules leave every already-approved row untouched — and those are the rows about
to go out.

- `applyOutreachSignature` — strips a dangling sign-off, then appends the closing block at
  the bottom, always: team name, contact address, platform link. Idempotent.
- `assertSafeOutreachMessage` — refuses guaranteed results, implied private-data access,
  unfilled placeholders, and bodies that read as an instruction to the assistant.
- Address-level duplicate protection, **scoped to the product** (§15.4).

A "must be present" rule and a "must be in position X" rule are different requirements. A
contains-check silently satisfies the first while failing the second — that is how emails
ended with a call to action and no signature.

### 15.3 Selection is part of safety

`send-ready` once had no `ORDER BY`. Postgres returned oldest-first in practice, so a batch
sent a DevOps pitch to prospects from a finished campaign. A batch send is irreversible, so
"whatever the database returned" is not an acceptable selection rule. Ordering is now
newest-first with `ids=`, `sinceHours=` and `source=` to narrow a run, and dry runs return
enough of the payload to judge it.

### 15.4 Duplicates are scoped to the product, not the address

`outreach_queue.product_key` holds a slug of what is being sold. Two rows collide only when
the address **and** the product match, so a prospect list stays reusable across products —
burning an address after one campaign is the wrong trade. Null means unlabelled, and
unlabelled rows compare only against each other.

Scoped at every layer: discovery excludes companies already approached **about this
product**, draft creation allows a second draft under a different product, and all three
senders compare product rather than address.

### 15.5 Discovery

Region and language are properties of the target, never of the operator's UI. A US prospect
receives English while the console displays Portuguese, and that is correct.

- `pickOutreachLanguage` decides from the target's own URL and name, requiring repeated
  evidence before letting scraped body text choose. One place name in page text is not
  evidence — that rule exists because a US company mentioning Latin American markets was
  emailed in Spanish.
- `COUNTRY_PROFILES` carries, per country, the local search name, ccTLD and vertical terms
  **in that country's language**. Queries stay under 120 characters.
- Directory and ranking pages are rejected. They are lists *of* providers, not providers.

### 15.6 Timeouts

`/api/cron/prospect-campaign` 504'd on every invocation for two days: `maxDuration` was 60
while one company costs a model call plus up to nine page fetches. The route is now 300, the
tick budget 240s, and **every awaited call in the hot path has its own ceiling**. Bounding
one loop inside a serverless function is not enough.

Any fetch without a deadline is a latent forever-spinner. The Contacts page hung for three
hours on a request that never settled, because `finally` only runs when a promise resolves.

### 15.7 Approval is pull-only, plus a digest

Nothing alerts on pending drafts by design. `/api/cron/outreach-digest` emails the owner the
newest pending rows daily — the drafts themselves, not a count, because a count still
requires opening the console. It sends nothing when the count is zero.

---

## 16. Portables — the plug-and-play doctrine

### 16.1 Bring your own, everywhere

The owner's standing requirement: a buyer is never told which platforms, providers or
networks they may use. Three surfaces now implement it identically.

| Surface | Ships | Buyer declares |
| --- | --- | --- |
| Social publishing | 8 connectors | any platform — `outreach_social_custom_platforms` |
| Integrations | 27 providers | any tool — `integration_custom_providers` |
| Paid ads *(inside Marketing + Sales)* | Meta | any network — `declareAdPlatform` |

A declaration is data: where to authorize, what the request looks like, where the answer
appears. It runs the identical path as a built-in — same confirmation rule, same approval
gate, same credential resolver. **Buyers can add reach, never authority.**

Each surface refuses the declaration it cannot make safe. Social refuses one that cannot
confirm a post. Integrations refuse one that would overwrite an implemented provider with a
descriptor. Ads refuse one that cannot report spend or be paused.

### 16.2 The boundary is proven, not claimed

`scripts/build-social-portable.mjs` and `build-marketing-sales-portable.mjs` walk the import
graph from a public barrel and refuse to build on any host alias, any third-party package,
or any path outside the layer. Then they pack, install into a clean directory, and confirm
the installed manifest declares no dependencies.

Both run in CI on every change to the layer. The guard is tested by breaking it deliberately:
a host import added to a connector fails the check by name. A guard that stays green when you
violate what it guards is measuring nothing.

Two artifacts from one codebase — Social Outreach Connector (9 files) inside Marketing +
Sales (16, spanning `lib/outreach` and `lib/ads`). Sold as one product; buildable as two.
Paid placement lives in its own folder because its risk profile differs, not because it is a
different product: advertising is marketing.

### 16.3 Paid ads are a different class of risk

A failed post costs nothing. A wrong ad spends the buyer's budget at machine speed and the
money does not come back. So `lib/ads/` is built around the spend:

- **No spend without a cap**, checked before any provider is contacted. Money is integer
  minor units; a fractional cent is refused rather than rounded, because it means someone
  did floating-point arithmetic on money upstream.
- **The spend approval is separate from the content approval.** Approving wording is not
  approving a budget, and the two are often different people.
- **Reconcile against the provider.** Platforms overdeliver and convert currency. What was
  spent is whatever they report, never our own arithmetic.
- A cap in a different currency from the account ceiling is **refused, not converted** — an
  exchange rate applied here would be a guess about real money.
- `spendUnits` must be declared `minor` or `major`. Guessing is a hundredfold error.
- Meta campaigns are created **PAUSED**: the campaign exists, the cap is registered, and a
  human turns it on, so a mistake in the create request costs nothing.

`startAdCampaign` has no parameter that skips the gate. A supported way to spend without a
cap would be a supported way to defeat the product.

### 16.4 Distinctions the UI refuses to blur

- A capability is **implemented** (a function exists) or **declared** (claimed, nobody wrote
  it). Both are shown, coloured differently. A buyer discovering at run time that a listed
  capability was a promise is the failure this product is sold against.
- Marketing **agencies** — Ogilvy, WPP, Publicis — are not integrations. They have no APIs.
  They are potential buyers.
- Platform approval is the **buyer's** burden, not ours, and the buyer documents say so per
  platform rather than implying they are equal.

### 16.5 Delivery hazards, all observed repeatedly

- **New files slip most often** — they must be created rather than pasted over. Say "new
  file" explicitly.
- **Never ship a pair of files whose names differ only by a suffix.** `x.ts` and `x-store.ts`
  have been cross-pasted twice, losing the real content of both. Consolidate or rename.
- **Locale JSONs go one per message**, with expected byte size and first visible string. A
  slot swap has happened twice; the completeness guard reporting exactly *100% identical to
  English* is the signature.
- **Verify every file of a batch after a green**, not just the one you suspect. A batch that
  is internally consistent still fails in the half-applied state.
- An error naming a path that does not match the repo layout means a misplaced paste, not a
  code fault.
- `esbuild` and strip-types checks pass on undefined variables. Only a real `tsc` catches
  them. Run one before any multi-file delivery.
