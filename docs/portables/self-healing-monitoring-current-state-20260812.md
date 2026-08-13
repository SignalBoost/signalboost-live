# Self-Healing Supervisor monitoring — current state

**Updated:** 2026-08-12

## Current implementation

The Self-Healing Supervisor is not limited to reacting to externally supplied incidents.

Native monitoring is now a first-class host capability. The canonical policy is `saas/self-healing-host/native-monitoring-policy.ts`; the runtime is `saas/self-healing-host/native-monitoring-runtime.ts`.

The native runtime is observation-only: collectors detect conditions and create evidence/incidents through the Supervisor observation contract. Monitoring itself does not bypass the existing diagnosis, policy, execution, verification, audit, or approval boundaries.

Production-integrated native sources currently include:

- Vercel deployment/provider health through the existing Vercel observer.
- SignalBoost platform-health intelligence, including queue growth, scheduler failures, provider failures, resource pressure, stale leases/heartbeats, verification failures, audit failures, and related platform-health conditions.

The runtime supports three modes:

- `native` — built-in monitoring is active.
- `hybrid` — built-in monitoring remains active alongside buyer monitoring.
- `external` — buyer intentionally disables native monitoring and supplies its own monitoring path.

Native monitoring is intended to be enabled by default so the product can be installed ready to observe an environment. A buyer may instead use or supplement it with an existing monitoring estate.

## External monitoring integrations

The repository also contains real webhook adapters for Datadog, PagerDuty, AWS CloudWatch/EventBridge, Prometheus Alertmanager, Splunk, Azure Monitor, Grafana Alerting, and Google Cloud Operations. These are deterministic mappings with authentication boundaries and tests. Their current maturity remains `staged` until validated against live provider traffic; do not describe them as certified before that evidence exists.

External monitoring is complementary. It is no longer correct to describe the Supervisor as categorically dependent on an outside monitoring system.

## Remediation behavior

The intended operational loop is:

```text
Monitor / Observe
→ detect degradation, risk, or incident
→ collect bounded evidence
→ diagnose / reason
→ select a registered repair capability
→ policy and risk classification
→ routine + explicitly pre-authorized bounded action: may execute automatically
→ consequential / destructive / financial / credential-security action: approval required
→ verify result
→ audit
→ learn / improve future diagnosis and repair
```

Automatic execution is not permission to run arbitrary provider mutations. Routine repair still requires an explicitly registered capability, allowed resource/method/parameter scope, reversibility and execution limits under the existing Supervisor safety contract.

## Remaining native monitoring gap

The next native-monitoring batch should implement and connect real probes/collectors for:

- API latency and 5xx/error-rate trends;
- database latency/error/connection pressure;
- storage capacity/error health;
- TLS/certificate expiry.

A branch named `feat/native-proactive-monitors-20260812` was created for this work, but the attempted repository write was blocked by the connector safety gate. Therefore these four probes must be treated as **not implemented yet**, not as completed work.

## Status

The broader project was assessed at approximately 98% complete on 2026-08-12. This is an engineering progress estimate, not enterprise Release Candidate acceptance. Green Vercel deployment alone is not sufficient RC evidence.

## Handoff rule

Before continuing this work, inspect current `main`, the native monitoring policy/runtime, platform-health adapter, existing Vercel observer, monitoring adapter registry, and current tests. Do not recreate collectors or vendor adapters that already exist, and do not add placeholders merely to increase adapter count.
