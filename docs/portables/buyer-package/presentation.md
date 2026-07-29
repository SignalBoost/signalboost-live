<!-- docs/portables/buyer-package/presentation.md -->

# Self-Healing Supervisor

**Incident remediation that runs inside your environment — and stops for a human before it
does anything consequential.**

*Prepared by SignalBoost · Luis de Andrade, Founder · support@signalboostapp.com*

---

> Prices below are list. The pilot terms are the standard offer. Change them deliberately if a
> particular deal warrants it — but send this as it stands rather than with blanks in it.

---

## 1. In one paragraph

An alert fires from the monitoring you already run. The supervisor authenticates it,
deduplicates it, diagnoses the incident, and produces a repair plan with verification steps.
It classifies every step by risk. Safe steps run immediately with nobody watching. Anything
consequential — credentials, deletion, permissions, money — stops and waits for a named
person to approve it. Approved steps execute through a runner your team supplies. Results are
checked against the plan rather than assumed. Every action, decision and refusal is written
to your SIEM.

## 2. Why this is not another AIOps tool

**It runs inside your infrastructure.** No service of ours in the path. No account with us.
No telemetry. We cannot see your incidents, and could not if we wanted to.

That removes most of a standard vendor security review, because the questions have no subject
matter: no data processing agreement over data we never receive, no subprocessor list, no
vendor-side breach notification, no uptime commitment on a service that does not exist.

**The approval gate is a property, not a setting.** There is no edition, configuration or
licence state in which a consequential step executes without a named human approving it. We
do not sell a cheaper version that skips it.

**Your people are written to in their own language.** Approval requests, diagnoses, plan steps
and evidence are produced in English, Spanish, Portuguese, Polish or Russian, set once in
configuration. Audit event types and step identifiers are identical in every language, so your
SIEM rules and reports are unaffected.

**Nothing is gated that shouldn't be.** Receiving, recording and auditing incidents work even
with no licence installed at all. A licence controls diagnosis and dispatch — never your
visibility into your own systems.

## 3. Installing it

```bash
npm install ./signalboost-self-healing-supervisor-1.0.0.tgz
```

A Node package. **Zero third-party dependencies** — Node built-ins only. Nothing to audit
beyond the product itself, and no transitive supply chain arriving with it.

You write one file: a host adapter implementing `HostContext`. It supplies your secrets
store, your datastore for the dispatch ledger, your notification channel, your SIEM sink, and
the executor that touches your systems. That adapter is the entire integration surface, and
it is why the product is portable rather than merely configurable — your infrastructure stays
yours, and none of ours appears in it.

Budget roughly half a day of one engineer's time to first incident.

## 4. Evidence you can check

**A real production incident, detected unattended.** On 29 July 2026 a production deployment
was cancelled. Nobody reported it. Within the observation window the supervisor detected it,
classified it as `VERCEL_CANCELED` at warning severity, produced a plan, evaluated policy,
resolved a read-only capability, dispatched an inspection, read the deployment and its
production aliases, verified the diagnosis against that evidence, and wrote fourteen audit
events.

**A rehearsal across three risk categories.** One scripted incident each for financial,
destructive and credential-security risk, run against real wiring: fifteen checks, all
passing. The consequential step paused every time. The approver was notified through a real
channel. An audit trail was produced. Had the dangerous step ever executed, the run would
have reported FAILED.

Ask for a share link to either. It opens without an account.

## 5. What it will not do

Stated here rather than discovered in your review.

**It ships no execution runner.** Repair steps run through code your team supplies. Until you
provide one, the supervisor receives, diagnoses, gates, verifies and audits — then reports
honestly that nothing was repaired, rather than claiming a fix that did not happen.

**Monitoring adapters are mapped but unproven against live traffic.** Datadog, PagerDuty,
CloudWatch, Alertmanager, Splunk, Azure Monitor, Grafana and Google Cloud Operations are each
mapped against fixtures. Your first alert is the first time that mapping meets a real payload
from your account.

**No SOC 2 report, no ISO 27001, no third-party penetration test.**

**No unattended retry.** Recovery actions require a person to start them.

**Seat and execution limits are contract terms, not technical controls.** The software records
them and does not enforce them.

## 6. Editions

| | Standard | Enterprise |
| --- | --- | --- |
| Intake, diagnosis, policy gating, approval routing, audit | ✓ | ✓ |
| Repair steps through your API runner | ✓ | ✓ |
| Repair steps driven through a browser runtime | | ✓ |

The boundary is real rather than commercial: browser-driven steps need a Chromium runtime
somebody has to operate.

## 7. Commercials

**Enterprise — $48,000 per production environment, per year.**

**Standard — $30,000 per production environment, per year.**

Before that, a **60-day pilot at no cost**, running against a real environment of yours, so the
decision rests on evidence rather than a demonstration. First-year pricing is negotiable for a
design partner willing to act as a reference.

During the pilot: support with defined response targets by severity, a named security contact
for vulnerability reports, and a short pilot agreement your counsel and ours work from. The
full support terms and the draft agreement are attached separately.

## 8. What happens next

1. **A 30-minute session.** A live incident run in front of you — diagnosis, the step that
   refuses to execute, the approval request arriving, the record it leaves.
2. **Your engineers, half a day.** The integration guide and the host-adapter interface.
3. **A pilot.** Your environment, your monitoring, your approvers, your data. We see none of
   it.

**Luis de Andrade · Founder, SignalBoost · support@signalboostapp.com**

---

## The rest of the documentation

Supplied as your review reaches each stage, rather than all at once.

| Document | Answers |
| --- | --- |
| Integration guide | What you supply, the interfaces, the dispatch ledger, what "live" requires |
| Incident intake guide | The incident contract and payload |
| Monitoring connections | The endpoint, per-vendor field mapping, a verification procedure |
| Licence installation | Where the licence goes and what it controls |
| Operations runbook | Running it day to day |
| Security and data handling | Written for a vendor security questionnaire, gaps included |
| Support terms | Severity definitions, response targets, version support |
| Pilot agreement | A draft for counsel |
