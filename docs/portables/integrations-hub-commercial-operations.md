# Integrations Hub Commercial Operations Guide

Status: product-specific operating guidance for the existing Integrations Hub implementation. This document does not prove immutable package delivery, entitlement enforcement, fulfillment, recovery rehearsal, clean-environment deployment, or production acceptance.

## 1. Supported product boundary

Integrations Hub is a provider-neutral catalog for governed integration discovery and configuration. It may describe supported providers and required setup, but credential storage, provider mutation, account provisioning, spending, publication, deployment, and other consequential actions remain outside the portable boundary unless separately authorized and implemented by the buyer.

The supported commercial boundary is the registered `integrations-hub` portable, its host integration, and buyer-supplied provider accounts. The buyer owns provider credentials, permissions, quotas, billing relationships, network access, and compliance obligations.

## 2. Buyer installation

1. Deploy the supported SignalBoost SaaS application using the repository's normal deployment process.
2. Configure authentication, database access, and required host environment variables.
3. Configure only buyer-owned provider credentials through the approved secret boundary; do not place secrets in manifests, source, logs, browser payloads, or integration metadata.
4. Verify Integrations Hub is registered and exposes only implemented provider capabilities.
5. Run the registered Node tests, TypeScript checks, production build, Playwright suite, and required repository workflows.
6. Keep provider writes, account provisioning, spending, publication, and production execution disabled unless separately authorized, approved, audited, and reversible.

## 3. Buyer configuration record

Record and approve:

- application release and commit identity;
- tenant and environment identity;
- enabled provider catalog entries and capability allowlists;
- buyer-owned provider account identifiers without secret values;
- credential owner and rotation process;
- authorization and approval roles;
- quota, rate, and budget limits;
- network and egress restrictions;
- audit retention location;
- incident and support contacts.

Missing identity, ownership, authorization, provider configuration, approval, or durable audit state must fail closed.

## 4. Operations and recovery boundary

The buyer must define upgrade, rollback, backup, restore, and incident procedures for the host application and any durable integration configuration. This guide does not claim that a recovery rehearsal has been completed.

Do not include provider secrets in general backups. A future recovery evidence record must identify the tested release, backup artifact, restore timestamps, achieved objectives, test results, approvals, unresolved gaps, and remediation owner before this dimension can be marked ready.

## 5. Support and responsibility boundary

SignalBoost supplies the registered portable boundary, repository code, documented tests, and stated safety limits. The buyer or operator supplies provider accounts, credentials, vault controls, network access, deployment, backups, monitoring, incident response, compliance review, and business approval policy.

Not claimed by this guide:

- an immutable buyer distribution package or dependency digest;
- completed fulfillment or artifact transfer;
- active licensing or entitlement enforcement;
- completed recovery rehearsal;
- clean-environment deployment evidence;
- buyer production signoff;
- automatic provider mutation, account provisioning, spending, publication, browser execution, infrastructure mutation, or production repair.

Integrations Hub must remain classified according to verified evidence, not marketing intent.
