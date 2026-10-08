# Phase 5 launch observability (advisory-only)

Phase 5 is NOT CERTIFIED by merging CI or emitting a healthy-looking trace.
`labPhase5Observability.ts` wraps the existing signed two-to-three-partner
cohort verifier and passes metadata-only events to an injected trusted host sink.
This is not a deployed alerting service or a customer pilot.

## Host integration checklist

1. Invoke `observePhase5Cohort` from the authenticated, tenant-authorized private-pilot review workflow after the signed evidence bundle is retrieved. Do not call it in public unauthenticated routes. Pass the immutable deployed Git SHA, `source: 'private_pilot'`, and a trusted **tenant-local** durable sink.
2. Run `assessPhase5LaunchHealth` against events for that same SHA. An absent or stale observation, invalid cohort, or rejected review should surface as an alert, never as a launch pass. Route alert codes through the existing trusted supervisor/on-call incident sink after tenant/privacy validation.
3. Keep PRIVATE evidence and telemetry in the tenant boundary. Never forward the underlying manifest, document references, reviewer identities, partner IDs, secrets, or detailed per-tenant logs to global analytics. For any central view, implement an explicitly approved aggregated, k-anonymous roll-up first. Current module does **not** provide a cross-tenant dashboard.
4. Record separately: deployed SHA, tenant-local observation delivery acknowledgment, real pilot execution through the factory, external security and legal attestation, independent Phase 3/4 acceptance, owner launch decision. Do not infer these from synthetic green CI.
5. Exercise sink outage, missing evidence, expired observation, cross-revision rejection, rollback, and tenant-isolation scenarios on an actual private deployment before launch.

Alerts (per private tenant): `phase5_no_live_evidence`, `phase5_observation_stale`,
`phase5_evidence_blocked`, `phase5_partner_cohort_incomplete`.

The code deliberately grants no spend, deployment, certification, marketplace,
or Production authority. No scheduled collector, production wiring, or external
notification destination is configured by this PR.
