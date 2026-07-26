# Integrations Hub Commercial Operations Guide

Status: product-specific operating guidance for the existing Integrations Hub implementation. This document does not prove immutable package delivery, entitlement enforcement, fulfillment, completed recovery rehearsal, clean-environment deployment, or production acceptance.

## 1. Supported product boundary

Integrations Hub is the registered `integrations-hub` portable for governed provider discovery and configuration. It exposes only registered provider capabilities. Providers labeled coming soon remain non-executable.

The buyer owns provider accounts, credentials, permissions, quotas, spend, data, and business approvals. Provider secrets must remain in approved server-side secret boundaries and must not be stored in manifests, browser payloads, logs, or buyer-facing evidence.

## 2. Buyer installation

1. Deploy the supported SaaS application using the repository's normal deployment process.
2. Configure authentication, database access, and required host environment variables.
3. Supply only buyer-owned provider credentials through environment variables or the approved encrypted vault boundary.
4. Verify Integrations Hub is registered and that only implemented providers are marked live.
5. Run the registered Node tests, TypeScript checks, production build, Playwright suite, and required repository workflows.
6. Keep provider mutations disabled unless the action is explicitly supported, authorized, policy-checked, approved where required, and audited.

## 3. Buyer configuration record

Record and approve:

- application release and commit identity;
- tenant and environment identity;
- enabled providers and capability allowlists;
- credential owner, scope, and rotation process without recording secret values;
- provider permission boundaries and destructive-action approval roles;
- quota, rate, and budget limits;
- audit retention location;
- incident and support contacts;
- the list of providers that remain coming soon and non-executable.

Missing identity, ownership, permissions, provider registration, authorization, or audit configuration must fail closed.

## 4. Upgrade, rollback, backup, and recovery guidance

Before upgrade, record the current release, back up durable integration metadata and audit records, verify restore access, and run tests against representative provider fixtures. Do not export provider credentials into general backups.

Deploy upgrades first to a non-production environment. Verify authentication, tenant isolation, provider registration, approval gates, audit behavior, and secret redaction before promotion.

Rollback when authorization, isolation, provider registration, audit integrity, persistence, or credential boundaries cannot be verified. Restore the last approved application release and compatible durable data, then rerun acceptance and security suites before restoring traffic.

This guidance is not completed operations/recovery evidence. That dimension remains blocked until buyer backup infrastructure, a recovery rehearsal, achieved recovery objectives, timestamps, approvals, and retained results are verified.

## 5. Support and responsibility boundary

The supplier provides the registered portable boundary, repository code, documented provider reference, registered tests, and stated safety limits. The buyer or operator supplies production identity, provider accounts, credentials, vault controls, deployment, backups, monitoring, incident response, compliance review, and business approval policy.

Not claimed by this guide:

- an immutable buyer distribution package or dependency digest;
- completed fulfillment or artifact transfer;
- active licensing or entitlement enforcement;
- completed backup infrastructure or recovery rehearsal;
- clean-environment deployment evidence;
- buyer production signoff;
- automatic provider mutation, infrastructure mutation, or production execution.

Integrations Hub must remain classified according to verified evidence, not manifest maturity or marketing intent.
