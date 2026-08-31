# A2A Agent Fabric Onboarding Supplement

Read root `ONBOARD.md` first, then Phases 1–11 under `docs/HANDOFF-A2A-AGENT-FABRIC-PHASE*-2026-08-31.md` before changing A2A, COS delegation, specialist-agent, Agent Operations, Agent Gateway, MCP/Provider Hub interaction, or portable agent-integration code.

Current workstream: **A2A Agent Fabric — Phase 11 buyer specialist onboarding active; buyer-live acceptance still pending.**

Direction:

- COS remains the generalist orchestrator/brain and may choose not to delegate.
- Generalist is the default; ambiguous or weak natural-language specialist intent stays on COS Primary.
- COS specialist plans are proposals, not authority; family/skill/agent selection is independently validated against canonical catalog + exact buyer assignments.
- A2A is agent-to-agent interoperability/delegation; MCP/Provider Hub is agent-to-tools/data compatibility.
- SignalBoost governance remains authoritative above both protocols.
- Buyer-owned agents, runtimes, endpoints, authentication, databases, models, approval systems, audit sinks, telemetry sinks, and tools remain pluggable through injected host adapters.
- Buyer-installed A2A hosts take precedence over SignalBoost reference hosts.
- Remote Agent Cards and advertised skills are discovery metadata only; they never self-authorize access.
- Exact tenant/environment/portable assignments are required; no wildcard grants.
- Credentials and raw endpoint secrets remain host-owned and outside A2A core.
- Advisory delegation is lowest risk; write requires explicit approval; consequential requires explicit approval plus buyer-controlled audit before any remote call.
- A2A delegation never grants MCP/Provider Hub/tool authority by implication.
- Runtime observability is metadata-only; prompt text, response payloads, credentials, headers, tokens, and endpoint URLs are excluded.
- HTTPS JSON-RPC transport + Agent Card validation are available for authorized hosts; endpoints/auth remain runtime inputs, never registry state.
- The SignalBoost reference Self-Healing Diagnostic specialist is real, read-only, optional, and never called buyer acceptance.
- Phase 9 may compose that reference specialist into hosted COS only for canonical `self-healing.diagnose`, owner/admin sessions, and exact scope when no buyer host is installed.
- Phase 10 adds bounded reference health/availability evidence; health never grants authority and never changes buyer-host precedence.
- Phase 11 compiles validated buyer Agent Cards + exact scope + explicit skill/risk approvals into existing registry entries only after health proof; it stores no credentials or endpoint secrets.
- `buyer-ready`, `signalboost-reference-live`, and `buyer-live` are distinct labels. Only a future authorized buyer-owned endpoint with observed governed delegation satisfies buyer-live acceptance.
