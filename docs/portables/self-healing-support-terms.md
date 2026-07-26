<!-- docs/portables/self-healing-support-terms.md -->

# Self-Healing Supervisor — support terms

**Status: draft for approval. The five values marked SET are commercial commitments only the vendor can make, and they cost money to honour. Everything else follows from how the product actually works.** Have counsel review before this is attached to an order form.

## What is supported

The Self-Healing Supervisor payload, at a version listed under "Supported versions" below, deployed against interfaces the customer has implemented per the integration guide.

Support covers the product's own behaviour: incident classification, repair-plan generation, the approval gate, the audit trail, entitlement checks, and the acceptance harness.

## What is not supported

These are outside the product and outside support, because they are not ours to fix:

- The customer's implementations of `SecretsProvider`, `SqlExecutor`, `NotificationSink`, `ApproverDirectory`, `HostBranding`, `SiemTransport` or `ApiStepRunner`.
- The customer's database, identity provider, secret manager, notification channel, SIEM, network or cloud account.
- Outages, rate limits, billing or behaviour changes at any third party the customer's implementations call.
- Browser-backed repair steps, which require a Chromium runtime the customer or a provider operates.
- Incident sources. The product acts on incidents it is given; ingestion is host-side.
- Any modification the customer makes to payload files. Modified payloads are unsupported until the modification is reverted or upstreamed.
- Consequences of an approval decision. A human approved the step; the product recorded who and when.

## Severity

Severity is set by operational impact, not by how the ticket is written.

| | Definition |
| --- | --- |
| **1 — Critical** | The product is not gating consequential steps, or approval requests are not reaching approvers, in production. Anything where the safety property has failed. |
| **2 — High** | Production incidents are not being processed, or the audit trail is not reaching the SIEM. The product is not working but nothing unsafe is happening. |
| **3 — Normal** | A defect with a workaround, or a non-production environment is affected. |
| **4 — Low** | Questions, documentation, feature requests, cosmetic issues. |

A gating failure is always Severity 1 even if nothing has gone wrong yet. The whole point of the product is that consequential changes stop for a human; if that is not happening, the customer is exposed whether or not they have noticed.

## Response targets

Targets are for **first substantive response**, not resolution. A resolution commitment on a defect nobody has diagnosed yet is a commitment nobody can keep.

| Severity | Target | Hours |
| --- | --- | --- |
| 1 | **SET** — 4 business hours suggested | **SET** — 24/7 suggested for Sev 1 only |
| 2 | **SET** — 1 business day suggested | Business hours |
| 3 | **SET** — 2 business days suggested | Business hours |
| 4 | **SET** — 5 business days suggested | Business hours |

**SET** — business hours definition and time zone.
**SET** — the support channel and where tickets are raised.

## Security fixes

A vulnerability in the payload is handled on the Severity 1 path regardless of whether it is currently being exploited.

Fixes ship as a new patch version with release notes naming the issue and the affected versions. Customers on a supported version are notified. Because the payload holds no state and rolls back by restoring the previous archive, a security patch is a file replacement and an acceptance re-run, not a migration.

Report suspected vulnerabilities to **SET** — security contact address. Do not raise them through the ordinary support channel.

## Supported versions

The current minor version and the one before it. When a new minor version ships, the one two behind it leaves support **SET** — 90 days suggested — later.

A major version is supported for **SET** — 12 months suggested — after its successor ships.

Release candidates (`-rc`) are not supported for production use.

## What the customer is responsible for

- Keeping the approver directory accurate. An approver who has left the company is a gating failure the product cannot detect.
- Running the acceptance harness after every upgrade, rollback, or change to notification, approver or SIEM wiring.
- Backing up the ledger table and their own wiring.
- Keeping their licence current.
- Quoting the `version`, `sourceCommit`, dispatch id and incident id when raising a ticket. Those four values identify exactly what was running.

## Escalation

If a Severity 1 has not had a substantive response inside its target, the customer escalates to **SET** — escalation contact. Escalation is by severity and elapsed time, not by relationship.

## Maintenance

There is no vendor-operated service to take down, so there are no maintenance windows. Upgrades happen on the customer's schedule.

## Known limitations

Carried here so they cannot be discovered during an incident:

- Seats and execution limits are recorded in the licence and are contract terms. There is no counter in the product that enforces them.
- A licence that has lapsed stops execution and dispatch. Reading incident history, audit and SIEM output continue.
- A revocation check that fails does not revoke. If the customer's revocation source is unreachable, revocation is not being enforced, and the product reports that through `onStale` rather than guessing.

## End of life

If the product is discontinued, customers under an active agreement receive **SET** — 12 months suggested — notice, security fixes for that period, and a final archive they may keep and run under the terms of their licence.
