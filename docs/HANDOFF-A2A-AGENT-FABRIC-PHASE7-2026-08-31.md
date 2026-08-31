# SignalBoost A2A Agent Fabric — Phase 7

Date: 2026-08-31
Status: implementation active; not Production-accepted

## Owner direction

COS remains the generalist brain. Specialist agents and buyer systems remain pluggable. A2A is the agent-to-agent layer; MCP/Provider Hub remains tools/data. Production acceptance for external A2A requires a real authorized remote delegation with auditable, metadata-safe evidence.

## Phase 7 objective

Add a buyer-pluggable HTTPS JSON-RPC A2A transport and a live acceptance runner that can validate an Agent Card, execute one authorized advisory delegation through the existing Phase 6 governed runtime, and emit a bounded acceptance record without persisting endpoint URLs, credentials, prompts, or remote response payloads.

```text
buyer runtime config (ephemeral)
→ fetch/validate Agent Card
→ map approved remote skill to existing exact A2A assignment
→ host-owned HTTPS JSON-RPC transport
→ Phase 6 activation + governance
→ authorized advisory delegation
→ real remote A2A server
→ metadata-only observation
→ acceptance record
```

## Required invariants

1. Endpoint URLs, auth headers/tokens, TLS material, and credentials are runtime-injected and never written into the SignalBoost registry, audit event, observation event, or acceptance record.
2. Production transport is HTTPS only. Insecure loopback is allowed solely by an explicit test-only option.
3. Agent Card discovery is explicit; no crawling or wildcard discovery.
4. Agent Card protocol version and preferred transport must be compatible with SignalBoost A2A 0.3 JSON-RPC before execution.
5. Remote advertised skills are discovery metadata only. Exact SignalBoost assignment authorization remains authoritative.
6. Live acceptance runs advisory delegation only. Write/consequential acceptance remains governed by the existing approval/audit boundary and is out of scope for this phase.
7. The acceptance record contains only safe identifiers, protocol/version, validated agent-card identity, assigned skill, scope, result mode, timing, trace ID, and a boolean proving a remote observation occurred.
8. A deterministic loopback test proves transport semantics but MUST NOT be labeled live external Production acceptance.
9. A Production-accepted claim requires a real HTTPS remote endpoint supplied by an authorized host and one successful observed delegation.
10. MCP/tool authority is never granted by A2A connectivity.

## Acceptance

Before merge: Phase 7 transport + acceptance regressions, all previous A2A regressions, TypeScript, SaaS tests/build, onboarding/integrity/QA, Playwright, diagnostics, repo targeting, and exact Vercel Preview must be green. After merge, external A2A remains not Production-accepted until a real authorized remote endpoint is exercised successfully.