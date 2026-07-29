<!-- docs/portables/self-healing-evaluation-plan.md -->

# Self-Healing Supervisor — master evaluation plan

**For the team evaluating whether to run this in production.**
Assignable, time-boxed, and written so a decision can be defended afterwards.

Total effort: **roughly three engineer-days**, spread across four phases. Phases 1 and 2 can be
done by one person; phase 3 needs the security reviewer; phase 4 needs whoever signs.

The vendor's position on this document: **run every test, and publish the failures.** A finding
is worth more to us than a passing grade. Section 7 says what to do with what you find.

---

## 1. What is being evaluated

A self-healing incident supervisor delivered as source that runs inside your environment. No
vendor service, no vendor account, no telemetry.

**The claim under test:** no consequential step executes without a named human approving it —
in any edition, configuration, or licence state.

Everything else in this plan exists to give that claim a fair chance to fail.

## 2. What is explicitly out of scope

State these before you start, so nobody spends a day on them.

- **The vendor's console and demo pages.** Everything under `app/`, `components/` and
  `app/api/` is the vendor's test rig, not the delivered product. Judge the package.
- **Repair execution.** The product ships no execution runner. Until you write one it
  diagnoses, gates, verifies and audits, then reports that nothing was repaired.
- **Vendor-side security posture.** There is no vendor service in the path, so uptime,
  subprocessors and vendor breach handling have no subject matter here.
- **Performance at scale.** No load profile has been established. If throughput matters to you,
  raise it as an open question rather than testing it against assumptions.

## 3. Roles

| Role | Phases | What they own |
| --- | --- | --- |
| Evaluation lead | 1–4 | Runs the plan, keeps the findings register, presents the decision |
| Platform engineer | 1–2 | Installs, writes the trial host adapter, runs the functional matrix |
| Security reviewer | 3 | Auth, redaction, secret handling, the security questionnaire |
| Approver / service owner | 4 | Judges whether the operational model fits how the team works |

## 4. Phases

### Phase 1 — Install and first run (half a day)

Follow `self-healing-technical-walkthrough.md`. Offline, no account required.

**Exit criteria:** the package installs, a trial host adapter runs the acceptance scenario, and
all five checks pass with a notification delivered to your sink.

### Phase 2 — Functional matrix (one day)

Work through section 5. Record evidence for every row, pass or fail.

**Exit criteria:** every test executed and recorded. Not "every test passed" — a red row is a
result, not a blocker to finishing the phase.

### Phase 3 — Security review (one day)

Section 6, plus `self-healing-security-and-data-handling.md`, which is written for a vendor
questionnaire and names the gaps rather than hiding them.

**Exit criteria:** the security reviewer can answer your standard questionnaire from the
document and the code, with residual questions listed.

### Phase 4 — Fit and decision (half a day)

Section 8. Does the operating model work for your on-call rota, your approval culture, your
change process?

**Exit criteria:** a signed recommendation.

---

## 5. Functional test matrix

Every row: run it, record what happened, attach evidence.

| # | Test | Method | Pass criteria |
| --- | --- | --- | --- |
| F1 | Safe step executes unattended | Acceptance scenario, safe step | Executes with no approval request |
| F2 | **Consequential step pauses** | Acceptance scenario, each of the three risk categories | Step does not execute; run reports paused |
| F3 | Approver is notified | Inspect your sink | One notification per paused step, correct category and reason |
| F4 | Notification is branded as yours | Inspect content | Your product name, not the vendor's |
| F5 | Audit trail produced | Inspect audit events | Ordered events covering request, start, completion |
| F6 | **Gate cannot be disabled** | Search config, licence states, editions for any switch that lets a consequential step run | No such switch exists |
| F7 | **Negative control** | Weaken the classifier in `policy-engine.ts`, rebuild, re-run | Harness reports failure and names the violated property |
| F8 | Unlicensed behaviour | Run with no licence installed | Incidents received and recorded; diagnosis refuses; audit still works |
| F9 | Wrong-product licence | Install a licence for another product | Refused |
| F10 | Expired licence | Install an expired token | Refused |
| F11 | Intake authentication | Post an unsigned incident | Rejected |
| F12 | Replay resistance | Capture a signed request, resend with a fresh timestamp | Rejected |
| F13 | Tamper resistance | Alter one byte of a signed body | Rejected |
| F14 | Stale timestamp | Send outside the 300-second window | Rejected |
| F15 | Deduplication | Send the same dedupe key twice | Second is a duplicate, not a new incident |
| F16 | Language | Set locale to each of the five, re-run F2 | All human-readable text changes; step ids and event types do not |
| F17 | Host substitution | Replace the in-memory dedupe and record stores with your own | Runs unchanged against your datastore |
| F18 | No execution runner | Run a plan with a consequential step and no runner configured | Reports unresolved with a reason; does not claim a repair |

**F2, F6 and F7 are the evaluation.** If any of those three fails, stop and report — the
remaining rows do not matter.

## 6. Security review checklist

| # | Question | Where to look |
| --- | --- | --- |
| S1 | How are secrets resolved, and are they ever logged? | `SecretsProvider`, evidence payloads |
| S2 | Can a secret value reach an audit record or notification? | Search evidence and notification construction |
| S3 | What is the webhook signature scheme, and is the timestamp signed? | `signIntakeRequest`, authenticator |
| S4 | Body-size and rate limits on intake | `INTAKE_LIMITS` |
| S5 | What identity is bound to a dispatch, and can it be forged? | Dispatch ledger, governance fields |
| S6 | Does the licence gate sit at the execution boundary or at a UI? | `portable-license/enforce.ts` |
| S7 | What does the SIEM receive, and in what format? | `siem-audit-sink.ts` |
| S8 | Third-party dependencies in the payload | `npm ls` after install — expect none |
| S9 | Known gaps the vendor discloses | `self-healing-security-and-data-handling.md` |

## 7. Findings register

One row per finding. Send the register to the vendor whether or not you proceed.

| Field | Notes |
| --- | --- |
| ID | F-1, F-2 … |
| Severity | Blocking / major / minor / observation |
| Test | Which row or question produced it |
| Evidence | Command, output, file and line |
| Reproducible | Yes / no / intermittent |

**Blocking** is reserved for one thing: a path where a consequential step executes without a
named human. Everything else is major or below.

## 8. Fit questions for the service owner

Not code questions. They decide whether this works in your organisation.

- Who are the named approvers for financial, destructive and credential-security steps, and are
  they reachable at 3am?
- What happens when an approver is on leave? (The directory supports per-category routing and a
  fallback.)
- Does an approval request in a chat channel meet your change-management requirements, or does
  it need a ticket?
- Who writes and owns the execution runner? That is the component that touches your systems.
- Which monitoring source goes first, and who owns the field mapping when it is wrong?

## 9. Decision

**Recommend a pilot if:** F2, F6, F7 pass; the security reviewer's residual questions are
answerable; and the service owner can name approvers per category.

**Do not proceed if:** any consequential step can execute without a named human; or secrets
reach an audit record or notification; or the licence gate can be bypassed in the payload.

**Raise before deciding, rather than treating as pass or fail:** staged monitoring adapters not
yet proven against your live traffic; no SOC 2 or third-party penetration test; no unattended
retry; seat and execution limits recorded but not enforced.

## 10. Sign-off

| Role | Name | Date | Recommendation |
| --- | --- | --- | --- |
| Evaluation lead | | | |
| Security reviewer | | | |
| Service owner | | | |

## 11. Documents

`self-healing-technical-walkthrough.md` (phase 1) ·
`self-healing-evaluation-brief.md` (what to attack) ·
`self-healing-integration-guide.md` (interfaces) ·
`self-healing-incident-intake-guide.md` (incident contract) ·
`self-healing-monitoring-connections.md` (vendor mappings) ·
`self-healing-security-and-data-handling.md` (phase 3) ·
`self-healing-license-installation.md` · `self-healing-operations-runbook.md`
