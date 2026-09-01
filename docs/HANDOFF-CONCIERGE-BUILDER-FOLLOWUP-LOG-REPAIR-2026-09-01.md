# Concierge → Builder Follow-up Log Repair — 2026-09-01

## Problem

Concierge currently evaluates only the latest user message for operational-log repair intent. If a user first says `fix/debug this` and then pastes the Vercel log in the next message, the latest message is classified as passive log evidence and Builder/Platform Engineer is never invoked.

The first implementation of the carry-forward logic still reused `isExplicitOperationalLogRepairRequest(previousUserPrompt)`. That helper intentionally requires operational-log evidence, so a standalone prior turn such as `please debug this` could never carry intent. Codex correctly identified that defect.

## Required behavior

- Detect standalone repair language independently from log evidence.
- Preserve repair intent from exactly the immediately preceding user turn when the current turn is a pasted operational/build log.
- Do not infer execution authority from arbitrary older conversation history.
- A source-attached repair continues to use the ordinary Builder lane.
- A complete failed SignalBoost Vercel snapshot may use the owner-only pinned, network-denied Platform Engineer lane.
- Passive logs remain analysis-only.
- Repository repair remains review-only: no commit, push, merge, deploy, or self-approval.

## Acceptance

Regression coverage must prove `please debug this` followed by a passive Vercel log is recognized as one repair job, while passive logs without immediately preceding repair intent remain closed. All repository gates and the exact Preview must be green before merge.