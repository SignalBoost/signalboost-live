# Video Maker Commercial Operations Guide

Status: product-specific operating guidance for the existing Video Maker implementation. This document does not prove immutable package delivery, entitlement enforcement, fulfillment, completed recovery rehearsal, clean-environment deployment, or production acceptance.

## 1. Supported product boundary

Video Maker is the registered `video-maker` portable for governed creation of branded media artifacts. The supported boundary is the portable render core, the buyer-provided host adapters, approved media-provider access, storage, metering, and retained human approval before publishing.

The buyer owns provider accounts, credentials, media rights, brand assets, quotas, spend, storage policy, and publication approval. Automatic or unapproved publishing remains outside the supported boundary.

## 2. Buyer installation

1. Deploy the supported SaaS application using the repository's normal deployment process.
2. Connect the portable render core to buyer-owned metering, storage, and approved media-provider adapters.
3. Configure authentication, database access, required host environment variables, and server-side provider credentials through the approved secret boundary.
4. Verify Video Maker is registered and that render requests produce stored artifacts without bypassing payment, policy, or approval controls.
5. Run the registered Node tests, TypeScript checks, production build, Playwright suite, and required repository workflows.
6. Keep publishing disabled unless separately authorized, approved, audited, and reversible.

## 3. Buyer configuration record

Record and approve:

- application release and commit identity;
- tenant and environment identity;
- approved media providers and capability allowlists;
- buyer-owned provider account identifiers without secret values;
- metering, quota, and budget limits;
- storage destination, retention, deletion, and backup policy;
- brand assets and media-rights owner;
- human approval roles for rendering and publishing;
- audit retention location;
- incident and support contacts.

Missing identity, ownership, provider configuration, metering, storage, rights, or approval state must fail closed.

## 4. Upgrade, rollback, backup, and recovery guidance

Before upgrade, record the current release, back up durable render metadata and approved artifacts, verify restore access, and test representative render requests. Do not export provider credentials into general backups.

Deploy upgrades first to a non-production environment. Verify authentication, tenant isolation, metering, storage, provider boundaries, approval gates, artifact redaction, and failure behavior before promotion.

Rollback when authorization, metering, storage integrity, provider isolation, approvals, or artifact persistence cannot be verified. Restore the last approved application release and compatible durable data, then rerun acceptance and security suites before restoring traffic.

This guidance is not completed operations/recovery evidence. That dimension remains blocked until buyer backup infrastructure, a recovery rehearsal, achieved recovery objectives, timestamps, approvals, and retained results are verified.

## 5. Support and responsibility boundary

The supplier provides the registered portable boundary, render-core contracts, repository code, documented tests, and stated safety limits. The buyer or operator supplies production identity, media-provider accounts, credentials, host adapters, storage, metering, backups, monitoring, incident response, media-rights review, and publication policy.

Not claimed by this guide:

- an immutable buyer distribution package or dependency digest;
- completed fulfillment or artifact transfer;
- active licensing or entitlement enforcement;
- completed backup infrastructure or recovery rehearsal;
- clean-environment deployment evidence;
- buyer production signoff;
- automatic publishing, provider mutation, infrastructure mutation, or production execution.

Video Maker must remain classified according to verified evidence, not manifest maturity or marketing intent.
