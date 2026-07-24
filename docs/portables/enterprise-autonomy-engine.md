# Enterprise Autonomy Engine Portable

## Product law

SignalBoost is the laboratory and reference integration environment. The portable products are the commercial products.

> Every product developed inside SignalBoost MUST be independently valuable, independently deployable, and fully operational outside SignalBoost without source-code modification.

A module that requires SignalBoost to operate is not a portable and has no acceptable commercial release path.

## Product identity

The Enterprise Autonomy Engine (EAE) is a standalone, white-label, plug-and-play enterprise intelligence product. SignalBoost is its first reference customer, not an architectural dependency.

The EAE applies autonomous-systems engineering to enterprise operations: observe, fuse evidence, maintain a bounded world state, perceive changes and hazards, predict outcomes, compare plans, score confidence and risk, apply policy, define verification, and later learn from verified results.

## Relationship with the AI Chief of Staff

The EAE does not replace the existing AI Chief of Staff (COS) pipeline. It makes that pipeline more effective and robust.

- **EAE:** strategic intelligence, perception, prediction, planning, confidence, risk, verification, and learning.
- **COS:** orchestration, workflow coordination, approvals, scheduling, user interaction, and execution management.
- **Portables:** specialized business capabilities such as video, email, press, websites, cybersecurity, audit, and self-healing.

The initial integration is a versioned Enterprise Intelligence Bus:

```text
Enterprise observations and outcomes
              |
              v
Enterprise Autonomy Engine
              |
   versioned decision package
              |
              v
AI Chief of Staff
              |
 existing orchestration pipeline
              |
              v
Portables + Supervisor + approved executors
              |
       verified outcomes
              +--------------------> EAE
```

## Mandatory portability requirements

The EAE MUST run without SignalBoost UI, Supabase, Vercel, Browser Runtime, or private SignalBoost services. It MUST expose versioned contracts, require tenant and environment identity, support buyer-selected adapters, preserve provenance, remain JSON-serializable, reject secrets and executable values, and fail closed on unsafe or contradictory critical input.

The core may recommend but never automatically spend, publish, message, modify infrastructure, change HR state, migrate data, delete resources, or use credentials.

## Fortune 500 engineering baseline

Every release is designed for large regulated enterprises and therefore requires tenant isolation, zero-trust boundaries, deterministic processing, schema compatibility, SSO/RBAC/SCIM-ready ports, OpenTelemetry-compatible observability ports, customer-controlled storage and residency, complete audit exports, health contracts, localization, and white-label metadata.

No certification may be claimed until it has actually been completed.

## Portable laws

1. Every product MUST operate outside SignalBoost without source modification.
2. No portable may require another portable at compile time.
3. Optional integrations use versioned contracts and adapters.
4. Configuration replaces customer-specific forks.
5. Every portable owns its API, tests, documentation, installer, version, health contract, telemetry contract, and upgrade path.
6. SignalBoost-specific adapters remain outside the portable core.
7. Consequential execution remains approval-controlled and auditable.

## Initial implementation boundary

The first release is deterministic and side-effect-free. It includes tenant-scoped observations, fusion, conflict and staleness detection, immutable world-state snapshots, candidate plans, fail-closed policy disposition, decision packages, buyer host ports, and a COS intelligence-envelope contract.

It does not include live connectors, persistence, LLM calls, browser execution, provider execution, automatic repair, or user-interface code.
