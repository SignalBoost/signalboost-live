# Self-Healing Supervisor monitoring — current state

**Updated:** 2026-08-12

## Current implementation

The Self-Healing Supervisor is not limited to reacting to externally supplied incidents.

Native monitoring is now a first-class host capability. The canonical policy is `saas/self-healing-host/native-monitoring-policy.ts`; the runtime is `saas/self-healing-host/native-monitoring-runtime.ts`.

The native runtime is observation-only: collectors detect conditions and create evidence/incidents through the Supervisor observation contract. Monitoring itself does not bypass the existing diagnosis, policy, execution, verification, audit, or approval boundaries.

Production-code native sources include:

- Vercel deployment/provider health through the existing Vercel observer.
- SignalBoost platform-health intelligence, including queue growth, scheduler failures, provider failures, resource pressure, stale leases/heartbeats, verification failures, audit failures, and related platform-health conditions.
- Native proactive API probes for p95 latency, 5xx/network error rate, and durable latency-regression baselines.
- Native database health probes for live RPC latency, connection pressure, active queries, and longest active query duration.
- Native storage health probes for live Storage API reachability, bytes used, object/bucket counts, and capacity pressure when a real quota is configured.
- Native TLS certificate probes using validated TLS handshakes and real peer-certificate expiry dates.

The proactive collectors are implemented in `saas/self-healing-host/native-proactive-monitoring.ts` and run through `/api/cron/native-proactive-monitoring` on the registered 15-minute schedule. `/api/supervisor/native-health` is the default live API liveness target. Probe samples are persisted in `self_healing_native_probe_samples` so API latency regressions use durable history rather than a one-shot comparison.

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

## Native proactive probe deployment state

PR #1132 is merged into `main` at `4e91da9a1f380e94a8c8476d860a770552c914db`. The exact reconciled branch head passed the Vercel production build/typecheck gate before merge. The four previously missing native probe families therefore exist in current application code; no production probe uses placeholders or mocks.

Production runtime verification is complete as of 2026-08-12 local / 2026-08-13 UTC:

- Vercel production deployment `dpl_CUpwkAmcqEYu87pV3wQxEroYd6Cq` reached `READY` on merge commit `4e91da9a1f380e94a8c8476d860a770552c914db`, with `saas.signalboostapp.com` attached to that exact deployment.
- `GET https://saas.signalboostapp.com/api/supervisor/native-health` returned HTTP 200 with the expected no-store JSON health payload.
- `saas/supabase/migrations/20260812_self_healing_native_proactive_monitoring.sql` was applied successfully to the production Supabase project and both service-role aggregate RPCs were executed successfully.
- Vercel runtime logs show `/api/cron/native-proactive-monitoring` returning HTTP 200 in production at 2026-08-13 02:30:09 UTC.
- The production sample table contains three persisted samples for each of the four probe families (`api`, `database`, `storage`, `certificate`) from 02:30 through 03:00 UTC, proving repeated scheduled persistence rather than a one-shot check.
- Latest observed probe states at verification time were healthy across all four families. The live API probe recorded 0% request errors, the database probe reported bounded connection-pressure telemetry, the storage probe reported real object/bucket/usage telemetry, and the certificate probe reported a valid live peer certificate with expiry remaining.

The application route still fails closed with `native_probe_store_unavailable` if the required schema is missing in another deployment target. That is intentional and should be preserved.

Optional deployment configuration:

- `SELF_HEALING_API_PROBE_URLS` — comma-separated live HTTPS API targets. Defaults to the platform native-health endpoint.
- `SELF_HEALING_TLS_TARGETS` — comma-separated `host[:port]` TLS targets; API-target hosts are included automatically.
- `SELF_HEALING_STORAGE_QUOTA_BYTES` — real storage quota used to calculate capacity percentage. If absent, the storage probe reports real usage without inventing a capacity percentage.
- `SELF_HEALING_NATIVE_MONITORING_ENABLED=false` — intentional buyer opt-out from native monitoring.

## Status

The broader project was assessed at approximately 98% complete on 2026-08-12. This is an engineering progress estimate, not enterprise Release Candidate acceptance. Green Vercel deployment alone is not sufficient RC evidence. Native proactive monitoring itself is now production-runtime-verified; remaining project work is elsewhere in the broader release-evidence and COS quality backlog.

## Handoff rule

Before continuing this work, inspect current `main`, the native monitoring policy/runtime, proactive collectors, platform-health adapter, existing Vercel observer, monitoring adapter registry, current tests, and live production state. Do not recreate collectors or vendor adapters that already exist, and do not add placeholders merely to increase adapter count. Treat the production verification above as dated evidence, not a substitute for re-checking live state after future monitoring changes.
