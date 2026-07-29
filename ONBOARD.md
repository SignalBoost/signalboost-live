<!-- onboard.md -->

# SignalBoost — onboarding and handoff

**Last updated: 29 July 2026.** Read this before touching the Self-Healing Supervisor, the
buyer package, or the supervisor database.

---

## 1. The one-line state

The Self-Healing Supervisor detects, diagnoses and evidences real production incidents
unattended; it installs as a zero-dependency npm package; it speaks five languages end to end;
and a prospect can be sent a redacted record of a real incident through a link that needs no
account. What remains is commercial, not technical.

---

## 2. How this repository is worked

Facts that change what a good deliverable looks like. Ignore them and you will waste a day.

- **The owner works entirely in a browser** — the GitHub web UI and the Vercel dashboard.
  There is no terminal. If an action is not reachable from a browser, the deliverable is a
  route and a page, not an instruction. This has caught out two CLIs already
  (`issue-license.ts`, the packaging script).
- **Files are delivered as complete replacements and pasted by hand.** Every generated file
  starts with a first-line comment naming its own path. A 300KB file is not a deliverable; a
  build script that produces it is.
- **GitHub's editor defaults to committing straight to `main`.** Any instruction that depends
  on the person noticing a branch radio button is a production risk. Prefer experiments that
  cannot reach `main` at all.
- **Several agents edit this repository in parallel.** Files have been rewritten mid-task more
  than once. Re-read a file from `main` immediately before editing it, and before building
  anything non-trivial check whether another lane already shipped it.
- **A migration in the repo is not a migration in the database.** Nothing records which have
  been applied. See section 5.

## 3. Build guards

`prebuild` runs on every deploy and blocks it on failure. As of this writing:
`validate:next-routes`, `validate:strip-safe`, then `validate:i18n-copy`, which itself chains
several i18n scripts.

**The i18n chain has changed three times in one day.** Read `package.json` to see what is
actually live rather than assuming. Current rule for new UI: **user-facing English may not
appear inside `app/` or `components/`.** Put copy in `lib/i18n/<feature>Copy.ts` and import it —
`lib/` is not scanned, the pattern passes every version of the guard so far, and it keeps the
five languages authored together.

Two guards worth knowing because they encode real incidents:

- **`check-hardcoded-copy.mjs`** is AST-based and checks per string, so it catches a bare
  `<button>Delete account</button>` inside a file that correctly calls `t()` elsewhere. Its
  baseline is now empty: any new literal fails the build immediately.
- **`build-portable.mjs --check`** fails if the portable payload reaches any third-party
  package. Zero dependencies is a selling point, and this is what keeps it true.

Vercel builds with `buildCommand: "npm run prebuild && next build"` in `saas/vercel.json`.
Before that was set, the guards never ran in a deploy at all — a crashing guard shipped green.

---

## 4. The product

### What it is

An incident supervisor delivered as source that runs inside the buyer's environment. No vendor
service, no vendor account, no telemetry. The buyer writes one host adapter implementing
`HostContext` — secrets, notifications, approvers, branding, dispatch ledger, SIEM sink, and
the executor that touches their systems.

**The claim it is sold on:** no consequential step executes without a named human approving it,
in any edition, configuration or licence state.

### Packaging

`saas/scripts/build-portable.mjs` walks the import graph from the portable entry points,
rewrites `@/` aliases to relative paths, excludes host implementations (detected by behaviour —
any file importing a third-party package), and emits an installable package. 87 files, ~116KB,
**zero third-party dependencies**.

`.github/workflows/portable-package.yml` builds it on every push and attaches the `.tgz` to the
run, so an evaluator downloads it from the Actions tab. Note a `portable-release.yml` also
exists from another lane — establish which is authoritative before adding a third.

### Language

Everything a person reads is produced in the configured language: approval requests, plan
diagnoses, step descriptions, expected results, stop reasons, evidence summaries, verification
results. English, Spanish, Portuguese, Polish, Russian. Set `locale` on `HostBranding`; region
tags like `pt-BR` are accepted. On this platform it comes from `SUPERVISOR_LOCALE`.

**Nothing a machine parses is translated.** Audit event types, step ids, incident types and
severities are identical in every locale, so a SIEM rule cannot break because a team switched
language. Text is translated when written, not when displayed — an evidence record keeps the
language it was recorded in.

Catalogues live in `lib/supervisor/portable/notification-copy.ts` and `observation-copy.ts`,
both exported from the portable barrel so a buyer writing their own notification sink gets the
same wording.

### Licensing

Signed offline tokens. The gate sits at the execution boundary, not at a UI, and is
**fail-closed**: with no licence, `repair.plan` and `repair.dispatch` refuse. Receiving,
recording and auditing incidents are never gated — a licence controls diagnosis and dispatch,
never a customer's visibility into their own systems.

Mint from the browser at `/dashboard/supervisor/license`. The private key is shown once and
never stored.

**Seats and execution limits are recorded in the token and not enforced.** They are contract
terms. Do not price as though they were a technical control.

---

## 5. The database

**Fifteen of the sixteen tables the supervisor expects did not exist** until 28 July. The
observation cron had been running every fifteen minutes for weeks with nowhere to write. The
console reported a bare 500; the demo page caught the same failure and reported an empty state.
Neither said the store was missing.

- **`saas/supabase/checks/supervisor-table-inventory.sql`** — read-only, prints MISSING or
  present for every expected table. **Run this first** whenever a supervisor capability looks
  wired but inert.
- **`saas/supabase/checks/supervisor-provisioning-bundle.sql`** — the eight required migrations
  concatenated in dependency order, made re-runnable. One paste.

`provider_connections` reads MISSING and always will — no migration in the repo creates it. The
observer does not need it when `VERCEL_PROJECT_ID` and `VERCEL_PROVIDER_CONNECTION_ID` are set.

**Two habits that let this hide, both worth keeping:** re-run the inventory after each
migration rather than assuming; and never let a missing store look like an empty result. Error
handling that is too forgiving costs diagnoses.

---

## 6. Evidence that exists

**A real production incident, 29 July, detected unattended.** A production deployment was
cancelled; nobody reported it. The supervisor detected it, classified it `VERCEL_CANCELED` at
warning severity, produced a plan, evaluated policy, resolved a read-only capability, dispatched
an inspection, read the deployment and its production aliases, verified the diagnosis and wrote
fourteen audit events.

**An acceptance rehearsal**, three risk categories, fifteen checks, all passing against real
wiring — consequential step paused every time, approver notified through a real channel, audit
trail produced. Run it any time from `/dashboard/supervisor/demo`; it writes no state.

**A share link.** Publish a rehearsal, drill or production run and send the URL. No account
needed. Identifiers are masked at every depth — `dpl_`, `prj_`, `team_`, `*.vercel.app`, email
addresses. Revocable; tokens stored only as hashes.

### Running the observation loop

`SUPERVISOR_LOCALE`, `VERCEL_PROJECT_ID`, `VERCEL_PROVIDER_CONNECTION_ID`, `VERCEL_API_TOKEN`,
`VERCEL_TEAM_ID`, `VERCEL_OBSERVATION_ENVIRONMENT` (`production`), `SUPERVISOR_INTAKE_SECRET`,
`OWNER_EMAILS`, `NEXT_PUBLIC_APP_URL`. All read at process start — **redeploy after changing
any of them.**

Two traps. Vercel's variable list shows the *scope* under each name, not the value, and
sensitive values are never displayed — the only way to read `VERCEL_OBSERVATION_ENVIRONMENT`
from outside is the Environment field on a run record. And although the cron is `*/15`, new
runs appear roughly hourly because triggers are deduplicated per observation window.

**To produce a fresh incident safely:** trigger a redeploy in Vercel and cancel it mid-build.
Nothing customer-facing changes — the live deployment keeps serving — and the observer treats a
cancelled production deployment as an incident.

---

## 7. The buyer package

Under `docs/portables/`:

| Document | Audience |
| --- | --- |
| `buyer-package/presentation.md` | The single document you present. Prices filled |
| `buyer-package/overview.md` | Shorter first-touch one-pager |
| `buyer-package/README.md` | What to send, in what order |
| `self-healing-evaluation-plan.md` | The evaluating team — phases, 18-row test matrix, sign-off |
| `self-healing-technical-walkthrough.md` | An engineer, 30 minutes, offline |
| `self-healing-evaluation-brief.md` | What to attack and where we are weakest |
| `self-healing-integration-guide.md` | The interfaces, in production terms |
| `self-healing-incident-intake-guide.md` | The incident contract |
| `self-healing-monitoring-connections.md` | Eight vendor mappings, verification procedure |
| `self-healing-security-and-data-handling.md` | A security reviewer |
| `self-healing-license-installation.md` | Platform team — **strip the vendor section first** |
| `self-healing-operations-runbook.md` | Whoever runs it |
| `self-healing-support-terms.md` | Procurement. Values filled |
| `self-healing-pilot-agreement.md` | Counsel. Still needs the legal entity |

**First touch is three things:** the presentation, and a share link. Not fourteen documents.

### Commercial position

$48,000 enterprise, $30,000 standard, per production environment per year. 60-day pilot at no
cost; first year negotiable for a design partner who acts as a reference. Support: 4-hour
Severity 1 response 24/7; 1, 2 and 5 business days for Severity 2–4.

The closest comparable is Rundeck self-hosted at roughly $51,000 — a mature product with SOC 2
and a support organisation. Pricing just under it is defensible; pricing at parity invites a
comparison this product would lose on maturity.

**Do not meter anything.** Seats and executions are not enforced, and per-incident pricing
charges a customer more during their worst week — which reviewers already criticise in
competing tools.

### Claims that must not drift

Repeated across several documents. If one changes, all change together.

1. No consequential step executes without a named human — any edition, including unlicensed.
2. Runs wholly in the buyer's environment. No vendor service, account or telemetry.
3. Seats and execution limits are contract terms, not technical controls.
4. Monitoring adapters are staged; a buyer's first alert is the first live payload.
5. No repair executes without a buyer-supplied runner.
6. No SOC 2, no ISO 27001, no third-party penetration test.

---

## 8. Known limits — disclosed, not hidden

- **No execution runner ships.** Without one, the product diagnoses, gates, verifies and audits,
  then reports honestly that nothing was repaired.
- **Eight monitoring adapters are mapped against fixtures, never live traffic.**
- **In-memory defaults** for dedupe and incident records. On serverless they do not survive
  between invocations; `DedupeStore` and `IncidentRecordStore` are exported interfaces.
- **No unattended retry.** Recovery needs a person to start it.
- **The published incident's evidence reads `state is .`** — recorded before the client fix.
  Cancel another deployment and publish that record instead.

---

## 9. Open — owner only

1. **Mint the licence.** The demo currently opens by announcing it is unlicensed. Correct
   behaviour, wrong first impression.
2. **Decide whether the repository stays public.** `signalboost-live` is world-readable:
   unauthenticated tarball, file and history fetches all succeed. The product, the buyer
   documents and the licensing implementation are readable by anyone with the URL.
3. **The pilot agreement** needs the legal entity name and counsel's review.
4. **Publish a clean production record** after the next cancelled deployment.

---

## 10. Standing rules earned the hard way

- When the workaround is "the operator must remember not to do the obvious thing in front of a
  customer", that is a defect report, not a mitigation.
- Narrative UI written for the general case will overstate specific records. Before showing a
  run to a buyer, check every sentence is true *of that run*, not merely true of the product.
- Verify every symbol in example code against the source before shipping a technical document.
- A test suite that stays green when you remove the thing it tests is measuring nothing.
- Ask for a screenshot early when a UI problem is reported. One image has replaced two turns of
  code archaeology more than once.
