# SignalBoost A2A Agent Fabric — Phase 2

Date: 2026-08-31
Status: implementation active; not Production-accepted

## Owner direction

COS remains the generalist orchestrator/brain. A2A is the agent-to-agent interoperability layer. MCP/Provider Hub remains the agent-to-tools/data layer. Buyer-pluggability is mandatory: buyer agents, runtimes, endpoints, identity, data stores, approval systems, audit sinks, and tools remain injectable through host adapters.

## Phase 2 objective

Bind non-advisory A2A delegation to explicit governance before any remote agent call, then define the first portable specialist families without granting them implicit tool authority.

```text
COS / portable / supervisor
→ exact A2A agent assignment
→ governed delegation runtime
→ risk + approval + audit decision
→ host-owned A2A transport
→ specialist agent
→ separately governed MCP / Provider Hub tools
```

## Required invariants

1. Advisory delegation may execute without approval when the exact assignment authorizes the skill.
2. Write delegation requires explicit approval evidence before the remote agent is called.
3. Consequential delegation requires explicit approval evidence and a buyer-controlled audit sink before the remote agent is called.
4. Missing or malformed approval fails closed.
5. A2A never grants MCP, connector, database, publishing, spending, remediation, deployment, or infrastructure authority by implication.
6. Exact tenant/environment/portable/agent/skill identity is preserved in every audit event.
7. Host transport still owns endpoint resolution, TLS, authentication, proxies, and credentials.
8. Buyer infrastructure remains replaceable; A2A core imports no buyer database, vault, identity, model, or network client.

## Specialist families introduced in Phase 2

The catalog defines product roles and risk boundaries only. It does not activate agents automatically.

- **Marketing Specialist** — research/analysis advisory; publishing and campaign mutation are write/consequential skills and require governance.
- **Sales Specialist** — account/opportunity analysis advisory; CRM/email mutations require governance.
- **Self-Healing Diagnostic Specialist** — diagnosis and remediation planning advisory only.
- **Self-Healing Remediation Specialist** — mutation-capable remediation role; consequential by default.
- **Self-Healing Verification Specialist** — independent post-change verification advisory/read-only by default.

COS remains the generalist coordinator across these specialists. The specialist catalog is intentionally framework-neutral so a buyer may map any role to SignalBoost-owned or buyer-owned A2A agents.

## Non-goals

- no unrestricted autonomous swarm;
- no auto-approval;
- no automatic tool grants from Agent Cards;
- no embedded buyer credentials/endpoints;
- no direct ad spend, publishing, CRM mutation, repair, deployment, or production change in this phase;
- no requirement that buyers use SignalBoost models, databases, identity, or agent runtime.

## Acceptance

Before merge: dedicated A2A regression gate, SaaS unit tests, TypeScript, production build, repository integrity/onboarding/QA gates, Playwright, diagnostics, and exact Vercel Preview must be green. Runtime acceptance of write/consequential delegation requires separately authorized real-system observations and remains outside this implementation-only merge.