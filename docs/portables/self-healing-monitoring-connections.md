<!-- docs/portables/self-healing-monitoring-connections.md -->

# Self-Healing Supervisor monitoring connections

**Updated:** 2026-08-12

The Self-Healing Supervisor now supports **native, hybrid, and external monitoring**. Native monitoring is intended to be enabled by default. Buyers that already operate a monitoring stack may supplement native observation or intentionally select external-only operation.

The previous statement that the Supervisor “does not watch your systems” is obsolete and must not be used in product, sales, evaluation, or engineering descriptions.

For the detailed current implementation and remaining gaps, read `self-healing-monitoring-current-state-20260812.md` in this directory.

## Native monitoring

Canonical policy: `saas/self-healing-host/native-monitoring-policy.ts`.

Runtime: `saas/self-healing-host/native-monitoring-runtime.ts`.

Production-integrated native observation currently includes the existing Vercel deployment/provider observer and SignalBoost platform-health intelligence. Monitoring is read-only observation; detected conditions continue through the existing diagnosis, policy, repair-capability, verification, audit, and learning paths.

## External monitoring adapters

The following real webhook adapters remain available for buyers that use them:

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

Vendor delivery endpoint:

```text
POST https://<your-deployment>/api/supervisor/intake/<sourceId>
```

A source is mounted only when its required secret/configuration exists. Existing adapter authentication, canonical incident mapping, severity/environment normalization, deduplication, durable intake, and downstream policy controls remain authoritative in code and tests.

All eight named vendor adapters remain `staged` until real-provider validation evidence promotes them to `certified`. Do not equate staged deterministic mappings with certified live integration.

## Operational model

```text
Native collectors and/or buyer monitoring
→ canonical observation / incident evidence
→ diagnosis and bounded reasoning
→ registered repair capability
→ policy / risk classification
→ routine + explicitly pre-authorized bounded action may execute automatically
→ consequential action requires approval
→ verification
→ audit
→ learning
```

Native monitoring does not authorize arbitrary mutation. Automatic routine repair remains bounded by the registered capability and execution contract.

## Remaining native probes

As of 2026-08-12, API latency/error-rate, database health, storage health, and TLS/certificate-expiry probes remain the next implementation batch. They are not complete merely because their signal names appear in policy.
