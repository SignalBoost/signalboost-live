# Full Assistant → Concierge → Builder ingress repair — 2026-09-01

## Problem

The homepage Concierge sends turns through `/api/concierge` → `/api/cos-browser`, where governed operational-log repair routing exists. The owner Full Assistant instead posts to `/api/cos-primary` and its `AssistantTransportBoundary` intercepts that route. A standalone `debug/fix this` turn followed by a pasted Vercel log therefore bypasses the server Concierge repair lane and can still return the passive-log canned response.

## Required behavior

- Preserve the Full Assistant's existing direct Builder handling for explicit source-attached coding objectives.
- When the current Full Assistant turn is operational-log evidence and either the current turn or immediately preceding user turn carries explicit repair intent, route that request through the canonical `/api/concierge` ingress.
- Let `/api/cos-browser` remain authoritative for owner-only pinned SignalBoost repository repair.
- Do not turn passive logs into execution requests.
- Do not carry repair authority from arbitrary older history.
- Do not duplicate repository-repair logic in the browser transport boundary.

## Acceptance

Regression coverage must prove that two-turn `debug/fix this` → Vercel log traffic from the Full Assistant enters `/api/concierge`, while passive logs and ordinary COS requests retain their existing behavior.