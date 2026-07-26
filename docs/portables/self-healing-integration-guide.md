<!-- docs/portables/self-healing-integration-guide.md -->
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

All are plain interfaces — no base class, no platform import. Everything under
`lib/supervisor/portable/` names no platform, reads no `process.env`, and imports no host
singleton — enforced, not asserted: `tests/supervisorPortableHostContext.node.test.ts`
fails the build if any of those files acquires a host reference.

---

## 2. Configuration (no environment variables required)

You pass everything explicitly. You supply, per deployment: your `HostContext`
implementation, your `SqlExecutor` for the ledger, and your `SiemAuditSinkConfig`
(transport + format). That is the whole surface — nothing is read from the environment on
your behalf, so nothing silently changes behaviour based on how your build system happens
to set `NODE_ENV`.

### 2.1 Where the build platform is still reachable, and why

The same test that enforces §1 also walks the **entire import graph** reachable from the
two entry points in §5 — currently 64 modules — and fails if host coupling appears
anywhere new. Three touchpoints exist today and are listed in that test with their
justification. They are inert for you:

| Module | What it is | Why it cannot affect your deployment |
| --- | --- | --- |
| `executors/create-supervisor-dispatcher.ts` | lazy import of a platform email notifier | reached only when you supply neither a `HostContext` nor a notifier; supplying either bypasses it entirely |
| `executors/api-executor.ts` | lazy import of the platform provider engine, used as the **default** `api_request` runner | pass your own `ApiStepRunner` and the import is never evaluated |
| `executors/dispatch-store.ts` | reads `NODE_ENV` inside `platformSupervisorRuntime()` | a platform-only helper; you pass your own store or an explicit `runtime` |

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
const dispatchStore = createEnterpriseDispatchStore({ sql: myExecutor })

// 3. Audit to your SIEM.
const audit = createSiemAuditSink({ transport: myHecTransport, format: 'ecs-json' })

// 4. Wire the dispatcher in enterprise mode (host-driven, not platform email).
const dispatcher = createSupervisorDispatcher({ host, dispatchStore, audit })
```

On the SignalBoost test rig the same factory is called with no `host` and falls back
to a platform email notifier — that fallback is the only place the platform's own
email is touched, and it does not run on your deployment.

### 5.1 Approvers before you have an IdP adapter

`ApproverDirectory` is one method, but writing it against Okta or Entra is a project, and
until it exists the supervisor cannot pause a dangerous step and address the request to
anyone. So the portable ships a reference you configure instead of implement:

```ts
import { createStaticApproverDirectory } from 'lib/supervisor/portable'

const approvers = createStaticApproverDirectory({
  financial: [{ id: 'finance', address: 'finance@acme.com' }],
  destructive: [{ id: 'sre-oncall', address: '#sre-oncall' }],
  credential_security: [{ id: 'sec-oncall', address: 'sec@acme.com' }],
  // or: fallback: [{ id: 'ops', address: '#ops' }]  — one group approves everything
})
```

It **fails at construction**, not during an incident. A category with no approver, an
approver with no routable address, or a duplicate id throws when you wire the deployment.
That is deliberate: `createEnterpriseNotifier` swallows every error by design, because the
step has already halted and a delivery failure must not become a second incident — which
means a directory that breaks at runtime breaks *silently*. Validating up front is what
keeps that trade-off safe. After construction `approversFor` is total: it cannot throw and
cannot return empty, so delivery has no failure mode of its own.

Use it to run the §6 acceptance incident. Replace it with your IdP adapter before
production, so leavers and rota changes are reflected without a redeploy — the contract is
one method, so that is a one-line swap.

---

## 6. What "LIVE" requires (honest checklist)

This portable is enterprise-ready when, on your stack:

1. ✅ Core reads no env, names no platform (already true).
2. ✅ Secrets come from your vault via `SecretsProvider`.
3. ✅ Notifications go to your channel via `NotificationSink`.
4. ✅ The dispatch ledger runs on your database via `SqlExecutor` (§3 DDL applied).
5. ✅ Audit lands in your SIEM via `SiemTransport` (§4).
6. ⬜ Approvers resolve through your SSO (`ApproverDirectory` implemented against your IdP).
   A reference implementation ships so this is not a blocker on day one — see §5.1.
7. ⬜ You have run an end-to-end incident in staging: detect → safe step auto-runs →
   dangerous step pauses → approver notified → approval → execution → SIEM shows the
   full trail. A runnable harness performs this against your wiring — see §7.

Items 1–5 are code the portable provides and you configure. Items 6–7 are your
integration and acceptance test. When 6–7 pass in your environment, the portable is
genuinely live for you.

---

## 7. Running the acceptance test

Item 7 above is the one thing this guide cannot do for you: it has to run against *your*
vault, *your* channel, *your* directory. So the portable ships the scenario as code, and you
supply the `HostContext` you intend to deploy with.

```ts
import { runAcceptanceScenario } from 'lib/supervisor/portable'

const result = await runAcceptanceScenario({ host: myProductionHostContext })
console.log(result.summary)
if (!result.passed) process.exit(1)
```

It checks five guarantees and reports each one independently:

| Check | What a failure means |
| --- | --- |
| `safe_step_executed` | the supervisor cannot act at all — wiring or policy is wrong |
| `dangerous_step_paused` | **approval gating is not in effect. Do not deploy.** |
| `approver_notified` | your `ApproverDirectory` or `NotificationSink` is not delivering |
| `buyer_branding_used` | your people would receive notifications branded as someone else |
| `audit_trail_emitted` | your SIEM would have no record of the run |

Run it once per danger category to prove each routes to the right people:

```ts
for (const dangerousCategory of ['financial', 'destructive', 'credential_security'] as const) {
  const result = await runAcceptanceScenario({ host, dangerousCategory })
  if (!result.passed) throw new Error(`${dangerousCategory}: ${result.summary}`)
}
```

**It is safe to run repeatedly, including against production wiring.** No network call, no
provider call, no real repair: the consequential step is *required* to pause, so nothing
consequential can execute by design, and the safe step goes through a runner you inject. The
notification, however, is real — your channel receives it, because a harness that stubbed
that out would not be testing the thing you need tested.

The returned object is frozen and JSON-serializable, including every notification and audit
event produced. File it as your acceptance record.
