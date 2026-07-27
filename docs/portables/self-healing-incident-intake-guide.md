<!-- docs/portables/self-healing-incident-intake-guide.md -->

# Incident intake — buyer and adapter guide

The Self-Healing Supervisor diagnoses, gates, executes and verifies repairs. It does
not watch your systems, and that is deliberate: you already run Datadog, CloudWatch,
Alertmanager, PagerDuty or Splunk, and replacing them is not on offer. This document
covers the socket those tools plug into.

Two ways in:

1. **The generic signed webhook.** Point any system at it today. No adapter required.
2. **A native vendor adapter.** A thin translation of one vendor's payload shape.
   Written once, against the contract in this document.

Both produce the identical canonical incident. Everything downstream — diagnosis,
policy, approval gating, verification, audit — is unaware of which one was used.

---

## 1. The generic signed webhook

### The payload

Only `provider` and `errorMessage` are required.

```json
{
  "schemaVersion": "supervisor-incident-intake-v1",
  "provider": "acme-internal-monitor",
  "errorMessage": "payment worker queue is not draining",
  "environment": "production",
  "severity": "critical",
  "detectedAt": "2026-07-27T12:00:00.000Z",
  "errorCode": "QUEUE_STALLED",
  "affectedResource": "worker/payments",
  "dedupeKey": "monitor-alert-8891",
  "resolved": false,
  "evidence": [
    { "type": "query_result", "summary": "queue depth 41000 and rising", "reference": "https://monitor.internal/q/1" }
  ],
  "metadata": { "team": "payments", "runbook": "RB-114" }
}
```

`schemaVersion` may be omitted — a shell script with `curl` is a supported sender.
If present it must match exactly; an unrecognised version is reported, not silently
accepted.

Send `"resolved": true` when the condition clears. That is **ignored**, not rejected:
recovery notices do not count as intake failures.

### Signing

Two headers. The signature is HMAC-SHA256 over `` `${timestamp}.${rawBody}` ``, hex
encoded, prefixed `v1=` (a bare hex digest is also accepted).

```
x-supervisor-timestamp: 1785499200
x-supervisor-signature: v1=<hex>
```

The timestamp is inside the signed material, so a captured request cannot be replayed
with a fresh timestamp — changing it invalidates the signature. Requests older than
the replay window (default 300s) are refused; so are timestamps more than 60s in the
future.

Use `signIntakeRequest(secret, timestamp, rawBody)` from the portable if you are
generating signatures in JavaScript. Any language works — it is plain HMAC-SHA256.

### Limits and rotation

| Setting | Default | Notes |
|---|---|---|
| `replayWindowSeconds` | 300 | How long a signed request stays valid |
| `clockSkewSeconds` | 60 | Tolerance for a sender running fast |
| `maxBodyBytes` | 131072 | Measured in bytes, checked before parsing |
| `minSecretLength` | 16 | Enforced when the deployment is wired, not at alert time |

`secret` accepts an array. Publish the new secret, keep the old one listed until every
sender has moved, then drop it — no window where alerts are dropped.

---

## 2. Writing a vendor adapter

An adapter is a `map` function and nothing else.

```ts
import { createIncidentSource } from './incident-source.ts'

export const acmeSource = createIncidentSource({
  sourceId: 'acme',
  vendor: 'Acme Monitoring',
  status: 'staged',

  authenticate(delivery) {
    return delivery.headers['x-acme-token'] === expected
      ? { ok: true }
      : { ok: false, reason: 'bad_token' }
  },

  map(body) {
    const alert = body as AcmeAlert
    if (alert.type === 'recovery') return null
    return {
      provider: 'acme',
      errorMessage: alert.title,
      severity: alert.priority,
      environment: alert.tags?.env,
      affectedResource: alert.scope,
      dedupeKey: alert.aggregation_key,
      detectedAt: alert.fired_at,
      evidence: [{ type: 'vendor_alert', summary: alert.body, reference: alert.url }],
      metadata: { tags: alert.tags },
    }
  },
})
```

### Rules

**Pass raw vendor values through.** Do not normalise severity or environment. The core
maps `SEV-1`, `P0`, `firing`, `critical`, `fatal` and the rest to the three canonical
severities; an adapter that pre-maps will fight that table and diverge from every
other vendor.

**Do not sanitize, validate, fingerprint or deduplicate.** All of it happens after
`map` returns, identically for every source. An adapter doing its own is redundant and
becomes the one place a vendor behaves differently.

**Always set `dedupeKey` when the vendor has one.** Datadog's aggregation key,
PagerDuty's `dedup_key`, Alertmanager's fingerprint. It overrides message-text
comparison, so a reworded alert collapses into the existing incident instead of
opening a second one.

**Return `null` for anything that is not an incident.** Recovery notices, heartbeats,
test pings, acknowledgements. `null` means ignored; it is not a failure.

**Let bad input reject itself.** Missing required fields, malformed JSON and failed
authentication are all handled by the core with a named reason. Throwing from `map`
is contained too — it becomes `mapping_error` and the next delivery still works.

### What the core does for you

Validation against the canonical schema · severity and environment normalization ·
secret-shaped key removal · size and depth bounds · deterministic fingerprinting ·
deduplication · health counters · four outcomes (`accepted`, `duplicate`, `ignored`,
`rejected`) each with a named reason.

Two behaviours worth knowing because they are deliberate:

- **An unlabelled environment defaults to `production`**, not `sandbox`. Production is
  the stricter policy path; assuming sandbox would quietly widen what may run
  unattended.
- **Secret-shaped metadata keys are removed, not blanked.** The canonical schema
  rejects on the key alone, so blanking the value would still fail the whole alert.
  Removed paths are listed under `intakeRedactedKeys` so a reviewer can see what was
  dropped and from where; no plaintext secret reaches the incident, the audit trail or
  your SIEM.

---

## 3. Status: staged vs live

Every adapter carries `status`:

| Status | Meaning |
|---|---|
| `staged` | Mapping is proven against fixtures. Never run against real provider traffic. |
| `live` | Validated against the real provider in a real deployment. |
| `disabled` | Refuses every delivery, before authentication. |

An adapter ships `staged` and stays there until **all** of the following exist:

- validation against real provider traffic;
- documented configuration for that vendor;
- successful staging ingestion;
- durable incident creation;
- end-to-end runtime evidence.

`status` is reported by `health()` and by the registry, never hidden. A staged adapter
must not be presented anywhere in the product as a live integration. Nothing flips to
`live` because the code looks finished.

---

## 4. Testing an adapter

Every adapter ships with fixtures — real captured payloads from that vendor, secrets
scrubbed — and a suite covering at minimum:

- a firing alert maps to the expected canonical incident;
- a recovery notice returns `null`;
- severity mapping across that vendor's full vocabulary;
- the vendor's dedupe key is carried through and collapses a repeat;
- authentication rejects a forged request;
- a malformed payload rejects with a named reason rather than throwing.

Write the negative cases first. An intake path that stays green while dropping real
alerts is worse than no intake path, because it looks like it is working.

---

## 5. What is not included

The portable does not ship monitoring, does not store your incidents (you bind a
`DedupeStore` and an `IncidentStore` against your own datastore — in-memory reference
implementations are included for tests and single-process deployments), and does not
execute production changes without the approval path described in the integration
guide.
