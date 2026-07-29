<!-- docs/portables/self-healing-integration-guide.md -->
# Self-Healing Supervisor — Enterprise Integration Guide

**Release:** `1.0.0-rc.2` design-partner evaluation  
**Public package:** `@signalboost/self-healing-supervisor`

The portable runs inside the buyer's environment. It supplies bounded product behaviour; the buyer supplies identity, credentials, storage, notifications, audit transport, provider capabilities, execution runners, approval keys, and licence configuration.

## 1. Canonical buyer entry point

Paid planning and dispatch must be constructed only through:

```ts
import { createLicensedSelfHealingSupervisor } from '@signalboost/self-healing-supervisor'
```

The npm package does not export an equivalent unguarded dispatcher factory. Reading incidents, observation, and audit export remain available independently of a paid execution path. Any provider-bound `read` or `verify` still requires an explicit read-only capability.

Source delivery makes licence enforcement contractual rather than tamper-proof. The commercial agreement must state that plainly.

## 2. Buyer-provided boundaries

| Boundary | Buyer implementation |
| --- | --- |
| `HostContext.secrets` | Vault or cloud secrets manager implementing `getSecret(name)` |
| `HostContext.notifications` | Email, Slack, Teams, ServiceNow, PagerDuty, or ticketing sink |
| `HostContext.approvers` | SSO/IdP-backed named approver directory |
| `HostContext.branding` | Product name, console URL, and notification locale |
| `DispatchStore` | Durable atomic at-most-once dispatch claim |
| `DispatchAuditSink` | Durable audit/SIEM transport |
| `ApiStepRunner` | The only code permitted to call a real provider |
| `ApiCapabilityRegistry` | Explicit provider/action allow-list and validation boundary |
| `ApprovalContinuationVerifier` | Signed exact-plan and exact-scope approval validation |
| `ApprovalNonceStore` | Durable atomic one-time nonce consumption |
| `Thinker` | Repair-plan proposal implementation |
| licence configuration | Token, issuer, and accepted issuer public keys |

The package reads no production credential from `process.env` and imports no platform email or provider singleton.

## 3. Durable dispatch ledger

The packaged `EnterpriseDispatchStore` inserts the following fields. `work_item_id` and `execution_id` are nullable because not every valid dispatch is attached to a coordinated work item.

```sql
CREATE TABLE supervisor_dispatch_ledger (
  dispatch_id     TEXT        NOT NULL PRIMARY KEY,
  incident_id     TEXT        NOT NULL,
  executor_kind   TEXT        NOT NULL,
  work_item_id    TEXT        NULL,
  execution_id    TEXT        NULL,
  claimed_at      TIMESTAMPTZ NOT NULL,
  status          TEXT        NOT NULL,
  schema_version  TEXT        NOT NULL
);

CREATE INDEX supervisor_dispatch_incident_idx
  ON supervisor_dispatch_ledger (incident_id, claimed_at DESC);
```

The primary key is the at-most-once boundary. A duplicate dispatch ID must return `false`; every other database failure must be surfaced and execution must not begin.

An approved continuation uses a **new dispatch ID** and references the prior pause audit event. Reusing the paused dispatch ID is correctly rejected as a duplicate.

## 4. Durable approval nonce store

`ApprovalNonceStore.consume(nonce, expiresAt)` must be atomic: exactly one caller receives `true`; every replay receives `false`. Store a cryptographic hash rather than the raw nonce when possible.

Example PostgreSQL table:

```sql
CREATE TABLE supervisor_approval_nonce (
  nonce_hash   TEXT        NOT NULL PRIMARY KEY,
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX supervisor_approval_nonce_expiry_idx
  ON supervisor_approval_nonce (expires_at);
```

A typical implementation hashes the nonce, attempts one insert, treats unique violation as replay, and periodically removes expired rows only after the maximum audit-retention requirement is satisfied.

The exported `InMemoryApprovalNonceStore` is for tests and single-process evaluation only. It is not a production replay boundary.

## 5. Explicit API capability policy

The package does not infer execution safety from descriptions, action labels, or keywords. Every provider-bound `api_request`, `read`, or `verify` requires an exact registered capability:

```ts
import { createApiCapabilityRegistry } from '@signalboost/self-healing-supervisor'

const apiCapabilities = createApiCapabilityRegistry([
  {
    provider: 'example-cloud',
    actionId: 'read-service-status',
    mutation: false,
    riskClass: 'read_only',
    approvalRequired: false,
    autoExecutable: true,
    methods: ['GET'],
    resourcePattern: /^\/services\/[a-z0-9-]+\/status$/,
    validateParameters(parameters) {
      return parameters.includeSecrets !== true
    },
    maximumExecutionsPerDispatch: 1,
  },
  {
    provider: 'example-cloud',
    actionId: 'restart-service',
    mutation: true,
    riskClass: 'routine_reversible',
    approvalRequired: false,
    autoExecutable: true,
    methods: ['POST'],
    resourcePattern: /^\/services\/[a-z0-9-]+\/actions\/restart$/,
    validateParameters(parameters) {
      return parameters.confirmed === true
    },
    maximumExecutionsPerDispatch: 1,
  },
])
```

Execution occurs only when provider, stable action ID, method, resource pattern, parameter validation, risk class, execution status, and execution limit all match.

A `read` or `verify` step is executable only when the matched capability is non-mutating, has `riskClass: 'read_only'`, and uses `GET` or `HEAD`. A mutation disguised with a `read` label is non-executable; approval does not restore its authority.

Unknown providers and action IDs never execute, even after a valid signature is presented. Method mismatch, resource mismatch, invalid nested parameters, semantic action mismatch, and disabled limits also fail closed. A registered consequential capability may resume only through the signed continuation path.

Descriptions may help label a paused risk category; they never grant authority.

## 6. Signed approval continuation

Create the verifier with buyer-controlled Ed25519 public keys, a durable nonce store, and a durable audit lookup:

```ts
import {
  createEd25519ApprovalVerifier,
  fingerprintRepairPlan,
} from '@signalboost/self-healing-supervisor'

const planFingerprint = fingerprintRepairPlan(repairPlan)

const approvalVerifier = createEd25519ApprovalVerifier({
  publicKeyFor: keyId => approvalKeyDirectory.getPublicKey(keyId),
  nonceStore: myDurableApprovalNonceStore,
  previousAuditEventExists: async input => {
    return auditRepository.hasPausedEvent({
      eventId: input.eventId,
      incidentId: input.incidentId,
      planId: input.planId,
      planFingerprint: input.planFingerprint,
      approvedStepIds: input.approvedStepIds,
    })
  },
})
```

An `ApprovalContinuationProof` is valid only when its Ed25519 signature and all bound fields validate:

- incident ID;
- plan ID;
- SHA-256 fingerprint of the complete canonical repair plan;
- continuation dispatch ID;
- exact ordered approved step IDs;
- approver identity;
- approval time;
- expiration time;
- one-time nonce;
- signing key ID;
- prior pause audit-event ID.

The approval signer and dispatcher must use the exported `fingerprintRepairPlan` helper. Audit the fingerprint when the action first pauses, include the same value in the signed proof, and confirm it in `previousAuditEventExists`.

Changing any plan content—including provider, resource, method, nested parameters, descriptions, risk metadata, or verification steps—changes the fingerprint and invalidates the approval. Signature failure, field modification, extra steps, missing steps, order changes, expiration, excessive future clock skew, unknown key, missing pause event, and nonce replay also fail closed.

## 7. Canonical licensed wiring

```ts
import {
  createApiCapabilityRegistry,
  createEd25519ApprovalVerifier,
  createEnterpriseDispatchStore,
  createLicensedSelfHealingSupervisor,
  createSiemAuditSink,
  fingerprintRepairPlan,
  type HostContext,
} from '@signalboost/self-healing-supervisor'

const host: HostContext = {
  secrets: mySecretsProvider,
  notifications: myNotificationSink,
  approvers: myApproverDirectory,
  branding: {
    productName: 'Acme Operations Supervisor',
    consoleBaseUrl: 'https://ops.acme.example/supervisor',
    locale: 'pt-BR',
  },
}

const dispatchStore = createEnterpriseDispatchStore({ sql: mySqlExecutor })
const audit = createSiemAuditSink({ transport: mySiemTransport, format: 'ecs-json' })

const supervisor = createLicensedSelfHealingSupervisor({
  host,
  license: {
    token: installedLicenceToken,
    issuer: expectedIssuer,
    publicKeysPem: acceptedIssuerPublicKeys,
  },
  audit,
  dispatchStore,
  apiRunner: myProviderRunner,
  apiCapabilities,
  approvalVerifier,
  thinker: myThinker,
  onEntitlementRefusal: event => myAuditRepository.recordEntitlementRefusal(event),
})

const thinker = supervisor.thinker
const dispatcher = supervisor.dispatcher
```

The factory refuses construction when licence material or any required execution boundary is absent. At call time, `proposeRepairPlan` requires feature `repair.plan`; `dispatch` requires feature `repair.dispatch`.

## 8. Notification language

Supported notification locales are `en`, `es`, `pt`, `pl`, and `ru`; region tags such as `pt-BR` and `es-MX` resolve to their language. Unknown or missing values fall back to English.

The reference enterprise notifier localizes its approval heading, category wording, explanatory reason, and fallback description. It preserves caller-supplied step descriptions. Machine fields—event types, risk-category identifiers, step IDs, incident IDs, dispatch IDs, provider IDs, and schema versions—never change with locale.

A custom notification sink can reuse the same catalogue:

```ts
import { approvalCopy, categoryLabel } from '@signalboost/self-healing-supervisor'
```

## 9. Verification and incident intake

Read-only verification does not widen execution authority. A verifier may only inspect explicitly registered read-only capabilities configured by the buyer.

Incident sources authenticate, normalize, sanitize, fingerprint, deduplicate, and store deliveries before orchestration. Durable dedupe and incident stores are required for multi-process or serverless production deployments; in-memory stores are evaluation-only.

## 10. Buyer acceptance gates

A deployment is not production-ready until the exact archived tarball proves all of the following in a clean buyer-like environment:

1. package checksum, manifest, SBOM, and source commit are retained;
2. npm installation and public ESM import succeed without repository paths;
3. missing and invalid licences refuse planning and dispatch through the packaged factory;
4. valid entitlement permits only licensed features;
5. all three consequential categories pause and notify the intended named approvers;
6. registered routine and read-only capabilities execute only on an exact semantic match;
7. unknown actions and mutations disguised as reads never execute, including after approval;
8. valid signed continuation executes only the exact registered consequential capability, plan fingerprint, and step scope;
9. plan changes, tampering, expiration, missing audit binding, and nonce replay fail closed;
10. provider execution is verified through explicitly registered read-only observation;
11. audit evidence records the canonical plan fingerprint and reaches durable storage and the configured SIEM;
12. all five notification locales are accepted while machine identifiers remain stable;
13. upgrade and rollback are tested from archived artifacts.

Version `1.0.0` is not earned until this evidence exists outside the build platform.
