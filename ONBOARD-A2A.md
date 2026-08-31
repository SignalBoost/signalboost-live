# A2A Agent Fabric Onboarding Supplement

Read root `ONBOARD.md` first, then `docs/HANDOFF-A2A-AGENT-FABRIC-PHASE1-2026-08-31.md`, `docs/HANDOFF-A2A-AGENT-FABRIC-PHASE2-2026-08-31.md`, `docs/HANDOFF-A2A-AGENT-FABRIC-PHASE3-2026-08-31.md`, and `docs/HANDOFF-A2A-AGENT-FABRIC-PHASE4-2026-08-31.md` before changing A2A, COS delegation, specialist-agent, Agent Operations, Agent Gateway, MCP/Provider Hub interaction, or portable agent-integration code.

Current workstream: **A2A Agent Fabric — Phase 4 COS runtime + portable host composition active; not Production-accepted.**

Direction:

- COS remains the generalist orchestrator/brain and may choose not to delegate.
- COS specialist plans are proposals, not authority; family/skill/agent selection is independently validated against canonical catalog + exact buyer assignments.
- A2A is the agent-to-agent interoperability/delegation layer.
- MCP/Provider Hub remains the agent-to-tools/data compatibility layer.
- SignalBoost governance remains authoritative above both protocols.
- Buyer-owned agents, runtimes, endpoints, authentication, databases, models, approval systems, audit sinks, and tools must remain pluggable through injected host adapters.
- Remote Agent Cards and advertised skills are discovery metadata only; they never self-authorize access.
- Exact tenant/environment/portable assignments are required; no wildcard grants.
- When COS does not name an agent, exactly one eligible assigned agent is required; zero is unavailable and multiple is ambiguous.
- Canonical catalog risk must match assignment risk; mismatches fail closed.
- Credentials and raw endpoint secrets remain host-owned and outside A2A core.
- Advisory delegation is the lowest-risk path; write delegation requires explicit approval; consequential delegation requires explicit approval plus a buyer-controlled audit sink before any remote call.
- A2A delegation never grants MCP/Provider Hub/tool authority by implication.
- Phase 4 runtime composition must be injected and replaceable. Normal COS traffic remains on the existing COS primary path unless a structured specialist plan is explicitly supplied.
