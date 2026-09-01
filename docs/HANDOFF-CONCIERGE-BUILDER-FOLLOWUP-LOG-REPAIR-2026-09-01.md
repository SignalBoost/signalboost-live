# Concierge → Builder Follow-up Log Repair — 2026-09-01

## Problem

Concierge currently evaluates only the latest user message for operational-log repair intent. If a user first says `fix/debug this` and then pastes the Vercel log in the next message, the latest message is classified as passive log evidence and Builder/Platform Engineer is never invoked.

## Required behavior

- Preserve repair intent from the immediately preceding user turn when the current turn is a pasted operational/build log.
- Do not infer execution authority from arbitrary conversation history.
- Only carry forward an immediately preceding explicit repair/debug request.
- A source-attached repair continues to use the ordinary Builder lane.
- A complete failed SignalBoost Vercel snapshot may use the owner-only pinned, network-denied Platform Engineer lane.
- Passive logs remain analysis-only.
- Repository repair remains review-only: no commit, push, merge, deploy, or self-approval.

## Acceptance

Regression coverage must prove both single-turn and two-turn repair requests route correctly while passive logs remain closed.