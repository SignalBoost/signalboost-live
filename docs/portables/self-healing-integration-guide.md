# Self-Healing Supervisor — Enterprise Integration Guide

**Audience:** the buyer's engineering team installing the Self-Healing portable into
their own stack. Nothing here depends on SignalBoost infrastructure.

**What the portable does:** it watches deployment/provider health, and when it detects
an incident it prepares a repair. Safe steps run automatically; **dangerous steps
(financial, destructive, credential/security) pause for a human approver** and are
never auto-executed. Every action is emitted to your SIEM. The portable brings the
behavior; **you bring the infrastructure** through the interfaces below.

---

## 1. What you provide (the HostContext boundary)

You implement these interfaces against your own systems. Import them from
`lib/supervisor/portable`.

| Interface | You back it with | Purpose |
| --- | --- | --- |
| `SecretsProvider` | your vault (Vault, AWS/GCP Secrets Manager, etc.) | resolve provider API tokens at runtime — no secrets in env or code |
| `NotificationSink` | your channel (email, Slack, ServiceNow, PagerDuty, Teams) | deliver a paused-step approval request to approvers |
| `ApproverDirectory` | your SSO/IdP (Okta, Entra, etc.) | resolve who may approve a dangerous step |
| `HostBranding` | your product name + console URL | branding on the notifications your people receive |
| `SqlExecutor` | your database driver | the durable at-most-once dispatch ledger (§3) |
| `SiemTransport` | your SIEM collector (HTTPS/HEC, syslog, Kafka) | receive the audit stream (§4) |

All are plain interfaces — no base class, no platform import. The portable core names
no platform, reads no `process.env`, and imports no host singleton.

---

## 2. Configuration (no environment variables required)

The portable does **not** read environment variables in its core. You pass everything
explicitly. The only env-reading code in the repo is the clearly-labeled
`platform-env-adapter.ts` files, which exist for the SignalBoost test rig and which you
do **not** use.

You supply, per deployment: your `HostContext` implementation, your `SqlExecutor` for
the ledger, and your `SiemAuditSinkConfig` (transport + format). That's the whole
surface.

---

## 3. The dispatch ledger (DDL)

The portable guarantees **at-most-once** execution of a repair dispatch. That
guarantee rests on a `UNIQUE`/`PRIMARY KEY` on `dispatch_id`: a duplicate insert is
caught and treated as "already dispatched." Create this table (Postgres shown; adapt
types for your engine). Override the table name via `tableName` if your schema
requires it.

```sql
CREATE TABLE supervisor_dispatch_ledger (
  dispatch_id     TEXT        NOT NULL PRIMARY KEY,   -- the at-most-once key
  incident_id     TEXT        NOT NULL,
  executor_kind   TEXT        NOT NULL,
  work_item_id    TEXT        NOT NULL,
  execution_id    TEXT        NOT NULL,
  claimed_at      TIMESTAMPTZ NOT NULL,
  status          TEXT        NOT NULL,
  schema_version  TEXT        NOT NULL
);

CREATE INDEX idx_supervisor_dispatch_ledger_incident
  ON supervisor_dispatch_ledger (incident_id);
```

Your `SqlExecutor` is tiny — one method, parameterized (`$1..$n`):

```ts
interface SqlExecutor {
  execute(sql: string, params: readonly unknown[]): Promise<void>
}
```

If your driver signals a unique-constraint violation with something other than
Postgres SQLSTATE `23505` (the default the store already recognizes, along with
"duplicate"/"unique" in the message), teach it yours:

```ts
createEnterpriseDispatchStore({
  sql: myExecutor,
  tableName: 'supervisor_dispatch_ledger',
  isUniqueViolation: (e) => (e as any)?.code === 'ER_DUP_ENTRY', // e.g. MySQL
})
```

---

## 4. Audit → your SIEM

Every supervisor action flows through a `DispatchAuditSink`. `createSiemAuditSink`
formats each event and ships it through your transport. Two built-in formats cover
essentially every SIEM:

- `ecs-json` — Elastic Common Schema JSON. Native for Elastic, Splunk (HEC), Datadog,
  Microsoft Sentinel, Sumo Logic, Chronicle. The modern default.
- `cef` — ArcSight Common Event Format over syslog. For ArcSight, QRadar, legacy SOC
  pipelines.

Events are severity-tagged for triage (e.g. a dangerous step pausing for approval →
`warning`; a failed execution → `high`). You implement `SiemTransport.send`:

```ts
import { createSiemAuditSink, teeAuditSinks } from 'lib/supervisor/portable'

const siem = createSiemAuditSink({
  transport: {
    async send(record, meta) {
      // ship `record` to your collector; `meta` gives eventType/occurredAt/severity
      await fetch(MY_HEC_URL, { method: 'POST', headers: { Authorization: MY_TOKEN }, body: record })
    },
  },
  format: 'ecs-json',
  vendor: 'AcmeCorp',
  product: 'SelfHealingSupervisor',
  productVersion: '1.0.0',
  tenantId: 'acme',
  environment: 'production',
})
```

Transport failures are **swallowed by default** so audit export can never break
self-healing — your transport owns durability (queue/retry/dead-letter). Set
`swallowTransportErrors: false` if your compliance posture requires failures to
propagate. Use `teeAuditSinks(siem, myOtherSink)` to send to your SIEM **and** keep a
second trail in the same call.

---

## 5. Reference wiring

```ts
import {
  createEnterpriseNotifier,
  createEnterpriseDispatchStore,
  createSiemAuditSink,
  type HostContext,
} from 'lib/supervisor/portable'
import { createSupervisorDispatcher } from 'lib/supervisor/executors/create-supervisor-dispatcher'

// 1. Implement the boundary against your systems.
const host: HostContext = {
  secrets: mySecretsProvider,          // your vault
  notifications: mySlackSink,          // your channel
  approvers: myOktaApproverDirectory,  // your SSO
  branding: { productName: 'Acme Ops', consoleBaseUrl: 'https://ops.acme.com' },
}

// 2. Durable ledger on your database.
const store = createEnterpriseDispatchStore({ sql: myExecutor })

// 3. Audit to your SIEM.
const auditSink = createSiemAuditSink({ transport: myHecTransport, format: 'ecs-json' })

// 4. Wire the dispatcher in enterprise mode (host-driven, not platform email).
const dispatcher = createSupervisorDispatcher({ host, store, auditSink })
```

On the SignalBoost test rig the same factory is called with no `host` and falls back
to a platform email notifier — that fallback is the only place the platform's own
email is touched, and it does not run on your deployment.

---

## 6. What "LIVE" requires (honest checklist)

This portable is enterprise-ready when, on your stack:

1. ✅ Core reads no env, names no platform (already true).
2. ✅ Secrets come from your vault via `SecretsProvider`.
3. ✅ Notifications go to your channel via `NotificationSink`.
4. ✅ The dispatch ledger runs on your database via `SqlExecutor` (§3 DDL applied).
5. ✅ Audit lands in your SIEM via `SiemTransport` (§4).
6. ⬜ Approvers resolve through your SSO (`ApproverDirectory` implemented against your IdP).
7. ⬜ You have run an end-to-end incident in staging: detect → safe step auto-runs →
   dangerous step pauses → approver notified → approval → execution → SIEM shows the
   full trail.

Items 1–5 are code the portable provides and you configure. Items 6–7 are your
integration and acceptance test. When 6–7 pass in your environment, the portable is
genuinely live for you.
