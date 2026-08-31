# SignalBoost A2A Agent Fabric — Phase 4

Date: 2026-08-31
Status: implementation active; not Production-accepted

## Owner direction

COS remains the generalist brain/orchestrator. A2A handles specialist-agent collaboration. MCP/Provider Hub remains agent-to-tools/data. Buyer-pluggability is mandatory across SignalBoost and every portable.

## Phase 4 objective

Wire the Phase 3 COS specialist orchestrator into a real COS request surface and provide reusable portable host composition without coupling buyers to SignalBoost-owned endpoints, credentials, identity, models, databases, approval systems, audit sinks, or agent runtimes.

```text
COS / portable request
→ optional structured specialist plan
→ Phase 3 COS specialist orchestrator
→ Phase 2 governed delegation runtime
→ exact buyer assignment + approval/audit policy
→ buyer-owned A2A transport
→ specialist agent
→ separately governed MCP / Provider Hub tools
```

## Required invariants

1. Normal COS turns remain on the existing COS primary path unless a structured specialist plan is explicitly present.
2. A specialist plan is a proposal, never authority.
3. Runtime host installation is injected and replaceable; no buyer credentials or endpoints live in A2A core.
4. Missing host composition fails closed for specialist delegation and must never silently invoke a different agent or external provider.
5. Portable composition reuses the same registry, transport, approval, audit, and orchestration contracts as COS.
6. Write and consequential delegation continue to require Phase 2 approval/audit controls before transport creation.
7. A2A does not grant MCP/tool authority by implication.
8. Existing COS provenance/security/freshness behavior remains authoritative for non-specialist turns.

## Phase 4 scope

- reusable buyer/portable A2A host composition;
- process-local installation seam for a deployment host to provide the composed runtime;
- a thin `/api/cos-specialist` runtime wrapper that delegates only when `context.specialistPlan` is present and otherwise forwards to existing COS primary;
- deterministic runtime response shape for delegated/unavailable/blocked specialist requests;
- regression coverage proving pass-through, missing-host fail-closed behavior, exact host installation, and approval propagation.

## Non-goals

- no automatic natural-language specialist selection in this phase;
- no unrestricted swarm;
- no embedded buyer endpoints or secrets;
- no new tool grants;
- no bypass of existing COS security/provenance/freshness logic;
- no claim of live buyer-agent acceptance without a real authorized external A2A observation.

## Acceptance

Before merge: dedicated A2A regression gate, SaaS tests, TypeScript, production build, onboarding/integrity/QA gates, Playwright, diagnostics, and exact Vercel Preview must be green.
