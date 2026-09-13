# Specialist Mesh Architecture

**Date:** 2026-09-13  
**Status:** final phase implementation in progress; evidence-gated  
**Scope:** COS/A2A specialists, operational continuity, and COS University continuing learning

## Objective

Replace fixed primary/backup specialist pairing with a capability-aware mesh.

Every specialist is an independent worker and a potential backup for every task for which that specialist is currently qualified, authorized, healthy, and cost-effective. COS does not manually choose a specialist when several are eligible. The mesh selects the closest suitable worker dynamically.

This borrows the resilience objective of a network mesh/ring without copying packet-routing mechanics literally. AI work should not hop serially from agent to agent. A durable work item is claimed directly by the best currently eligible worker.

## Meaning of "closest"

Closest is operational, not physical. A specialist is closer when it can satisfy the task with the best combination of:

1. exact authorization and verified skill qualification;
2. current availability and health;
3. current workload;
4. expected execution cost;
5. expected latency;
6. recent verified reliability and quality.

Qualification and authorization are hard gates, never score modifiers. Cost or speed can never make an unauthorized or unqualified specialist eligible.

## Cost and performance rule

The default policy is one worker per task. Specialists do not all reason about every task. Parallel execution is reserved for cases where it is explicitly useful, such as independent verification, decomposition, or recovery.

Routing should minimize **cost per verified completed task**, not merely model-call price. A cheap worker that repeatedly fails is more expensive than a slightly more expensive worker that finishes correctly.

Initial normalized routing weights:

- cost: 30%
- current load: 25%
- latency: 20%
- reliability penalty: 15%
- quality penalty: 10%

These weights are host policy, not learned authority. They may be tuned from Production evidence without changing permissions.

Live read-only routing signals may override stale static registry hints. Telemetry is advisory routing evidence only: it cannot grant a skill, scope, risk level, credential, or permission. If telemetry is unavailable, the router falls back to safe static evidence rather than widening eligibility.

## Operational mesh

```text
new durable task
      |
      v
exact scope / skill / risk authorization
      |
      v
eligible specialist set
      |
      v
rank by current mesh telemetry
      |
      v
best eligible worker claims lease
      |
      +---- success ----> verified completion
      |
      +---- unavailable / safe recoverable failure
                        |
                        v
               lease expires/releases
                        |
                        v
               next eligible worker
```

There is no permanent primary specialist and no permanent backup specialist.

A worker owns a task only while it holds a valid fenced lease. A stale worker must not be allowed to continue mutating task state after another worker has taken ownership.

The durable lifecycle follows the existing Supervisor state machine exactly:

`queued -> leased -> processing -> verification_pending -> completed`

Expired leases are reconciled back to available work before another eligible specialist acquires a newer fenced lease.

## Failover safety

Automatic failover is initially allowed only for advisory/read-only work where duplicate execution cannot create consequential side effects.

Write or consequential work must not be automatically replayed after an ambiguous timeout until that action has durable idempotency/reconciliation evidence. A timeout does not prove that the first external action failed.

Phase 5 implements the stricter write path: an exact host-controlled provider adapter derives the provider idempotency key for the logical operation and independently reconciles the provider after an ambiguous execution result. `not_applied` is the only outcome that permits another specialist to acquire a newer fence and replay the logical operation. `applied` completes the task without replay. `unknown`, missing provider evidence, adapter/store failure, or no matching provider contract blocks automatic takeover.

The existing Supervisor coordination lease/fencing primitives are reused rather than creating a second competing ownership system.

## Specialist independence

Mesh membership does not merge specialist identities, memories, credentials, degrees, or authority.

Each specialist retains:

- its own identity;
- its own University record;
- its own qualifications;
- its own runtime and Production evidence;
- only its explicitly assigned permissions.

Shared task evidence is bounded to what is necessary for the authorized task.

## University learning mesh

The same mesh principle applies to continuing education.

The University continuously measures capability coverage from configured Production specialist manifests plus fresh durable qualification evidence. The default host resilience target is two independently qualified **and authorized** agents per configured exact capability. If that target is not met, the gap is persisted and University cross-training is prioritized for a role-fit registered learner.

Coverage is education-only. A study plan does not create an A2A assignment or qualification. A learner who is already qualified but not authorized is recorded as an `authorization_gap` rather than being sent back to study, and the University never fills the missing assignment itself. If no role-fit learner exists, the gap is `unassigned` rather than force-fitting an unrelated identity.

Validated lessons may be shared across the cohort, but academic credit never transfers. Each specialist must independently study, pass fresh assessments, demonstrate transfer, retain the knowledge, and produce verified applied outcomes.

```text
Production manifests + fresh qualification evidence
                       |
                       v
                exact coverage map
                       |
          +------------+-------------+
          |                          |
      target met                  coverage gap
          |                          |
       covered               role-fit learner?
                                     |
                    +----------------+----------------+
                    |                                 |
               training needed                 already qualified,
                    |                          not authorized
                    v                                 |
           bounded University plan             authorization_gap
                    |
                    v
         independent study / exam /
          transfer / retention
                    |
                    v
       separate specialist qualification
                    |
                    v
       separate authorization if needed
```

A specialist failure can also create targeted remediation for that specialist and a generalized lesson for peers when evidence shows the lesson is transferable.

## Efficiency safeguards

- Do not run every specialist on every task.
- Do not maintain dedicated expensive inference capacity merely because a specialist identity exists.
- Prefer shared approved inference capacity when isolation requirements permit it.
- Load only task-relevant context and tools.
- Cache/reuse governed evidence where valid.
- Use bounded retries.
- Use health/load telemetry to avoid repeatedly selecting degraded workers.
- Admit at most one new coverage-driven study plan per hourly Production coverage cycle by default.
- Measure cost, latency, first-attempt success, failover frequency, recovery time, verified final quality, and qualification coverage.

## Implementation sequence

### Phase 1 — capability-aware routing

Remove the current ambiguous-multiple-specialist dead end for non-explicit routing. Rank authorized candidates using safe agent metadata and select the closest worker. Preserve explicit agent selection for governed cases that require it.

**Implemented on PR #2154.**

### Phase 2 — advisory failover

For advisory/read-only tasks only, try the next ranked eligible worker after a clearly recoverable runtime/unavailable failure. Record every attempted agent.

**Implemented on PR #2154.**

### Phase 3 — durable claim + fenced ownership

Integrate specialist work with the existing Supervisor durable work queue, leases, fencing tokens, heartbeat, and expired-lease reconciliation so another worker can continue after failure without stale ownership.

**Control-plane foundation landed through PR #2154 and real Production specialist delegation ownership was wired on PR #2181.** The mesh creates durable work, registers workers, enforces eligibility before lease acquisition, reconciles expired ownership, issues a newer fenced lease to another eligible worker, rejects the stale owner, and enforces `leased -> processing -> verification_pending -> completed` without changing A2A authority.

### Phase 4 — checkpoint/resume

Persist bounded task checkpoints so takeover continues useful progress instead of restarting expensive work unnecessarily.

**Implemented on PR #2194 for advisory/read-only work.** Checkpoints are service-role-only, bounded to 64 KiB JSON objects, expire within one hour, reject credential-shaped keys, and are loaded/saved/cleared only while the caller holds the current Supervisor fence. A cooperative advisory worker may yield with `signalboostMeshHandoff`; after the next independently eligible specialist acquires a newer fence, the host may deliver the prior bounded state as authority-free `signalboostMeshResume` metadata. Checkpoint state never grants qualification, scope, approval, credentials, or tool authority.

### Phase 5 — idempotent write recovery

Add provider-specific idempotency and reconciliation contracts before enabling automatic failover for write/consequential operations.

**Merged on PR #2233 and accepted in SignalBoost Production on 2026-09-13.** The host requires an exact provider adapter before a non-advisory task enters automatic mesh recovery. The adapter deterministically derives the provider idempotency key, the runtime transports that authority-free key to the specialist, and a fenced Supabase ledger records the prepared attempt plus provider reconciliation evidence. Production acceptance proved all three required outcomes against the isolated SignalBoost reference provider: `applied` completed without replay, `not_applied` permitted a newer-fence takeover, and `unknown` failed closed. This acceptance does not make arbitrary third-party providers replay-safe; each external provider still requires its own accepted adapter and real reconciliation evidence.

### Phase 6 — University coverage mesh

Build a qualification coverage map and automatically prioritize cross-training where critical capabilities have insufficient independent coverage.

**Implemented on PR #2235 branch `feat/specialist-mesh-phase6-university-coverage-20260913`; merge/migration/deployment/Production cycle evidence remain pending.** The host derives exact capabilities from validated configured Production manifests, uses the existing newest-exact-scope Production qualification adapter, persists service-role coverage state, selects only role-fit registered University identities, and admits at most one deterministic `operational_weakness` study plan per cycle. Training evidence explicitly records that no runtime authority, specialist qualification, or academic credit was granted by admission.

## Current implementation evidence — 2026-09-13

Cumulative Specialist Mesh implementation now includes:

- deterministic ranking of multiple already-authorized specialists;
- injectable live availability/cost/load/latency/reliability/quality signals;
- safe fallback to static routing evidence if telemetry is unavailable;
- advisory-only automatic failover to the next ranked eligible worker;
- explicit governed agent selection when an exact specialist is requested;
- durable mesh work items on the existing Supervisor coordination plane;
- eligibility checks before task claim;
- fenced Production execution ownership and expired-owner reconciliation;
- stale-owner rejection after another specialist takes over;
- bounded advisory checkpoint persistence and cooperative checkpoint handoff;
- newer-fence-only resume delivery to the replacement specialist;
- host-controlled provider-specific idempotency/reconciliation contracts for write/consequential recovery;
- a fenced, RPC-only durable side-effect reconciliation ledger;
- recovered completion when provider evidence proves an ambiguous write was already applied;
- automatic non-advisory takeover only when provider evidence proves the prior write was not applied;
- fail-closed handling for unknown or unavailable provider outcomes;
- no automatic write takeover when an exact provider recovery contract is absent;
- exact-scope Production capability coverage derived from configured specialist manifests;
- newest-fresh qualification counting by independent agent identity;
- durable `covered`, `training_priority`, `authorization_gap`, and `unassigned` coverage states;
- role-fit bounded cross-training admission through existing University study plans;
- explicit separation between education, specialist qualification, and runtime authorization;
- hourly Production coverage execution with metadata-only Supervisor audit receipts;
- tests for routing, live-signal override/fallback, lease conflict, failover, fencing, lifecycle transitions, checkpoint handoff/resume, resume metadata transport, write idempotency metadata, provider reconciliation, ambiguous-outcome blocking, coverage counting, candidate selection, and authorization-gap separation.

These mechanics are not buyer-live proof by themselves. The live acceptance distinction remains strict: genuine buyer/Production failover requires real independently qualified buyer specialists, real deployed transports, a real provider recovery adapter where applicable, and observed governed takeover evidence. University coverage may expose buyer capability gaps without claiming those gaps are already closed.

## Acceptance targets

The mesh is not considered complete because routing code exists. Production evidence should prove:

- two or more independently qualified specialists can compete for the same authorized advisory task;
- only one executes normally;
- routing prefers the better cost/performance candidate from current telemetry;
- failure of that worker causes a safe next-worker takeover;
- stale ownership cannot complete the task;
- no authority is widened during takeover;
- final work remains attributable to the worker(s) that actually performed it;
- for write/consequential recovery, the provider idempotency key is propagated and the first ambiguous outcome is reconciled before any takeover;
- `not_applied` provider proof permits one newer-fence takeover while `applied` prevents replay and `unknown` blocks it;
- durable reconciliation evidence survives process failure and is scoped to the exact work item/fence;
- University credit remains agent-specific;
- configured capabilities receive an exact durable coverage state based on fresh qualification evidence;
- a single-worker coverage gap produces a bounded role-fit education priority without creating authority;
- qualified-but-unauthorized candidates remain authorization gaps rather than being silently assigned;
- the deployed hourly coverage lane records a successful Production cycle bound to the current Production commit;
- operational capability coverage can increase over time as independently trained agents later pass the separate qualification and authorization gates.

Phase 6 Production acceptance requires the migration, merged deployment, and a successful `specialist_mesh_university_coverage_cycle` audit receipt for the exact Production commit with `authorityExpanded=false`, `qualificationGranted=false`, and `credentialGranted=false`. The receipt proves the deployed coverage lane operates; it does not claim every buyer capability is already redundantly staffed.