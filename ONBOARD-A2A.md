# A2A Agent Fabric Onboarding Supplement

Read root `ONBOARD.md` first, then `docs/HANDOFF-A2A-AGENT-FABRIC-PHASE1-2026-08-31.md`, `docs/HANDOFF-A2A-AGENT-FABRIC-PHASE2-2026-08-31.md`, `docs/HANDOFF-A2A-AGENT-FABRIC-PHASE3-2026-08-31.md`, `docs/HANDOFF-A2A-AGENT-FABRIC-PHASE4-2026-08-31.md`, `docs/HANDOFF-A2A-AGENT-FABRIC-PHASE5-2026-08-31.md`, and `docs/HANDOFF-A2A-AGENT-FABRIC-PHASE6-2026-08-31.md` before changing A2A, COS delegation, specialist-agent, Agent Operations, Agent Gateway, MCP/Provider Hub interaction, or portable agent-integration code.

Current workstream: **A2A Agent Fabric — Phase 6 real specialist-host activation + runtime observability active; not Production-accepted.**

Direction:

- COS remains the generalist orchestrator/brain and may choose not to delegate.
- Generalist is the default; ambiguous or weak natural-language specialist intent must remain on COS Primary.
- COS specialist plans are proposals, not authority; family/skill/agent selection is independently validated against canonical catalog + exact buyer assignments.
- The natural-language planner may emit only canonical family/skill pairs and never chooses an agent ID from user text.
- A2A is the agent-to-agent interoperability/delegation layer.
- MCP/Provider Hub remains the agent-to-tools/data compatibility layer.
- SignalBoost governance remains authoritative above both protocols.
- Buyer-owned agents, runtimes, endpoints, authentication, databases, models, approval systems, audit sinks, telemetry sinks, and tools must remain pluggable through injected host adapters.
- Remote Agent Cards and advertised skills are discovery metadata only; they never self-authorize access.
- Exact tenant/environment/portable assignments are required; no wildcard grants.
- When COS does not name an agent, exactly one eligible assigned agent is required; zero is unavailable and multiple is ambiguous.
- Canonical catalog risk must match assignment risk; mismatches fail closed.
- Credentials and raw endpoint secrets remain host-owned and outside A2A core.
- Advisory delegation is the lowest-risk path; write delegation requires explicit approval; consequential delegation requires explicit approval plus a buyer-controlled audit sink before any remote call.
- A2A delegation never grants MCP/Provider Hub/tool authority by implication.
- Runtime composition must be injected and replaceable. Natural-language delegation requires an installed governed host plus exact tenant/environment/portable scope; otherwise COS answers through its existing generalist path.
- Phase 6 activation is explicit and must emit only metadata-safe diagnostics/telemetry; prompt text, response payloads, credentials, headers, tokens, and endpoint URLs must never be captured by the A2A observability port.
