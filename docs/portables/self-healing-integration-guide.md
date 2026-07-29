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
| `HostBranding` | Product name, console URL, and the language your people are written to |
| `SqlExecutor` | Durable dispatch ledger database |
| `SiemTransport` | SIEM collector transport |
| `IncidentSource` | Generic signed webhook or staged vendor adapter |
| `SupervisorExecutor` | The runner that performs approved repair steps |
| `ApiStepRunner` | Individual API calls against the target provider |
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

## 4. Execution runners — nothing repairs without one

The orchestrator plans, applies policy, routes approvals, verifies and audits on its own.
**It does not execute.** Performing a repair step means touching your systems, and the
portable has no way to do that except through a runner you supply.

- `SupervisorExecutor` — the interface a dispatched repair is handed to. It declares its
  `kind` and returns a structured result: which steps ran, which were skipped, the
  evidence produced, and a status.
- `ApiStepRunner` — the function `APIExecutor` calls to perform an individual API step
  against the target provider.

If no executor is registered for the kind a plan requests, the dispatcher records an
`executor_missing` audit event and the run ends without execution.

**A deployment with no execution runner is still useful, and still honest.** Incidents are
received, diagnosed, gated for approval, verified where read-only steps allow, and
audited. What it will not do is claim a repair happened: the orchestration ends
`unresolved` and records why. That is intended behaviour rather than a defect. A
fabricated success is the one thing an operator must never find in an audit trail.

## 5. Language

Everything this product writes for a person to read is produced in the language you set. Not
the console only — the substance.

Set `locale` on `HostBranding`:

```ts
branding: {
  productName: 'Acme Supervisor',
  consoleBaseUrl: 'https://ops.acme.example/console',
  locale: 'pt-BR',
}
```

Supported: `en`, `es`, `pt`, `pl`, `ru`. Region tags are accepted — `pt-BR`, `es-MX` — because
you configure a region rather than a language code. An unrecognised or absent value falls back
to English.

### What it changes

The approval request your named approver receives: subject, explanation, every field label,
the button, and the risk category itself. The plan's diagnosis — the sentence stating what went
wrong. Every step description and expected result. Every stop reason. Every evidence summary
and verification result.

This matters most for the approval request, which reaches someone who may never open the
console and asks them to consent to a consequential action. Comprehension is part of consent.
In a language your engineer does not read, the approval gate degrades from a safety control
into a delay.

### What it does not change

**Anything a machine parses.** Audit event types (`dispatch_requested`, `policy_evaluated`),
step ids (`read-deployment`, `verify-read-only-diagnosis`), incident types (`VERCEL_CANCELED`)
and severities are identical in every locale. A SIEM rule, a report or an alerting threshold
built on them does not break when a team switches language.

### When text is translated

At the moment it is written, not when it is displayed. An evidence record is a statement about
what was observed at a point in time, so it keeps the language it was recorded in. Changing
this setting affects what happens next; it does not rewrite history.

### If you write your own notification sink

The translations are part of the product, not the reference adapter. Import them:

```ts
import { approvalCopy, categoryLabel } from '@signalboost/self-healing-supervisor'
```

Your approvers get the same wording they would from the reference implementation, in your
configured language. You are not expected to supply your own translations to get a message
your staff can read.

## 6. Incident intake

Companies can use the generic signed webhook immediately or one of the staged vendor
adapters. Vendor adapters only map fields into `IncidentMapping`; the universal core
handles normalization, sanitation, validation, fingerprinting, deduplication, storage,
and source health.

## 7. What “live” requires

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

## 8. Acceptance rehearsal

```bash
node scripts/run-self-healing-acceptance.mjs ./my-host.mjs --out acceptance-record.json
```

The acceptance rehearsal validates notification, approval gating, branding, and audit
wiring. It does not detect a real incident or perform a real provider repair.
