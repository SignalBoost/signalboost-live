<!-- docs/portables/self-healing-integration-guide.md -->
# Self-Healing Supervisor — Enterprise Integration Guide

**Audience:** the buyer's engineering team installing the Self-Healing portable into
their own stack. Nothing here depends on SignalBoost infrastructure.

The portable accepts incidents, proposes bounded repairs, applies policy and approval
gates, executes only the approved scope, verifies the result, and emits audit evidence.
The buyer supplies infrastructure through the portable interfaces below.

## 1. Buyer-provided boundaries

| Interface | Buyer implementation |
| --- | --- |
| `SecretsProvider` | Vault or cloud secrets manager |
| `NotificationSink` | Email, Slack, Teams, ServiceNow, or PagerDuty |
| `ApproverDirectory` | Okta, Entra, or another identity provider |
| `HostBranding` | Product name and console URL |
| `SqlExecutor` | Durable dispatch ledger database |
| `SiemTransport` | SIEM collector transport |
| `IncidentSource` | Generic signed webhook or staged vendor adapter |
| `VerificationStepRunner` | Read-only post-repair observations |

## 2. Durable dispatch ledger

```sql
CREATE TABLE supervisor_dispatch_ledger (
  dispatch_id     TEXT        NOT NULL PRIMARY KEY,
  incident_id     TEXT        NOT NULL,
  executor_kind   TEXT        NOT NULL,
  work_item_id    TEXT        NOT NULL,
  execution_id    TEXT        NOT NULL,
  claimed_at      TIMESTAMPTZ NOT NULL,
  status          TEXT        NOT NULL,
  schema_version  TEXT        NOT NULL
);
```

## 3. Reference wiring

```ts
import {
  createEnterpriseDispatchStore,
  createReferenceVerifier,
  createSiemAuditSink,
  type HostContext,
} from 'lib/supervisor/portable'
import { createSupervisorDispatcher } from 'lib/supervisor/executors/create-supervisor-dispatcher'

const host: HostContext = {
  secrets: mySecretsProvider,
  notifications: myNotificationSink,
  approvers: myApproverDirectory,
  branding: { productName: 'Acme Ops', consoleBaseUrl: 'https://ops.acme.com' },
}

const dispatchStore = createEnterpriseDispatchStore({ sql: myExecutor })
const audit = createSiemAuditSink({ transport: mySiemTransport, format: 'ecs-json' })
const verifier = createReferenceVerifier({ runner: myReadOnlyVerificationRunner })
const dispatcher = createSupervisorDispatcher({ host, dispatchStore, audit })
```

The Supervisor orchestrator receives the verifier separately as part of its dependency
configuration. Verification never widens execution authority and may only run the plan's
read-only `read`, `verify`, or `screenshot` steps.

## 4. Incident intake

Companies can use the generic signed webhook immediately or one of the staged vendor
adapters. Vendor adapters only map fields into `IncidentMapping`; the universal core
handles normalization, sanitation, validation, fingerprinting, deduplication, storage,
and source health.

## 5. What “live” requires

A buyer deployment is genuinely live only after all of these are proven in its own
environment:

1. Signed or authenticated incident intake reaches durable storage.
2. The production caller delivers the canonical incident to the orchestrator.
3. Policy blocks, pauses, or approves the exact intended scope.
4. The buyer's execution runner performs only approved actions.
5. The reference verifier re-reads state and refuses success unless every required
   verification step passes.
6. Notifications reach the configured approvers.
7. Audit evidence reaches the configured SIEM.
8. A staging incident completes the full workflow without unsupported production claims.

## 6. Acceptance rehearsal

```bash
node scripts/run-self-healing-acceptance.mjs ./my-host.mjs --out acceptance-record.json
```

The acceptance rehearsal validates notification, approval gating, branding, and audit
wiring. It does not detect a real incident or perform a real provider repair.
