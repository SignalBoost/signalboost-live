# A2A Agent Fabric Onboarding Supplement

Read root `ONBOARD.md` first, then Phases 1–12 under `docs/HANDOFF-A2A-AGENT-FABRIC-PHASE*-2026-08-31.md` before changing A2A, COS delegation, specialist-agent, Agent Operations, Agent Gateway, MCP/Provider Hub interaction, or portable agent-integration code.

Current workstream: **A2A Agent Fabric — Phase 12 buyer onboarding manifest active; buyer-live acceptance still pending. Specialist Mesh routing/failover implementation is active on PR #2154; Production end-to-end acceptance is pending.**

Direction:

- COS remains the generalist orchestrator/brain and may choose not to delegate.
- Generalist is the default; ambiguous or weak natural-language specialist intent stays on COS Primary.
- COS specialist plans are proposals, not authority; family/skill/agent selection is independently validated against canonical catalog + exact buyer assignments.
- When several specialists are independently eligible for the same exact task, the mesh may rank them automatically by availability, cost, load, latency, reliability, and quality instead of requiring a fixed primary/backup pair. Ranking never expands eligibility or authority.
- There are no permanent primary/backup specialist pairs. Every independently qualified and authorized specialist may provide backup capacity for work in its proven scope.
- Qualification is a host-controlled hard gate. Registry assignment and Agent Card advertised skills are not qualification evidence; portable hosts must inject a qualification adapter with durable evidence references.
- Live mesh telemetry is routing evidence only. Telemetry failure may fall back to safe static routing evidence; telemetry cannot grant skill, scope, risk, credential, or permission.
- Advisory/read-only work may automatically fail over after a clearly recoverable unavailable/runtime failure. Automatic write/consequential replay remains prohibited until idempotency and side-effect reconciliation are proven.
- Durable mesh ownership reuses Supervisor coordination leases and fencing. A replacement specialist must acquire the current lease; stale owners are rejected. The lifecycle remains `queued -> leased -> processing -> verification_pending -> completed`.
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
- Phase 12 adds a versioned buyer onboarding manifest + dry-run install plan. Dry runs have zero activation/delegation side effects and reject secret-like or unknown fields.
- `buyer-ready`, `signalboost-reference-live`, and `buyer-live` are distinct labels. Only a future authorized buyer-owned endpoint with observed governed delegation satisfies buyer-live acceptance.
- Specialist Mesh University coverage may use operational coverage gaps to prioritize cross-training, but credentials, academic passes, retention evidence, and authority remain per-agent and never transfer from one specialist to another.
