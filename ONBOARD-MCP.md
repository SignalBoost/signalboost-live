# MCP Compatibility Onboarding Supplement

Read root `ONBOARD.md` first, then `docs/HANDOFF-PROVIDER-HUB-MCP-2026-08-31.md`, `docs/HANDOFF-PROVIDER-HUB-MCP-PHASE2-2026-08-31.md`, and `docs/HANDOFF-PROVIDER-HUB-MCP-PHASE3-2026-08-31.md` before changing MCP, Agent Gateway, Provider Hub, connector, or portable integration code.

Current workstream: **Provider Hub MCP compatibility — Phase 3 shared connection registry active; not Production-accepted.**

Direction: retain SignalBoost governance/Provider Hub as the authority layer; generalize the existing MCP implementation as a compatibility layer for COS and explicitly authorized portables/software.

- Phase 1 (merged in PR #1722): exact-scope read-only Provider Hub capability projection through the existing governed MCP server.
- Phase 2 (merged in PR #1723): host-neutral outbound MCP client + Provider Hub discovery/execution adapter for explicitly configured external MCP servers.
- Phase 3 (active): shared deny-by-default MCP server/portable assignment registry so approved MCP servers and exact tool mappings can be reused without per-portable custom code.
- Remote MCP self-description is never authorization. Tool exposure requires exact host mapping to tenant, environment, portable, provider, connection, risk, approval rule, scopes, and schema.
- Credentials/authentication remain host-owned; MCP core and registry store none.
- Write/consequential capabilities remain subject to existing Portable Connector Runtime approval/audit gates and are never auto-authorized merely because an MCP server advertises them.
