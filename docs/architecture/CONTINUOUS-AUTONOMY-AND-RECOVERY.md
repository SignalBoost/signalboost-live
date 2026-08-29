# Continuous Autonomy and Recovery Doctrine

Status: Mandatory architecture requirement

Related baseline: `docs/architecture/SIGNALBOOST-ARCHITECTURE-1.0.md`

Related roadmap: `docs/architecture/PORTABLE-SPECIALIST-AGENT-ROADMAP.md`

## 1. Purpose

SignalBoost must remain available and continue safe operations without routine human intervention. Ordinary infrastructure, process, network, provider, adapter, or deployment failures must trigger autonomous containment, failover, reconciliation, and recovery rather than a platform-wide stop.

Fail-closed behavior remains mandatory, but it applies at the narrowest unsafe action boundary. A failed or uncertain action must not unnecessarily take down healthy platform capabilities.

## 2. Non-negotiable operating objective

The default response to an ordinary technical failure is:

```text
Detect failure
      │
      ▼
Contain the affected component or action
      │
      ▼
Transfer ownership or select a healthy replica/provider
      │
      ▼
Reconcile durable state
      │
      ▼
Resume safe operations automatically
```

The default response must not be:

```text
Failure → stop the entire platform → wait for a human
```

SignalBoost must remain online in autonomous or degraded mode whenever a safe operating path exists.

## 3. Operating states

### 3.1 Autonomous mode

The platform performs normal operations and repairs routine failures automatically.

Examples include:

- process or container crashes;
- unhealthy service instances;
- lost ownership leases;
- temporary network or database interruptions;
- exhausted or overloaded workers;
- provider timeouts;
- failed deployment instances;
- unavailable noncritical protocol adapters;
- stale owners or abandoned work;
- recoverable queue or scheduler failures.

Permitted autonomous responses include:

- restart;
- reschedule;
- fail over;
- reassign ownership;
- retry safe or proven-idempotent work;
- switch to a reviewed healthy provider or replica;
- reconcile interrupted work;
- isolate a failed component;
- roll back a bounded change;
- continue at reduced capacity.

### 3.2 Degraded mode

The platform remains available while affected capabilities are isolated or reduced.

In degraded mode:

- healthy services continue operating;
- only the affected adapter, provider, region, queue, or capability is restricted;
- read-only diagnostics, recovery controllers, audit, and unaffected workflows remain online;
- the system continues attempting autonomous recovery;
- degraded status is explicit, observable, and auditable.

A single adapter, provider, region, model, browser runtime, or protocol failure must not become a platform-wide outage unless no safe operating path remains.

### 3.3 Protected action halt

Only the specific hazardous or uncertain action is halted. The rest of the platform remains operational.

Protected action halt is required when automatic continuation could create:

- risk to life, health, or physical safety;
- material financial harm;
- irreversible data, infrastructure, equipment, or provider damage;
- legal, regulatory, sanctions, or compliance exposure;
- credential theft, security compromise, or cross-tenant exposure;
- uncertain completion of a consequential external mutation;
- duplicate financial, physical, or otherwise irreversible execution;
- corrupted policy, approval, authorization, or governance state.

Human review is reserved for these exceptional boundaries. Routine operational failures do not require human intervention.

## 4. Scope of fail-closed behavior

Fail-closed remains a core safety principle, but it must be scoped correctly.

The platform must fail closed for:

- the unsafe or unclassified action;
- the affected tenant or environment when isolation cannot be proven;
- the specific adapter or provider whose state is uncertain;
- the exact authorization whose freshness or integrity is invalid;
- the individual physical or financial operation that cannot be reconciled safely.

The platform must not fail closed globally when independent healthy operations can continue safely.

## 5. Required continuity architecture

The COS and Universal Agent Gateway must be deployable as self-healing control-plane services.

Required capabilities include:

1. Multiple independently schedulable replicas.
2. Health and readiness probes.
3. Health-based traffic routing.
4. Durable governed-request and decision journals.
5. Stable idempotency keys for every governed action.
6. Ownership leases with expiration.
7. Fencing tokens preventing stale owners from acting.
8. Durable approval, authorization, and revocation state independent of a process instance.
9. Automatic restart and rescheduling.
10. Startup and periodic reconciliation.
11. Provider- and adapter-specific circuit breakers.
12. Bounded retries restricted to safe or proven-idempotent operations.
13. Dead-letter isolation that does not block unrelated work.
14. Multi-zone deployment support.
15. Replicated audit and evidence storage.
16. Backup restoration validation.
17. Explicit autonomous, degraded, unavailable, and protected-halt diagnostics.

## 6. COS continuity requirements

The COS must not depend on one in-memory process for authoritative governance state.

COS continuity requires:

- replicated service instances;
- durable policy, approval, revocation, and authorization records;
- deterministic decision reconstruction;
- leader or ownership coordination where exclusive work is required;
- fencing against stale decision owners;
- resumable queues and bounded work claims;
- automatic invalidation of approvals when policy, scope, identity, or evidence changes;
- no direct executor bypass during COS failover.

If one COS instance fails, another healthy instance must be able to reconstruct the governed state and continue safe work without weakening approval or audit boundaries.

## 7. Universal Agent Gateway continuity requirements

The Gateway must remain available across ordinary replica, adapter, and provider failures.

Gateway continuity requires:

- stateless request admission where practical;
- durable normalized request records before consequential execution;
- stable request identities across retries and failover;
- adapter health isolation;
- protocol-specific result envelopes that accurately report pending, rejected, degraded, or reconciled outcomes;
- replacement-owner verification before resuming work;
- provider-state verification before repeating an uncertain mutation;
- no COS or client bypass when the Gateway is unavailable;
- local hard safety remaining on robot controllers, autopilots, PLCs, and certified safety systems.

## 8. Recovery rules by failure point

### 8.1 Failure before durable acceptance

The caller may retry through a healthy replica using the same idempotency key.

### 8.2 Failure after durable acceptance but before execution

A replacement owner may claim the request after the prior lease expires, validate the fencing token, reconstruct governance state, and resume safely.

### 8.3 Failure during a consequential external mutation

The replacement owner must not repeat the mutation automatically until external state, audit evidence, authorization freshness, and idempotency guarantees are reconciled.

If completion cannot be proven safely, only that action enters protected halt.

### 8.4 Complete service or regional failure

Traffic moves to a healthy region or replica set. Durable work remains queued and is reconciled after ownership transfer. Unaffected services remain online.

### 8.5 Adapter or provider failure

The circuit breaker isolates the failed dependency. Reviewed alternatives may be selected when policy, capability, tenant, credential, approval, and evidence requirements remain equivalent. Otherwise, only affected work is deferred or halted.

### 8.6 Physical-system communication loss

Local controllers execute their predefined safe behavior independently of SignalBoost. Supervisory services remain online and continue diagnostics, reconciliation, and recovery attempts.

## 9. Retry and idempotency policy

Automatic retries are permitted only when at least one of the following is true:

- the operation is observational or read-only;
- the operation is internally reversible and protected by deterministic idempotency;
- the external provider offers a verified idempotency contract;
- reconciliation proves the prior attempt did not execute;
- a protocol-specific safety contract explicitly permits retry.

Automatic retry is prohibited when completion is uncertain and repetition could create material financial, physical, legal, security, or irreversible harm.

## 10. Human-intervention boundary

Human intervention is an exception, not the normal recovery mechanism.

A human is required only when the platform cannot establish a safe autonomous decision because of:

- life or physical-safety exposure;
- material financial exposure;
- irreversible or destructive impact;
- legal or regulatory risk;
- suspected security or credential compromise;
- cross-tenant uncertainty;
- corrupted governance state;
- uncertain completion of a consequential action without a safe reconciliation path.

Even in these cases, the platform remains operational around the quarantined action and continues diagnostics, evidence preservation, and recovery attempts.

## 11. Audit and observability requirements

Every continuity decision must record sanitized evidence for:

- failure detection;
- affected component and scope;
- prior and replacement ownership;
- lease and fencing state;
- retry or failover decision;
- reconciliation result;
- provider or adapter selection;
- degraded-mode entry and exit;
- protected-halt reason;
- automatic recovery result;
- human escalation when required.

Diagnostics must not expose credentials, raw authorization material, unsafe provider responses, or cross-tenant data.

## 12. Acceptance criteria

A continuity implementation is not complete until tests prove:

- replica loss does not interrupt safe request admission;
- stale owners are fenced;
- duplicate execution is prevented;
- interrupted work is reconciled after restart;
- safe retries occur automatically;
- unsafe retries do not occur;
- one adapter or provider failure does not stop unrelated work;
- degraded mode preserves healthy capabilities;
- protected halt is action-scoped;
- approval and revocation state survive process failure;
- audit and evidence survive failover;
- local physical safety remains independent;
- recovery does not require production credentials in tests;
- backup restoration is regularly validated.

## 13. Architecture rule for future work

Every new COS, Gateway, protocol, provider, browser, robotics, industrial, or execution capability must answer:

1. How does it remain available after instance failure?
2. What state is durable?
3. What is the idempotency key?
4. How is ownership transferred?
5. How are stale owners fenced?
6. How is interrupted work reconciled?
7. Which failures trigger degraded mode?
8. Which exact action can enter protected halt?
9. Why can unrelated work continue?
10. Under what exceptional condition is human intervention required?

A capability that cannot answer these questions is not ready for production continuity.
