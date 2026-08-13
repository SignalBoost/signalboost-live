# Self-Healing Supervisor monitoring and autonomous loop — current state

**Updated:** 2026-08-13

Read `ONBOARD.md` and `docs/HANDOFF-2026-08-13.md` first. This file is the subsystem-specific takeover for native monitoring and governed remediation.

## Executive status

The Self-Healing Supervisor is not limited to reacting to externally supplied incidents.

Two separate claims now have different evidence levels and must not be conflated:

1. **Native proactive monitoring:** implemented, merged, and production-runtime-verified.
2. **Native anomaly → COS diagnosis → governed Agent Gateway/MCP remediation loop:** implemented, merged in PR #1159, and production-deployed; a controlled real anomalous production acceptance run should still be performed before claiming repeated end-to-end remediation runtime evidence.

PR #1159 adds no new mutation authority. It connects detection to existing bounded evidence/diagnosis/governance machinery.

## Monitoring architecture

Native monitoring is a first-class host capability.

Canonical policy/runtime:

- `saas/self-healing-host/native-monitoring-policy.ts`
- `saas/self-healing-host/native-monitoring-runtime.ts`
- `saas/self-healing-host/native-proactive-monitoring.ts`
- `saas/app/api/cron/native-proactive-monitoring/route.ts`

The native monitoring portion is observation-first. Collectors detect conditions and create evidence/incidents through the Supervisor observation contract. Observation itself does not create arbitrary mutation authority.

## Native production-code sources

Native sources include:

- Vercel deployment/provider health through the existing Vercel observer;
- SignalBoost platform-health intelligence, including queue growth, scheduler failures, provider failures, resource pressure, stale leases/heartbeats, verification failures, audit failures and related platform-health conditions;
- API probes for p95 latency, 5xx/network error rate and durable latency-regression baselines;
- database probes for live RPC latency, connection pressure, active queries and longest active query duration;
- storage probes for live Storage API reachability, bytes used, object/bucket counts and capacity pressure when a real quota is configured;
- TLS certificate probes using validated TLS handshakes and real peer-certificate expiry dates.

Probe samples are persisted in `self_healing_native_probe_samples` so trend/regression logic can use durable history rather than a one-shot comparison.

## Monitoring modes

The runtime supports:

- `native` — built-in monitoring active;
- `hybrid` — built-in monitoring plus buyer monitoring;
- `external` — buyer intentionally disables native monitoring and supplies its own monitoring path.

Native monitoring is intended to be default-capable so a buyer can install the product ready to observe an environment. A buyer may supplement or replace it intentionally.

## External monitoring integrations

The repository contains deterministic webhook adapters for:

- Datadog;
- PagerDuty;
- AWS CloudWatch/EventBridge;
- Prometheus Alertmanager;
- Splunk;
- Azure Monitor;
- Grafana Alerting;
- Google Cloud Operations.

These remain `staged` until validated against live provider traffic. Do not call them certified merely because the adapter code exists.

External monitoring is complementary, not mandatory for the product to observe its environment.

## Native proactive monitoring production verification

Native proactive monitoring was production-runtime-verified before PR #1159.

Verified evidence included:

- PR #1132 merged to `main` at `4e91da9a1f380e94a8c8476d860a770552c914db`;
- production deployment `dpl_CUpwkAmcqEYu87pV3wQxEroYd6Cq` reached `READY` for that merge;
- `GET https://saas.signalboostapp.com/api/supervisor/native-health` returned HTTP 200;
- `saas/supabase/migrations/20260812_self_healing_native_proactive_monitoring.sql` was applied to production;
- service-role aggregate database/storage RPCs executed successfully;
- Vercel runtime logs recorded `/api/cron/native-proactive-monitoring` returning HTTP 200;
- production persisted repeated samples for all four proactive probe families (`api`, `database`, `storage`, `certificate`), proving scheduled persistence rather than a one-shot check.

Treat this as dated verified evidence. Re-verify after material collector/schema/routing changes.

## The gap that PR #1159 closed

Before PR #1159, native proactive monitoring could detect anomalies and return incidents, but the native cron path could stop at the HTTP response instead of routing those incidents into the same investigation/diagnosis/governed remediation path expected of the product.

PR #1159 was created specifically to close that gap.

PR details:

- PR: #1159 — `Close native Self-Healing loop through COS and governed remediation`;
- merge commit: `aadb940d9074c9ed19c7913b5cbea83eae37811e`;
- production deployment observed after merge: `dpl_73ZDsH3KXKf4g1YiGYPJLNXJu45U` — `READY`;
- changed scope: native incident routing, bounded connector evidence, COS-first diagnosis, existing Agent Gateway/MCP governance, SignalBoost host connector boundary, regression coverage.

## Current native autonomous loop

Canonical implementation:

`saas/self-healing-host/native-autonomous-loop.ts`

Operational flow:

```text
Native probe / monitor
→ detect anomaly / incident
→ gather bounded live evidence through Portable Connector Runtime
→ compact evidence
→ normalize Supervisor incident
→ COS-first diagnosis
→ produce repair plan, if any
→ resolve only registered repair action/params
→ dispatch through existing Agent Gateway policy/governance
→ execute if already permitted
   OR stage / require approval / fail closed
→ verify/audit through the existing governed path
```

The native loop uses:

- `executeCosConnectorRecipe(...)` for bounded connector evidence;
- `compactDelegatedEvidence(...)` for evidence compaction;
- `NATIVE_PLATFORM_INCIDENT_RECIPE` for incident-aware evidence collection;
- `diagnoseIncident(...)` for diagnosis;
- `dispatchRepairPlan(...)` through Agent Gateway governance;
- existing action/parameter resolution rather than arbitrary provider mutation.

## Native cron behavior after PR #1159

`saas/app/api/cron/native-proactive-monitoring/route.ts` now:

1. verifies `CRON_SECRET` authorization;
2. verifies the native probe store/schema and fails closed if absent;
3. runs the real native collectors;
4. returns healthy monitoring results cheaply when no incidents exist;
5. only when incidents exist, invokes `remediateNativeIncidents(...)` with a bounded incident count;
6. returns the remediation outcome alongside incidents/collector results.

The route has a larger max duration specifically because anomaly runs may perform COS diagnosis and governed remediation. Healthy runs remain cheap.

## Safety/governance boundary

PR #1159 does **not** widen the action allowlist.

Automatic execution is permitted only when the repair maps to an existing registered capability and the existing governance policy allows it.

Unknown/consequential/destructive/financial/credential/security actions remain approval-gated or fail closed.

Correct doctrine:

```text
routine + explicitly pre-authorized + bounded + registered + reversible
→ may execute automatically

consequential / destructive / financial / security / unregistered
→ approval required or fail closed
```

Do not weaken those boundaries merely to demonstrate autonomy.

## COS role

COS is the primary diagnostic thinker in this loop. External models remain fallback/teacher resources when COS cannot clear its confidence/evidence requirements.

The Self-Healing product should not be described as "an external model diagnoses and fixes things." The buyer may use Qwen, OpenAI, Anthropic, Gemini or another compatible model/agent under the BYOM/BYOA architecture. COS owns the reasoning workflow, knowledge, procedural skills, governance and audit semantics.

## Portable Connector Runtime / MCP relationship

The same architectural boundary used for buyer connectors is used by SignalBoost's own hosted Self-Healing runtime:

- tenant/environment/portable/trace identity is carried into connector execution;
- evidence is read through bounded capabilities;
- credentials/OAuth remain outside the portable intelligence layer;
- diagnosis consumes compact bounded evidence;
- repair execution goes through the existing Agent Gateway/MCP governance path.

This is important commercially: the hosted development deployment is exercising the same permissioned connector/governance design intended for buyer environments rather than a one-off privileged SignalBoost-only shortcut.

## What is production-proven versus still needing acceptance

### Production-proven

- native monitoring exists and runs on schedule;
- API/database/storage/TLS probe families persist real samples;
- native-health route is live;
- required proactive-monitoring migration/RPCs exist;
- PR #1159 code is merged and its production deployment reached `READY`;
- the native cron now calls the autonomous loop only for incidents;
- the autonomous loop is bounded and uses existing connector/COS/Agent Gateway governance code;
- regression coverage exists for native incident normalization/evidence propagation.

### Still needs a controlled live acceptance run

A future agent should intentionally create or safely reproduce a non-destructive anomaly and prove in production telemetry:

```text
anomaly observed
→ incident created
→ connector evidence gathered
→ COS diagnosis produced
→ repair plan selected or no-safe-action decision made
→ Agent Gateway policy evaluated
→ action executed if pre-authorized OR staged/approval-required if not
→ verification/audit record visible
```

Do not create a destructive outage just to get this evidence. Prefer a safe synthetic/testable condition or a bounded staging/preview acceptance where possible, then repeat the non-destructive path in production if required.

## Fail-closed behavior

Preserve:

- `CRON_SECRET` authorization;
- `native_probe_store_unavailable` failure when required schema is missing;
- target validation/bounds;
- bounded incident count;
- registered action resolution;
- Agent Gateway policy enforcement;
- approval requirements;
- audit/verification semantics.

Monitoring success must never become implicit mutation authority.

## Optional deployment configuration

- `SELF_HEALING_API_PROBE_URLS` — comma-separated live HTTPS API targets; defaults to the platform native-health endpoint.
- `SELF_HEALING_TLS_TARGETS` — comma-separated `host[:port]` TLS targets; API-target hosts are included automatically.
- `SELF_HEALING_STORAGE_QUOTA_BYTES` — real storage quota used to calculate capacity percentage. If absent, report real usage without inventing capacity percentage.
- `SELF_HEALING_NATIVE_MONITORING_ENABLED=false` — intentional buyer opt-out.
- `SELF_HEALING_EXTERNAL_MONITORING_CONNECTED=true` — signals coexistence with buyer/external monitoring.

## Primary files for the next agent

Monitoring:

- `saas/self-healing-host/native-monitoring-policy.ts`
- `saas/self-healing-host/native-monitoring-runtime.ts`
- `saas/self-healing-host/native-proactive-monitoring.ts`
- `saas/app/api/cron/native-proactive-monitoring/route.ts`
- `saas/app/api/supervisor/native-health/route.ts`

Autonomous loop:

- `saas/self-healing-host/native-autonomous-loop.ts`
- `saas/self-healing-host/signalboost-supervisor-connectors.ts`
- `saas/self-healing-host/signalboost-host-context.ts`
- `saas/lib/ai/cos/incidentRecipeRouter.ts`
- `saas/lib/autonomous-supervisor/diagnostic.ts`
- `saas/lib/autonomous-supervisor/types.ts`
- `saas/tests/nativeAutonomousLoop.node.test.ts`

Governed execution:

- Agent Gateway host/policy files under `saas/agent-gateway-host/`;
- Supervisor repair/action mapping files used by `dispatchRepairPlan(...)`;
- Portable Connector Runtime / COS connector-delegation layers.

## Next-agent checklist

1. Scan current `main` before making changes.
2. Treat proactive monitoring itself as production-runtime-verified unless later changes invalidate the evidence.
3. Treat PR #1159 anomaly-to-governed-remediation wiring as merged/production-deployed, but obtain a controlled real anomaly acceptance trace before claiming full repeated runtime remediation verification.
4. Do not add duplicate collectors or vendor adapters that already exist.
5. Do not widen mutation authority to make a demo pass.
6. Verify COS provenance/diagnosis source during the acceptance run.
7. Verify Agent Gateway/MCP policy outcome separately from COS diagnosis quality.
8. Verify action result and post-action state; "dispatch attempted" is not "repair succeeded."
9. Preserve buyer-hosted/BYOM/BYOA connector and credential boundaries.
10. Update this handoff if the acceptance evidence changes the status.

## Status language

Correct statements:

- "Native proactive monitoring is production-runtime-verified."
- "The native incident-to-COS-to-governed-remediation loop is merged and production-deployed."
- "Consequential actions remain approval-gated."

Do **not** say "Self-Healing automatically fixes everything" or "100% autonomous remediation". The system is deliberately governed, bounded and fail-closed.
