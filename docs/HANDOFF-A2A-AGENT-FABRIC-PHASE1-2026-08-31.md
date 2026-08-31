# SignalBoost A2A Agent Fabric — Phase 1

Date: 2026-08-31
Status: implementation active; not Production-accepted

## Owner direction

SignalBoost is adding A2A as an interoperability and multi-agent coordination layer for COS, specialist agents, Self-Healing Supervisor workflows, Marketing + Sales, and authorized portables/software. Buyer pluggability is a hard architectural requirement.

## Architectural rule

```text
Buyer systems / SignalBoost COS / portable
→ SignalBoost governance + exact tenant/environment/portable policy
→ A2A agent registry / delegation boundary
→ host-owned authenticated A2A transport
→ specialist or buyer-owned A2A agent
→ MCP / Provider Hub / buyer tools as separately authorized
```

A2A is never the authorization authority. It is an interoperability protocol for agent discovery and task exchange. SignalBoost governance remains authoritative for tenant isolation, agent assignment, delegation rights, risk, approval, audit, budgets, and tool access.

## Protocol baseline

Phase 1 targets A2A protocol 0.3.0 semantics for Agent Cards and synchronous `message/send`. The implementation remains host-neutral and does not embed network endpoints or credentials in the core registry. Host adapters own endpoint resolution, TLS, authentication, proxies, and secrets.

## Phase 1 scope

- canonical, bounded Agent Card validation;
- exact tenant + environment + portable agent assignment, with no wildcard grants;
- deny-by-default specialist exposure: an advertised remote skill is not authorization;
- explicit allowed skill IDs and delegation risk classification;
- host-owned logical `transportRef` rather than stored endpoint credentials;
- A2A synchronous `message/send` client with strict JSON-RPC request/response correlation;
- bounded task/message/artifact result validation;
- exact-scope resolver that creates an A2A client only for an enabled assigned agent;
- no direct model/provider dependency in A2A core;
- no direct MCP/tool authorization through A2A; delegated agents still use separately governed MCP/Provider Hub capabilities;
- regression coverage for scope isolation, disabled agents, unknown agents, secret-shaped registry metadata, unapproved skills, response-ID mismatch, and remote errors.

## Agent hierarchy direction

COS remains the generalist orchestrator. Specialist agents should exist only where there is meaningful expertise or independent workflow/state, for example Marketing, Sales, Research, Security/QA, and Self-Healing diagnostic/remediation/verification roles. A2A allows these specialists to be SignalBoost-owned or buyer-owned without forcing a common internal framework.

## Buyer-pluggability invariants

1. Buyers may provide their own A2A agents and transport/auth implementation.
2. SignalBoost does not require buyer agents to expose private memory, chain-of-thought, internal tools, or model implementation.
3. SignalBoost registry stores no passwords, tokens, OAuth secrets, private keys, or raw credentials.
4. No buyer must move data into a SignalBoost-owned database merely to participate in A2A.
5. Agent assignment is exact-scoped; no global wildcard access is introduced in Phase 1.
6. A2A delegation never grants MCP/tool authority by implication.
7. Consequential agent actions remain subject to the buyer/SignalBoost approval and audit policy appropriate to that action.

## Non-goals

- no autonomous unrestricted agent swarm;
- no automatic discovery of arbitrary internet agents;
- no public A2A marketplace;
- no self-authorizing Agent Card;
- no credential vault;
- no replacement of COS, Provider Hub, Agent Gateway, MCP, or product-specific high-risk controls;
- no claim that every function should become an agent.

## Acceptance

Before merge: deterministic A2A regressions, SaaS unit tests, TypeScript, production build, repository QA/integrity/onboarding gates, Playwright, diagnostics, and exact Vercel Preview must be green. A merged Phase 1 is not proof of a real external buyer A2A agent; live runtime acceptance requires a separately authorized end-to-end observation.
