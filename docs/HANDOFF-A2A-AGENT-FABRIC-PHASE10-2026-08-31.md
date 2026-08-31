# A2A Agent Fabric — Phase 10 Reference Health and Availability

Status: active workstream; buyer acceptance remains pending.

## Goal

Make specialist availability observable before delegation and expose a bounded, credential-free health contract for the SignalBoost reference Self-Healing Diagnostic specialist. This is operational proof for the reference runtime, not buyer acceptance.

## Invariants

- COS remains the generalist brain and buyer-installed A2A hosts remain first priority.
- Health checks never grant authority and never substitute for exact tenant/environment/portable assignment.
- Reference health is read-only and carries no prompt, response, credential, token, header, endpoint secret, or buyer data.
- A healthy reference specialist means its server-owned Agent Card and diagnostic route contract are available; it does not mean buyer-live acceptance.
- Failure is explicit and bounded; no silent fallback from buyer agents to reference agents after a buyer host has been selected.
- No placeholders, fake endpoints, fake credentials, or simulated Production evidence.

## Phase 10 implementation

1. Add a reusable A2A availability probe that validates an Agent Card and expected canonical skill.
2. Add a hosted reference-health API that probes the real server-owned reference Agent Card over HTTPS.
3. Return only safe metadata: status, protocol version, agent version, skill ID, latency, and acceptance label.
4. Add deterministic regressions for healthy, wrong-skill, malformed-card, and secret-free evidence cases.
5. Enforce the regressions in the required A2A workflow.

## Acceptance

Phase 10 may be merged after A2A regressions/typecheck, normal repository gates, and exact Preview are green. `signalboost-reference-live` and `buyer-live` remain separate labels.