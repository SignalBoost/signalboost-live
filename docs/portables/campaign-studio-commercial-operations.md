# Campaign Studio Commercial Operations Guide

Status: product-specific operating guidance for the existing Campaign Studio implementation. This document does not prove immutable package delivery, entitlement enforcement, fulfillment, clean-environment deployment, or production acceptance.

## 1. Supported product boundary

Campaign Studio is a governed campaign workspace. It may generate and organize campaign assets, but publishing, provider mutations, spending, outreach, and other consequential actions remain behind explicit human approval and the host application's authorization controls.

The supported commercial boundary is the registered `campaign-studio` portable, its host integration, and buyer-supplied provider access. The buyer owns provider accounts, credentials, permissions, data, quotas, and spend.

## 2. Buyer installation

1. Deploy the supported SignalBoost SaaS application using the repository's normal deployment process.
2. Configure authentication, database, and required host environment variables.
3. Configure only buyer-owned provider credentials through the approved secret boundary; do not place secrets in source, logs, campaign artifacts, or browser payloads.
4. Verify Campaign Studio is registered and its public route exposes only implemented functionality.
5. Run the registered Node tests, TypeScript checks, production build, Playwright suite, and required repository workflows.
6. Keep publishing, spending, outreach, and provider mutation disabled unless separately authorized, approved, audited, and reversible.

## 3. Buyer configuration record

Record and approve:

- application release and commit identity;
- tenant and environment identity;
- buyer-owned provider accounts and capability allowlists;
- credential owner and rotation process without recording secret values;
- campaign data retention and deletion rules;
- approval roles for publishing, spending, outreach, and production use;
- quota and budget limits;
- audit retention location;
- incident and support contacts.

Missing identity, ownership, provider configuration, authorization, approval, or durable state must fail closed.

## 4. Upgrade, rollback, backup, and recovery

Before upgrade, record the current release, back up durable campaign metadata and approved artifacts, verify restore access, and run tests against representative fixtures. Do not export provider credentials into general backups.

Deploy upgrades first to a non-production environment. Verify authentication, tenant isolation, approval gates, audit behavior, generation paths, and public response redaction before promotion.

Rollback when authorization, isolation, approvals, artifact integrity, persistence, or provider boundaries cannot be verified. Restore the last approved application release and compatible durable data, then rerun the acceptance and security suites before restoring traffic.

Recovery evidence must include the backup identifier, integrity result, restore timestamps, affected scope, achieved recovery objectives, test results, approvals, unresolved gaps, and remediation owner.

## 5. Support and responsibility boundary

SignalBoost supplies the registered portable boundary, repository code, documented tests, and stated safety limits. The buyer or operator supplies production identity, provider accounts, credentials, vault controls, deployment, backups, monitoring, incident response, compliance review, and business approval policy.

Not claimed by this guide:

- an immutable buyer distribution package or dependency digest;
- completed fulfillment or artifact transfer;
- active licensing or entitlement enforcement;
- clean-environment deployment evidence;
- buyer production signoff;
- automatic publishing, spending, outreach, provider mutation, browser execution, infrastructure mutation, or production repair.

Campaign Studio must remain classified according to verified evidence, not marketing intent.