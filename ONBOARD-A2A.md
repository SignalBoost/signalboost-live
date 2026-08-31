# A2A Agent Fabric Onboarding Supplement

Read root `ONBOARD.md` first, then `docs/HANDOFF-A2A-AGENT-FABRIC-PHASE1-2026-08-31.md` before changing A2A, COS delegation, specialist-agent, Agent Operations, Agent Gateway, MCP/Provider Hub interaction, or portable agent-integration code.

Current workstream: **A2A Agent Fabric — Phase 1 governed buyer-pluggable compatibility layer active; not Production-accepted.**

Direction:

- COS remains the generalist orchestrator/brain.
- A2A is the agent-to-agent interoperability/delegation layer.
- MCP/Provider Hub remains the agent-to-tools/data compatibility layer.
- SignalBoost governance remains authoritative above both protocols.
- Buyer-owned agents, runtimes, endpoints, authentication, databases, models, and tools must remain pluggable through injected host adapters.
- Remote Agent Cards and advertised skills are discovery metadata only; they never self-authorize access.
- Exact tenant/environment/portable assignments are required; no wildcard grants in Phase 1.
- Credentials and raw endpoint secrets remain host-owned and outside A2A core.
- Consequential work remains subject to existing approval/audit boundaries.
