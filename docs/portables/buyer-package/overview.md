<!-- docs/portables/buyer-package/overview.md -->

# Self-Healing Supervisor

**Incident remediation that runs inside your environment — and stops for a human before it
does anything consequential.**

---

## What it does

An alert fires from the monitoring you already use. The supervisor authenticates it,
deduplicates it, and diagnoses the incident. It produces a repair plan with verification
steps, and classifies each step by risk.

Safe steps run immediately, with nobody watching. Anything consequential — touching
credentials, deleting data, moving money, changing permissions — **stops and waits for a
named person to approve it.** That person gets a notification through your own channel with
the step, the reason it was held, and the incident id.

Approved steps execute. Results are checked against the plan rather than assumed. Every
action, decision and refusal is written to your SIEM.

---

## Where it runs

**Inside your infrastructure.** There is no service of ours in the path, no account with us,
and no telemetry. We could not see your incidents if we wanted to.

Practically, that means most of a standard vendor security review has no subject matter
here. There is no data processing agreement to negotiate over data we never receive, no
subprocessor list, no vendor-side breach notification, no uptime commitment on a service
that does not exist.

---

## Installing it

It is a Node package. One command, then one file you write.

```bash
npm install ./signalboost-self-healing-supervisor-1.0.0.tgz
```

**It has no third-party dependencies.** Node built-ins only. Nothing to audit beyond the
product itself, and no transitive supply chain arriving with it.

The one file you write is a host adapter: your secrets store, your datastore for the
dispatch ledger, your notification channel, your SIEM sink, and the executor that touches
your systems. That adapter is the whole integration surface, and it is the reason the
product is portable rather than merely configurable — your infrastructure stays yours, and
ours never appears in it.

---

## What it will not do

Stated here rather than discovered later.

**It ships no execution runner.** Repair steps run through code your team supplies. Until
you provide one, the supervisor receives, diagnoses, gates and audits — then reports
honestly that nothing was repaired, rather than claiming a fix that did not happen.

**Monitoring adapters are mapped but not yet proven against live traffic.** Datadog,
PagerDuty, CloudWatch, Alertmanager, Splunk, Azure Monitor, Grafana and Google Cloud
Operations are each mapped against fixtures. Your first alert is the first time that mapping
meets a real payload from your account.

**We hold no SOC 2 report, no ISO 27001 certification, and no third-party penetration
test.**

**There is no unattended retry.** Recovery actions require a person to start them.

---

## What cannot be turned off

There is no edition, configuration, or licence state in which a consequential step executes
without a named human approving it. It is not a setting. We do not sell a cheaper version
that skips it.

Receiving, recording and auditing incidents are never gated either — including with no
licence installed at all. A licence controls diagnosis and dispatch, not your visibility
into your own systems.

---

## Editions and price

| | Standard | Enterprise |
| --- | --- | --- |
| Incident intake, diagnosis, policy gating, approval routing, audit | ✓ | ✓ |
| Repair steps through your API runner | ✓ | ✓ |
| Repair steps driven through a browser runtime | | ✓ |

**[SET — price] per production environment, per year.**

Before that: a **[SET — 60 or 90]-day pilot at [SET — fee or "no cost"]**, running against a
real environment of yours, so the decision rests on evidence rather than a demonstration.

---

## Seeing it work

Ask for a share link. It opens without an account and shows a real run against a live
deployment: a consequential step refusing to execute, the approval request that was raised,
and the audit trail it produced.

---

## What happens next

A 30-minute session where a live incident is run in front of you — diagnosis, the step that
refuses, the approval arriving, the record it leaves. After that, your engineers will want
the integration guide and roughly half a day.

**[SET — your name, title, email]**
