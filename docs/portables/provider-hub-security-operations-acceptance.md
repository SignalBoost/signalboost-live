# Provider Hub Security, Operations, and Acceptance Guide

Status: implemented foundation with tested read-only surfaces and reference integration examples; not independently certified or production-proven as a standalone enterprise deployment.

Read with `ONBOARD.md`, `docs/portables/provider-hub-byok-portable.md`, and `saas/examples/provider-hub-reference/README.md`. The repository is the source of truth.

## 1. Scope and verified implementation state

Implemented and tested:

- versioned host-neutral Provider Hub connection contracts under `saas/provider-hub-core/`;
- versioned host ports for identity, opaque vault references, persistence, audit, approvals, licensing, and UI projection;
- SignalBoost host adapter boundaries under `saas/provider-hub-host/`;
- authenticated read-only status APIs at `/api/provider-hub/status` and `/api/admin/provider-hub/status`;
- authenticated read-only pages at `/dashboard/provider-hub` and `/admin/provider-hub`;
- strict public metadata projection and secret-shaped-field rejection;
- deterministic contract, isolation, status-surface, dashboard, and reference-deployment tests;
- one execution-free in-memory reference deployment and one buyer-owned external-host composition example.

Example-only or buyer-supplied:

- production identity, SSO, RBAC, vault, persistence, audit, approval, licensing, notification, billing, and deployment adapters;
- backup infrastructure, regional deployment, high availability, disaster recovery, and production observability;
- provider-specific validation, rotation, mutation, spend, publishing, or execution workflows.

Not claimed:

The acceptance evidence in this guide verifies the implemented surfaces listed above, in the host
where they were tested. It does not verify a universally production-ready enterprise deployment.
Specifically not claimed:

- independent security certification;
- SOC 2, ISO 27001, FedRAMP, PCI DSS, HIPAA, GDPR, or other regulatory compliance by documentation alone;
- production load, availability, recovery-time, or recovery-point guarantees;
- automatic approval, credential reveal, provider mutation, browser execution, infrastructure mutation, or production execution.

## 2. Security architecture and trust boundaries

### 2.1 Core boundary

`provider-hub-core` is host-neutral. It must not import Next.js, Supabase, a specific vault, cloud SDK, provider execution runtime, browser runtime, or SignalBoost application services.

The core accepts and returns bounded metadata. Raw credentials are outside the public contract. Authentication status is represented as configured state and masked-field indicators only.

### 2.2 Host boundary

The host owns identity, authorization, vault storage, durable persistence, audit retention, approvals, licensing, user interfaces, deployment, and operational controls.

A host integration must fail closed when actor identity, tenant, environment, ownership, entitlement, policy, approval, or durable state cannot be verified.

### 2.3 Secret boundary

Provider Hub public responses must never contain:

- plaintext credentials;
- encrypted credential envelopes;
- vault retrieval tokens or internal vault paths;
- private keys, API keys, access tokens, refresh tokens, passwords, or service-account payloads;
- user email addresses or role collections unless a separately reviewed contract explicitly requires them.

Opaque vault references may exist inside trusted host adapters, but must not be rendered in public UI or returned from public status endpoints.

### 2.4 Consequential-action boundary

The following require separately implemented authorization, policy, and explicit approval controls:

- credential create, replace, rotate, disconnect, or delete;
- provider mutation or provider-side configuration changes;
- spending, quota changes, publishing, outreach, or production use;
- browser execution, shell execution, infrastructure mutation, or deployment changes.

A configured connection, successful validation, status view, plan, recommendation, audit record, or pending approval does not authorize execution.

## 3. Threat model and required mitigations

| Threat | Required mitigation | Current evidence |
|---|---|---|
| Cross-tenant access | tenant and environment checks on every port and projection | contract and reference-deployment isolation tests |
| Secret disclosure | strict response allowlists, secret-shaped-field rejection, no reveal/copy controls | core tests, status-surface tests, dashboard source guards |
| Automatic approval | approval adapters return explicit decisions; examples remain pending | host-port contracts and reference tests |
| Framework lock-in | host-neutral core and buyer-supplied adapters | contract-isolation tests and external-host example |
| Unauthorized status access | authenticated self-service endpoint and owner-only admin endpoint | route regression tests |
| Unsafe UI mutation | GET-only read-only status dashboards with no forms or write requests | dashboard regression tests |
| Audit tampering or loss | buyer-controlled append-only durable audit implementation and retention policy | interface defined; production implementation remains buyer responsibility |
| Vault compromise | buyer-selected managed vault, key rotation, access logging, least privilege | interface defined; production implementation remains buyer responsibility |
| Supply-chain compromise | pinned dependencies, CI, review, artifact verification, vulnerability management | repository CI exists; buyer must operate production controls |
| Recovery from corrupted state | tested backups, restore rehearsal, versioned migrations, rollback plan | procedure documented below; production evidence required before launch |

## 4. Compliance and evidence responsibility matrix

| Control area | SignalBoost repository provides | Buyer or operator must provide |
|---|---|---|
| Data inventory | contract-level metadata inventory and prohibited-field boundaries | actual provider data map, data classification, retention schedule |
| Access control | identity and authorization ports; authenticated reference routes | SSO/MFA, role design, joiner-mover-leaver process, access reviews |
| Secret management | opaque vault-reference contract and redaction tests | production vault, KMS/HSM policy, rotation, break-glass process |
| Audit | append-only audit port contract | durable store, retention, immutability, monitoring, export, legal hold |
| Change management | pull requests, CI, bounded phases | production release approvals, separation of duties, deployment records |
| Incident response | documented boundaries and recovery procedure | on-call ownership, severity model, notification obligations, exercises |
| Business continuity | recovery and rollback procedure | tested backups, RTO/RPO, regional strategy, restore evidence |
| Privacy | public response allowlists and minimization | lawful basis, notices, DPA, data-subject procedures, residency decisions |
| Vendor risk | provider-neutral contracts | assessment of providers, cloud, vault, identity, and monitoring vendors |
| Certification | no certification claim | independent audit, evidence collection, remediation, attestation |

Compliance must be evaluated against the buyer's actual deployment, data, providers, jurisdictions, policies, and operational evidence.

## 5. Installation and configuration

### 5.1 SignalBoost mode

1. Deploy the supported SignalBoost SaaS application using the repository's standard deployment process.
2. Configure the existing authentication, database, and vault master-key requirements documented for the SaaS host.
3. Verify the Provider Hub status routes require authentication and that the admin route enforces owner access.
4. Verify `/dashboard/provider-hub` and `/admin/provider-hub` render only bounded status metadata.
5. Run the full SaaS CI, Playwright, Provider Hub Node tests, build, and security regression suites.
6. Do not enable provider mutation or credential-change controls through the status surfaces.

### 5.2 External-host mode

1. Consume the versioned contracts from `saas/provider-hub-core/index.ts` and `saas/provider-hub-core/host-ports.ts`.
2. Implement buyer-owned adapters for identity, vault, persistence, audit, approvals, licensing, and UI projection.
3. Preserve tenant and environment identity in every adapter call.
4. Store credentials only in the buyer's approved vault. Return opaque references to trusted host code only.
5. Project public metadata through an explicit allowlist. Never serialize raw secrets, encrypted envelopes, internal references, emails, or roles.
6. Keep consequential actions disabled until authorization, policy, approval, audit, rollback, and operational evidence are implemented and tested.
7. Replace every in-memory reference adapter before production use.
8. Run compatibility, isolation, authorization, redaction, backup, restore, load, and acceptance testing in the buyer environment.

### 5.3 Required production configuration record

Record and approve:

- contract versions;
- deployment version and immutable artifact digest;
- tenant and environment identifiers;
- identity and authorization adapter versions;
- vault and key-management configuration;
- persistence schema version;
- audit retention and export location;
- approval policy identifiers;
- entitlement and licensing configuration;
- supported providers and authentication methods;
- data residency and retention decisions;
- backup schedule, RPO, RTO, restore owner, and incident contacts.

## 6. Upgrade, migration, and rollback

### 6.1 Pre-upgrade

1. Review contract and schema changes.
2. Confirm backward compatibility or produce an explicit migration plan.
3. Back up durable connection metadata, audit records, configuration, and required vault metadata without exporting plaintext secrets.
4. Verify restore access and rollback artifacts.
5. Run tests against representative tenant and environment fixtures.
6. Obtain the required change and production approvals.

### 6.2 Upgrade

1. Deploy to a non-production environment.
2. Run contract, isolation, authorization, redaction, status-route, UI, build, and regression tests.
3. Validate public response allowlists against captured schemas.
4. Apply versioned migrations exactly once with durable migration records.
5. Promote the immutable artifact through the approved release process.
6. Monitor authentication failures, authorization denials, error rates, latency, audit append failures, and vault-adapter failures.

### 6.3 Rollback

Rollback when contract compatibility, authorization, isolation, redaction, persistence, audit, or vault behavior cannot be verified.

1. Disable consequential actions and fail closed.
2. Stop the new version from receiving traffic.
3. Restore the last approved application artifact.
4. Reverse only migrations explicitly documented as reversible; otherwise restore from a verified backup into a controlled recovery environment.
5. Verify tenant isolation, status surfaces, audit continuity, and vault references.
6. Record the incident, decision, evidence, and follow-up remediation.

Never roll back by copying plaintext credentials or bypassing vault controls.

## 7. Backup and recovery

### 7.1 Backup scope

Back up:

- durable connection metadata;
- tenant and environment mappings;
- audit records and evidence references;
- approval and entitlement records where implemented;
- deployment configuration and version manifests;
- vault configuration metadata according to the vault provider's supported backup model.

Do not place plaintext provider credentials in general database, log, artifact, or document backups.

### 7.2 Recovery procedure

1. Declare the incident and identify the affected tenants and environments.
2. Disable writes and consequential actions; preserve read-only diagnostics when safe.
3. Verify the integrity and timestamp of the selected backup.
4. Restore into an isolated recovery environment.
5. Reconcile connection metadata with vault references without retrieving or exposing plaintext secrets.
6. Verify identity, tenant isolation, authorization, entitlement, audit append, and public projection behavior.
7. Run the Provider Hub acceptance suite and buyer-specific recovery tests.
8. Obtain approval before restoring production traffic.
9. Monitor and document recovery results, data gaps, and credential rotations required by policy.

### 7.3 Recovery evidence

Retain:

- backup identifier and integrity result;
- restore start and completion timestamps;
- affected scope;
- RPO and RTO achieved;
- test results;
- approvals;
- audit continuity result;
- unresolved gaps and remediation owner.

## 8. Acceptance checklist

### 8.1 Repository acceptance

- [ ] `provider-hub-core` remains host-neutral and versioned.
- [ ] Host ports cover identity, vault references, persistence, audit, approvals, licensing, and UI projection.
- [ ] Public metadata rejects secret-shaped fields and unsafe mask values.
- [ ] Self-service and admin status APIs enforce authentication and authorization.
- [ ] Status dashboards remain read-only and GET-only.
- [ ] No public response contains ciphertext, encrypted envelopes, vault references, emails, roles, or plaintext secrets.
- [ ] Reference deployment remains deterministic, network-free, execution-free, and non-production.
- [ ] External-host example imports no SignalBoost application services.
- [ ] Provider Hub Node tests pass.
- [ ] TypeScript, production build, Playwright, and all required repository workflows pass.

### 8.2 Production acceptance

Before any production claim, the buyer must also verify:

- [ ] production identity, MFA, RBAC, and access-review controls;
- [ ] production vault and key-management controls;
- [ ] durable persistence, migrations, backups, and restore rehearsal;
- [ ] immutable audit retention and monitoring;
- [ ] explicit approval policies for consequential actions;
- [ ] provider-specific validation and compatibility tests;
- [ ] load, availability, failover, and recovery testing;
- [ ] vulnerability management, dependency review, and penetration testing;
- [ ] privacy, residency, retention, and regulatory review;
- [ ] incident response, support ownership, and customer documentation;
- [ ] licensing and entitlement enforcement appropriate to the commercial deployment.

## 9. Release decision

Repository phases 1 through 8 establish the Provider Hub portable foundation, tested read-only status experience, host integration contracts, reference package, and operating documentation.

This closes the initial implementation sequence. It does not by itself make every enterprise capability production-ready. A deployment may be described only according to verified state: designed, implemented, tested, packaged, deployable, production-proven, or independently certified.

## 10. Permanent safety notices

- Raw credentials are never a public response.
- Status and validation do not authorize execution.
- Automatic approval is disabled.
- Provider mutation is disabled unless separately implemented and approved.
- Browser execution is disabled unless separately governed.
- Infrastructure mutation is disabled unless separately governed.
- Production execution requires explicit authorization, policy, approval, audit, and rollback controls.
