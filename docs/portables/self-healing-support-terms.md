<!-- docs/portables/self-healing-support-terms.md -->

# Self-Healing Supervisor — proposed support framework

**Status: commercial draft for counsel and capacity review. Not an SLA, not incorporated into any agreement, and not ready to sign.**

No response target in this document is binding unless a signed order form or pilot agreement identifies the vendor legal entity, customer, supported version, support period, channels, hours, staffing model, fees, exclusions, escalation path, and remedies.

## 1. Current evaluation support

Version `1.0.0-rc.2` is a design-partner evaluation release. Release candidates are not supported for production use and carry no 24/7 response commitment.

During an authorized evaluation, support is limited to reasonable-effort assistance with:

- installation of the exact archived package;
- interpretation of manifest, SBOM, checksums, and acceptance results;
- defects reproducible in unmodified package code;
- clarification of the public interfaces and documented boundaries;
- security reports concerning the package itself.

The evaluator and vendor must agree on the working contact channel before the evaluation starts. A personal message or an unacknowledged email does not create a contractual support ticket.

## 2. Potential production scope

A future production support agreement may cover product behavior in a supported, unmodified release:

- licence and feature enforcement;
- explicit API capability validation;
- approval pause and signed continuation validation;
- dispatch scope and at-most-once behavior;
- package audit events;
- reference notification localization;
- packaged acceptance tooling.

Production support cannot begin until production `1.0.0` is earned through external acceptance and a signed agreement defines the service commitment.

## 3. Buyer-controlled components

The following are buyer infrastructure and are excluded unless an order form expressly adds integration services:

- `SecretsProvider`, `NotificationSink`, `ApproverDirectory`, and `HostBranding` implementations;
- `SqlExecutor`, dispatch ledger, approval nonce store, audit repository, and SIEM transport;
- provider capability registrations and parameter validators;
- `ApiStepRunner`, verification runners, and provider credentials;
- databases, cloud accounts, identity providers, secret managers, networks, notification systems, and SIEMs;
- third-party outages, billing, rate limits, API changes, and provider behavior;
- browser runtimes and browser-backed repair implementations;
- monitoring-source mappings not specifically accepted against buyer traffic;
- modified or forked package code;
- the business consequences of a buyer's approval decision.

The vendor can diagnose the package boundary but cannot administer infrastructure it does not operate or access.

## 4. Severity definitions for future contracting

Severity is based on operational impact and reproducibility.

| Severity | Proposed definition |
| --- | --- |
| **1 — Critical** | A reproducible package defect permits a consequential step to reach the buyer runner without a valid exact-scope approval continuation, or falsely records execution authority. |
| **2 — High** | A reproducible package defect prevents licensed production incident processing, approval routing, signed continuation, or required audit emission without an available workaround. |
| **3 — Normal** | A package defect has a reasonable workaround, affects a non-production environment, or degrades a non-safety function. |
| **4 — Low** | Documentation questions, feature requests, usability issues, or cosmetic defects. |

A buyer infrastructure outage is not automatically a package Severity 1. Triage must first identify whether the failure is in the package or a buyer-controlled boundary.

## 5. Response targets are intentionally unset

The earlier draft promised a four-hour Severity 1 response, 24/7. That commitment is removed because it must not be offered without demonstrated staffing, monitoring, backup coverage, escalation capability, and commercial pricing.

Before any target is signed, the vendor must document:

- named primary and backup responders;
- covered time zone and holidays;
- after-hours alerting and acknowledgement method;
- maximum concurrent incidents;
- security escalation process;
- dependency on third-party specialists;
- first-response versus restoration expectations;
- exclusions and customer cooperation requirements;
- service credits or other remedies, if any.

Until those items are approved, support is reasonable-effort during mutually agreed business hours only.

## 6. Security reports

A suspected vulnerability in the package should be handled confidentially through the security contact identified in the signed evaluation or order form. The evaluator should include the package version, source commit, archive checksum, affected public API, reproduction steps, observed result, expected result, and whether a real runner was connected.

Do not include production credentials, licence tokens, approval signatures, private keys, customer data, or full secret-bearing logs.

A security fix should ship as a new archived package with release notes, manifest, SBOM, checksums, regression coverage, clean-install evidence, and explicit affected-version information.

## 7. Supported versions — proposed policy

- release candidates are evaluation-only;
- production support begins only with a signed agreement naming the supported release;
- a future standard policy may support the current minor version and one previous minor version;
- end-of-support notice periods must be stated in the applicable order form;
- emergency security support for older versions is not implied unless expressly purchased.

## 8. Buyer responsibilities

A production buyer would remain responsible for:

- keeping approver identity and authorization current;
- protecting licence tokens, issuer keys, approval private keys, and provider credentials;
- operating a durable atomic dispatch ledger and nonce store;
- reviewing every capability registration and runner change;
- running acceptance after installation, upgrade, rollback, key rotation, notification changes, approver changes, capability changes, runner changes, and SIEM changes;
- retaining the exact package, checksum, manifest, SBOM, source commit, configuration version, incident ID, plan ID, dispatch ID, and relevant audit-event IDs;
- maintaining tested backup, restore, upgrade, and rollback procedures;
- preventing unsupported modifications from being represented as the vendor release.

## 9. Known commercial limitations

- source delivery makes licence enforcement contractual rather than tamper-proof;
- licence seats and aggregate execution limits are not currently technical counters;
- the vendor does not operate the buyer's environment and cannot independently observe an outage;
- no 24/7 operations team, SOC 2 report, ISO 27001 certification, or third-party penetration-test commitment is represented by this draft;
- monitoring adapters remain staged until accepted against buyer traffic;
- no production warranty, SLA, service credit, or end-of-life commitment exists until signed.

## 10. Required approvals before use

This framework must be reviewed and completed by the vendor's commercial decision-maker, operations owner, security owner, and qualified counsel. It must not be attached to a proposal as binding terms while any material field remains unresolved.
