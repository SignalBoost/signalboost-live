# Specialist Mesh Architecture

**Date:** 2026-09-12  
**Status:** accepted direction; implementation progressive and evidence-gated  
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

The University should continuously measure capability coverage. If only one specialist is qualified for an operationally important capability, that is a resilience gap and the University should prioritize cross-training another suitable specialist.

Validated lessons may be shared across the cohort, but academic credit never transfers. Each specialist must independently study, pass fresh assessments, demonstrate transfer, retain the knowledge, and produce verified applied outcomes.

```text
Production work -> capability evidence -> coverage map
                                  |
                 single-worker capability detected
                                  |
                                  v
                    University cross-training
                                  |
                                  v
                     independent qualification
                                  |
                                  v
                      stronger operational mesh
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
- Measure cost, latency, first-attempt success, failover frequency, recovery time, and verified final quality.

## Implementation sequence

### Phase 1 — capability-aware routing

Remove the current ambiguous-multiple-specialist dead end for non-explicit routing. Rank authorized candidates using safe agent metadata and select the closest worker. Preserve explicit agent selection for governed cases that require it.

**Implemented on PR #2154.**

### Phase 2 — advisory failover

For advisory/read-only tasks only, try the next ranked eligible worker after a clearly recoverable runtime/unavailable failure. Record every attempted agent.

**Implemented on PR #2154.**

### Phase 3 — durable claim + fenced ownership

Integrate specialist work with the existing Supervisor durable work queue, leases, fencing tokens, heartbeat, and expired-lease reconciliation so another worker can continue after failure without stale ownership.

**Control-plane implementation present on PR #2154.** The mesh can create durable work, register workers, enforce eligibility before lease acquisition, reconcile expired ownership, issue a newer fenced lease to another eligible worker, reject the stale owner, and enforce `leased -> processing -> verification_pending -> completed`. End-to-end A2A execution wiring and Production evidence are still pending.

### Phase 4 — checkpoint/resume

Persist bounded task checkpoints so takeover continues useful progress instead of restarting expensive work unnecessarily.

**Pending.**

### Phase 5 — idempotent write recovery

Add provider-specific idempotency and reconciliation contracts before enabling automatic failover for write/consequential operations.

**Pending; automatic write/consequential takeover remains disabled.**

### Phase 6 — University coverage mesh

Build a qualification coverage map and automatically prioritize cross-training where critical capabilities have insufficient independent coverage.

**Documented direction; implementation pending.**

## Current implementation evidence — 2026-09-12

PR #2154 currently includes:

- deterministic ranking of multiple already-authorized specialists;
- injectable live availability/cost/load/latency/reliability/quality signals;
- safe fallback to static routing evidence if telemetry is unavailable;
- advisory-only automatic failover to the next ranked eligible worker;
- explicit governed agent selection when an exact specialist is requested;
- durable mesh work items on the existing Supervisor coordination plane;
- eligibility checks before task claim;
- fenced lease ownership and expired-owner reconciliation;
- stale-owner rejection after another specialist takes over;
- tests for routing, live-signal override/fallback, lease conflict, failover, fencing, and lifecycle transitions.

The live-signal interface is not yet itself a Production telemetry adapter, and the durable ownership helper is not yet wired through every A2A execution path. Those distinctions must remain explicit until live acceptance proves them.

## Acceptance targets

The mesh is not considered complete because routing code exists. Production evidence should prove:

- two or more independently qualified specialists can compete for the same authorized advisory task;
- only one executes normally;
- routing prefers the better cost/performance candidate from current telemetry;
- failure of that worker causes a safe next-worker takeover;
- stale ownership cannot complete the task;
- no authority is widened during takeover;
- final work remains attributable to the worker(s) that actually performed it;
- University credit remains agent-specific;
- operational capability coverage increases over time.

The first live acceptance should deliberately interrupt an advisory task after ownership is established, prove a second independently eligible specialist acquires the newer fenced lease, prove the first worker is rejected as stale, and finish with one verified completion and no duplicated side effect.
