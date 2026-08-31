# SignalBoost A2A Agent Fabric — Phase 6

Date: 2026-08-31
Status: implementation active; not Production-accepted

## Owner direction

COS remains the generalist brain. A2A specialist agents must remain buyer-pluggable, and real buyer/portable hosts need an explicit activation seam plus runtime evidence that proves what was delegated, where, and with what governed scope. MCP/Provider Hub remains tools/data and grants no authority by implication.

## Phase 6 objective

Turn the Phase 1–5 A2A fabric into an operational host contract that a buyer or portable can activate with its own registry, transport/auth implementation, approval source, audit sink, and telemetry sink—without storing buyer endpoints or credentials in SignalBoost core.

```text
buyer / portable host configuration
→ normalized A2A registry snapshot
→ activation validation
→ injected transport factory + approval/audit/telemetry ports
→ portable A2A host
→ COS specialist orchestration
→ governed delegation
→ buyer-owned A2A transport
→ specialist agent
→ bounded runtime observation
```

## Required invariants

1. Activation is explicit; no global auto-discovery or implicit external connection.
2. Buyer endpoints, credentials, TLS/auth material, models, databases, and secrets remain host-owned and are never persisted by the A2A core registry.
3. Activation validates the complete registry before installation and rejects empty, disabled-only, wildcard, duplicate, or secret-shaped configuration through existing registry normalization.
4. Runtime telemetry is metadata-only: scope, assignment, agent, skill, risk, mode, success/failure, timing, approval ID, trace ID, and transport reference identifier. It never records prompt text, response payloads, credentials, headers, tokens, or endpoint URLs.
5. Telemetry failure is non-authoritative for advisory/write execution but consequential delegation still obeys the existing buyer audit requirement.
6. A real external A2A acceptance claim requires an observed authorized remote delegation; deterministic tests and Preview alone do not count as live buyer-agent evidence.
7. A2A activation never grants MCP/Provider Hub/tool authority.
8. The same activation contract must work for hosted COS and buyer portables.

## Phase 6 scope

- reusable host activation function over the existing portable A2A composition root;
- activation summary suitable for buyer/portable diagnostics without secrets;
- optional metadata-only runtime observation port emitted around delegation;
- deterministic tests proving exact scope, timing/result telemetry, no payload capture, transport-before/after observation behavior, and activation fail-closed rules;
- required A2A CI enforcement for the new Phase 6 test file.

## Non-goals

- no credential or endpoint registry;
- no hosted secret manager;
- no unrestricted remote Agent Card crawling;
- no automatic buyer-agent enrollment;
- no automatic approval;
- no claim of Production/live external-agent acceptance until an authorized real remote observation exists.

## Acceptance

Before merge: Phase 6 regressions, all earlier A2A regressions, TypeScript, SaaS tests/build, onboarding/integrity/QA, Playwright, diagnostics, repo targeting, and exact Vercel Preview must be green.
