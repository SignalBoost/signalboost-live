# SignalBoost A2A Agent Fabric — Phase 3

Date: 2026-08-31
Status: implementation active; not Production-accepted

## Owner direction

COS remains the generalist brain/orchestrator. Specialist agents remain buyer-pluggable and may be SignalBoost-owned or buyer-owned. A2A is the agent-to-agent interoperability layer; MCP/Provider Hub remains the agent-to-tools/data layer. SignalBoost/buyer governance remains authoritative above both.

## Phase 3 objective

Connect COS planning to specialist selection and the Phase 2 governed delegation runtime without allowing a model, remote Agent Card, or specialist to grant itself authority.

```text
COS reasoning / planning
→ structured specialist plan (family + skill + optional agent)
→ canonical specialist catalog validation
→ exact tenant/environment/portable assignment resolution
→ ambiguity / risk consistency checks
→ Phase 2 governed delegation runtime
→ host-owned A2A transport
→ specialist agent
→ separately governed MCP / Provider Hub tools
```

## Required invariants

1. COS may propose a specialist family and skill, but the host validates both against the canonical specialist catalog.
2. The canonical catalog risk for a skill must match the exact buyer assignment risk; mismatches fail closed.
3. Only enabled agents and enabled exact tenant/environment/portable assignments may be selected.
4. An optional explicit `agentId` must be exactly assigned and authorized for the selected skill.
5. When no `agentId` is supplied, exactly one eligible agent must exist. Zero candidates returns unavailable; multiple candidates returns ambiguous. There is no silent ranking or first-match selection in Phase 3.
6. Remote Agent Cards, advertised skills, model prose, and specialist responses never self-authorize selection or execution.
7. Phase 2 approval/audit requirements remain authoritative for write and consequential delegation.
8. A2A delegation never grants MCP/Provider Hub/tool/database/publishing/spend/remediation/deployment authority by implication.
9. Buyer endpoints, identity, models, databases, approval systems, audit sinks, and transport/auth remain injected host concerns.
10. COS may always keep work in the generalist path when specialist delegation is unnecessary or unavailable.

## Phase 3 scope

- host-neutral COS specialist-plan contract;
- deterministic validation against `A2A_SPECIALIST_FAMILIES`;
- exact buyer assignment candidate discovery;
- canonical catalog/registry risk-consistency enforcement;
- optional explicit-agent selection;
- fail-closed unavailable and ambiguous results;
- delegation through the existing Phase 2 governed runtime only;
- provenance fields identifying selected family, agent, skill, and delegation mode;
- regression coverage in the dedicated A2A gate.

## Non-goals

- no unrestricted autonomous swarm;
- no model-generated authority;
- no implicit best-agent scoring from untrusted Agent Cards;
- no automatic MCP/tool grants;
- no direct publishing, spend, CRM mutation, remediation, deployment, or production changes beyond separately authorized existing execution paths;
- no requirement that buyers use SignalBoost models, databases, identity, transport, or agent runtime.

## Acceptance

Before merge: dedicated A2A regression gate, SaaS unit tests, TypeScript, production build, repository integrity/onboarding/QA gates, Playwright, diagnostics, and exact Vercel Preview must be green. A merge proves the orchestration contract and governance boundary, not a live external buyer-agent observation.
