# Provider Hub MCP Compatibility — Phase 3 Connection Registry

Date: 2026-08-31
Status: implementation active; not Production-accepted

Phase 1 added governed inbound MCP capability projection. Phase 2 added host-neutral outbound MCP consumption. Phase 3 removes per-portable custom wiring by introducing a shared, deny-by-default MCP connection registry and configuration resolver.

## Architectural rule

```text
COS / portable
→ MCP registry resolver
→ exact tenant/environment/portable assignment
→ approved server + approved tool mappings
→ Portable Connector Runtime
→ Provider Hub MCP outbound adapter
→ host-owned authenticated transport
→ external MCP server
```

The registry is configuration and authorization metadata only. It never stores provider secrets, access tokens, OAuth refresh tokens, TLS private material, or raw credentials. Authentication remains host-owned.

## Phase 3 scope

- canonical MCP server record keyed by stable server ID;
- exact assignment of one server to tenant + environment + portable;
- explicit per-tool mapping to SignalBoost capability ID, provider/connection identity, risk, approval requirement, scopes, and optional safe metadata;
- disabled-by-default server and assignment state;
- duplicate server, assignment, capability, and tool mapping rejection;
- exact-scope lookup only; no tenant/environment/portable wildcard grants;
- resolver that produces Phase 2 outbound adapter configuration only from an enabled exact assignment and enabled server;
- caller-supplied host transport factory so endpoint/authentication/credentials remain outside registry core;
- deterministic regressions for scope isolation, disabled records, duplicate mappings, secret-field rejection, and adapter resolution.

## Security invariants

1. A remote MCP server cannot register or authorize itself.
2. A server catalog entry does not grant any portable access.
3. A portable assignment does not expose a tool unless that tool has an explicit host mapping.
4. Consequential/write tools retain Portable Connector Runtime approval and audit enforcement.
5. The registry rejects credential-shaped fields rather than becoming a secret store.
6. No wildcard tenant/environment/portable assignments exist in Phase 3.

## Non-goals

- no public MCP marketplace or automatic internet discovery;
- no generic credential vault;
- no self-service write authorization based only on MCP annotations;
- no replacement of existing Provider Hub grants, Agent Gateway governance, or product-specific high-risk controls.

## Acceptance

Before merge: full SaaS unit tests, TypeScript, production build, repository integrity/onboarding/QA gates, Playwright, diagnostics, and exact Vercel Preview must be green. A merged registry is still not proof of a real external server assignment in Production; runtime acceptance requires a separately authorized live MCP observation.
