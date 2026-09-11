# Control Center Commercial Operations Guide

Status: product-specific operating guidance for the existing Control Center implementation. This document does not prove immutable package delivery, entitlement enforcement, fulfillment, completed recovery rehearsal, clean-environment deployment, or production acceptance.

## 1. Supported product boundary

Control Center is the registered `control-center` portable for governed operational visibility, cataloged provider actions, audit inspection, and human-controlled releases. Secret values must remain outside metadata, browser payloads, logs, release records, and buyer-facing evidence.

The buyer owns production identity, provider accounts, credentials, approval roles, release policy, audit retention, quotas, spend, and incident response. Consequential provider actions and release changes remain subject to explicit authorization, policy checks, approval, and audit.

## 2. Buyer installation

1. Deploy the supported SaaS application using the repository's normal deployment process.
2. Configure authentication, database access, required host environment variables, and approved server-side secret storage.
3. Verify Control Center is registered and that operator, administrator, and owner permissions match the intended release and provider-action boundaries.
4. Verify redaction prevents secret values from reaching browser payloads or logs.
5. Run the registered Node tests, TypeScript checks, production build, Playwright suite, and required repository workflows.
6. Keep provider mutations and production release changes disabled unless explicitly supported, authorized, approved, audited, and reversible.

## 3. Buyer configuration record

Record and approve:

- application release and commit identity;
- tenant and environment identity;
- operator, administrator, and owner assignments;
- enabled provider actions and capability allowlists;
- secret owner, storage boundary, and rotation process without recording secret values;
- release approval and rollback roles;
- quota, rate, and budget limits;
- audit retention location;
- incident and support contacts;
- known integration-test gaps and remediation ownership.

Missing identity, authorization, approval, redaction, provider configuration, or durable audit state must fail closed.

## 4. Upgrade, rollback, backup, and recovery guidance

Before upgrade, record the current release, back up durable operational metadata and audit records, verify restore access, and test representative read-only and approval-gated flows. Do not export provider credentials into general backups.

Deploy upgrades first to a non-production environment. Verify authentication, role boundaries, redaction, audit behavior, provider-action policy, release controls, and failure handling before promotion.

Rollback when authorization, redaction, audit integrity, release controls, or durable state cannot be verified. Restore the last approved application release and compatible data, then rerun acceptance and security suites before restoring traffic.

This guidance is not completed operations/recovery evidence. That dimension remains blocked until buyer backup infrastructure, a recovery rehearsal, achieved recovery objectives, timestamps, approvals, and retained results are verified.

## 5. Support and responsibility boundary

The supplier provides the registered portable boundary, console-core and console-host code, documented tests, redaction controls, and stated safety limits. The buyer or operator supplies production identity, provider accounts, credentials, vault controls, deployment, backups, monitoring, incident response, approval policy, and compliance review.

Not claimed by this guide:

- an immutable buyer distribution package or dependency digest;
- completed fulfillment or artifact transfer;
- active licensing or entitlement enforcement;
- completed backup infrastructure or recovery rehearsal;
- clean-environment deployment evidence;
- buyer production signoff;
- automatic provider mutation, release execution, infrastructure mutation, or production repair.

Control Center must remain classified according to verified evidence, not manifest maturity or marketing intent.
