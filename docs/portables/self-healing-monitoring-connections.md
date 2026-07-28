<!-- docs/portables/self-healing-monitoring-connections.md -->

# Connecting your monitoring — per-vendor guide

The Self-Healing Supervisor does not watch your systems. You already run something
that does, and replacing it is not on offer. This document covers connecting what you
already have.

Every vendor below arrives at the same endpoint and produces the same canonical
incident. Nothing downstream — diagnosis, policy, approval, verification, audit —
knows or cares which one sent it.

---

## 1. Before any vendor

### The endpoint

```
POST https://<your-deployment>/api/supervisor/intake/<sourceId>
```

`<sourceId>` is the vendor id from the table below. There is a `GET` on the same path
that returns a short description without revealing whether a secret is configured —
useful when a vendor's setup wizard probes the URL before saving it.

### A source exists only if its secret exists

Set the environment variable for a vendor and that source is mounted. Leave it unset
and the endpoint answers `404 unknown source`. There is no configuration in which an
unauthenticated caller can deliver an incident.

| Vendor | `sourceId` | Environment variable |
|---|---|---|
| Datadog | `datadog` | `SUPERVISOR_INTAKE_SECRET_DATADOG` |
| PagerDuty | `pagerduty` | `SUPERVISOR_INTAKE_SECRET_PAGERDUTY` |
| Prometheus Alertmanager | `prometheus-alertmanager` | `SUPERVISOR_INTAKE_SECRET_ALERTMANAGER` |
| Grafana Alerting | `grafana-alerting` | `SUPERVISOR_INTAKE_SECRET_GRAFANA` |
| AWS CloudWatch / EventBridge | `aws-cloudwatch-eventbridge` | `SUPERVISOR_INTAKE_SECRET_AWS` |
| Azure Monitor | `azure-monitor` | `SUPERVISOR_INTAKE_SECRET_AZURE` |
| Splunk | `splunk` | `SUPERVISOR_INTAKE_SECRET_SPLUNK` |
| Google Cloud Operations | `google-cloud-operations` | `SUPERVISOR_INTAKE_SECRET_GCP` |
| Anything else | `generic` | `SUPERVISOR_INTAKE_SECRET` |

Secrets must be at least 16 characters. That is checked when the deployment starts,
not when an alert arrives — discovering a weak secret during an incident is the worst
possible moment.

### Authentication

Every vendor adapter authenticates with a shared secret in a header:

```
x-supervisor-secret: <the value you set in the environment variable>
```

Comparison is constant time. The `generic` source is different — it uses an HMAC
signature and is documented in the incident intake guide.

### What the endpoint answers

| Code | Meaning | Should the sender retry? |
|---|---|---|
| 202 | Accepted | No — we have it |
| 200 | Duplicate, or not an incident (a recovery notice) | No |
| 207 | A batch with mixed outcomes; each is reported individually | No |
| 401 | Authentication failed | No — fix the secret |
| 400 | Malformed payload | No — fix the payload |
| 404 | No source mounted at that path | No — set the secret |

Only a 5xx invites a retry. A rejected payload is never one.

---

## 2. What every adapter reads

Each adapter is a field mapping and nothing more. It renames your vendor's fields into
the canonical incident; it does not normalise severity, deduplicate, or validate —
those happen once, identically, for every vendor.

Two fields matter more than the rest:

**Severity.** Pass your vendor's own value; the core maps it. `critical`, `error`,
`fatal`, `SEV-1`, `P1`, `high`, `urgent`, `firing` and `ALARM` all become **critical**.
`warning`, `minor`, `degraded`, `SEV-2`, `P3`, `medium` and `no data` become
**warning**. `info`, `notice`, `low`, `none`, `P5` and `SEV-4` become **info**. A word
the table does not know becomes **warning** rather than being rejected.

**Environment.** `prod`, `production` and `live` mean production. `staging`, `stage`,
`preview`, `test`, `qa` and `uat` mean preview. `sandbox`, `dev` and `local` mean
sandbox. **An alert with no environment is treated as production**, deliberately —
production is the stricter policy path, and assuming sandbox would quietly widen what
is allowed to run without approval.

Set an environment label on your alerts if you want anything other than production
handling.

---

## 3. Per-vendor field mapping

Fields are listed in the order the adapter tries them; the first present value wins.

### Datadog — `datadog`

| Canonical | Read from |
|---|---|
| message | `body`, then `title` |
| severity | `alert_type`, `priority`, `status` |
| environment | `environment`, `env` |
| detected at | `date` |
| affected resource | `host`, then the monitor id |
| dedupe key | `aggregation_key`, then `monitor_id` |

`aggregation_key` is what makes a repeating monitor collapse into one incident instead
of many. Include it.

### PagerDuty — `pagerduty`

| Canonical | Read from |
|---|---|
| message | `description`, then `title` |
| severity | `urgency`, then `priority` |
| environment | `environment` on the incident, then on the envelope |
| detected at | `occurred_at` |
| affected resource | the service id |
| dedupe key | `dedup_key`, `incident_key`, then the incident id |

An **acknowledged** incident is still an incident — a responder picked it up, the
problem has not gone away. Only `resolved` is ignored.

### Prometheus Alertmanager — `prometheus-alertmanager`
### Grafana Alerting — `grafana-alerting`

| Canonical | Read from |
|---|---|
| message | `annotations.description`, then `annotations.summary` |
| severity | `labels.severity`, then `labels.priority` |
| environment | `labels.environment`, `labels.env`, then `labels.namespace` |
| affected resource | `labels.instance`, `labels.pod`, `labels.service`, `labels.job` |
| dedupe key | the alert's `fingerprint`, else `alertname:instance` |

**Both batch.** One webhook carrying ten alerts becomes ten incidents, deduplicated
independently. A resolved alert sitting beside firing ones is skipped without
discarding its neighbours. Batches above 50 alerts are truncated and the truncation is
reported rather than silent.

### AWS CloudWatch / EventBridge — `aws-cloudwatch-eventbridge`

| Canonical | Read from |
|---|---|
| message | `detail.state.reason`, then the alarm name |
| severity | `detail.severity`, then `detail.state.value` |
| environment | `detail.environment` |
| detected at | `time` |
| affected resource | `detail.alarmArn`, then `alarmName` |
| dedupe key | `detail.alarmArn` |

`state.value` is always `ALARM` for a firing alarm, so it carries no severity
information. Add `detail.severity` through EventBridge input transformation if you want
alarms differentiated; without it, every alarm arrives critical.

An `OK` transition is ignored.

### Azure Monitor — `azure-monitor`

Use the **common alert schema**.

| Canonical | Read from |
|---|---|
| message | `essentials.description`, then `essentials.alertRule` |
| severity | `essentials.severity` (`Sev0`–`Sev4`) |
| environment | `essentials.environment` |
| detected at | `essentials.firedDateTime` |
| affected resource | the first entry of `essentials.alertTargetIDs` |
| dedupe key | `essentials.alertId` |

### Splunk — `splunk`

| Canonical | Read from |
|---|---|
| message | `result.message` |
| severity | `result.severity`, then `severity` on the envelope |
| environment | `result.environment`, `result.env`, then the envelope |
| detected at | `result._time` |
| affected resource | `result.host` |
| dedupe key | `search_name`, then `result.source` |

Dedupe is by saved search, so the same search firing repeatedly inside the window is
one incident.

### Google Cloud Operations — `google-cloud-operations`

| Canonical | Read from |
|---|---|
| message | `incident.summary` |
| severity | `incident.severity` |
| environment | `incident.environment`, then a resource label |
| detected at | `incident.started_at` |
| affected resource | `resource.display_name` |
| dedupe key | `incident.incident_id` |

A `closed` incident is ignored.

### Anything else — `generic`

If your tool is not listed, or is internal, post the canonical envelope directly. It
needs only two fields, and the payload and HMAC signing scheme are in the incident
intake guide. Several of the adapters above are thinner than that endpoint.

---

## 4. Adapter maturity

**Every vendor adapter currently ships as `staged`.** The mapping is proven against
recorded payload fixtures from that vendor and is deterministic, but it has not yet
been validated against live traffic from a real account of ours.

This is reported, never hidden: each source's status appears in the intake health
output and on every incident it produces.

An adapter moves to `certified` only after real provider validation, documented
configuration, successful staging ingestion, durable incident creation, and end-to-end
runtime evidence. It does not move because the code looks finished.

Practically: your first alert through a staged adapter is the first time that mapping
meets real traffic from your account. If a field arrives empty or a severity looks
wrong, send us the payload with secrets removed and the mapping is a small fix. Nothing
unsafe happens in the meantime — a badly mapped incident is still gated by the same
policy as a well-mapped one.

---

## 5. Verifying a connection

1. Set the environment variable and restart.
2. Trigger a test alert from the vendor.
3. Expect **202** with an incident id.
4. Check the incident: is the message readable, the severity right, the affected
   resource populated, the environment correct?
5. Trigger the same alert again. Expect **200 duplicate** — if you get a second 202,
   either the dedupe key is not being sent, or your host is starting a fresh process
   per request. Read the caveat below before treating it as a misconfiguration.

A **401** means the header or secret is wrong. A **404** means the environment variable
is not set in the running deployment. A **400** names which field was missing.

### Step 5 on a serverless host

Deduplication and the incident record store are supplied to the runtime by the host
adapter, and the default implementations hold their state in the memory of the process
that handles the request.

On a long-running host — a container, a VM, a pod — that is one process, and step 5
behaves exactly as written. On a platform that may start a fresh process per request
(serverless functions, or an autoscaler that has scaled to zero), the second request can
land on a process that never saw the first, and you get a second **202** even though your
dedupe key is correct. That is a property of where you are running it, not a fault in
your configuration.

If you need deduplication that holds across processes, either run the portable on a
long-running host, or have your host adapter supply implementations of `DedupeStore` and
`IncidentRecordStore` backed by your own datastore. Both are exported interfaces; the
in-memory versions are a default, not a constraint.

---

## 6. What this does not do

It does not poll your monitoring, hold credentials for it, or reach into it. The
connection is one-way: your tool posts, and this receives. If your monitoring is down,
this receives nothing and says nothing — it is not a monitoring system and does not
pretend to be one.
