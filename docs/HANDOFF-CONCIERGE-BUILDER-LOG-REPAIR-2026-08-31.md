# Concierge → Builder operational-log repair handoff

Status: active repair workstream.

## Problem

Concierge currently checks `isPastedOperationalLog()` before Builder intent. That means an explicit user request such as “debug/fix this” followed by a Vercel failure log is deterministically answered as log analysis and never reaches Builder/Platform Engineer.

## Required behavior

- A pasted operational/build log by itself remains analysis-only and grants no execution authority.
- An explicit repair/debug request plus an attached source file may use the existing isolated Builder debug lane.
- An explicit repair/debug request plus a verifiable failed `SignalBoost/signalboost-live` Vercel snapshot may use the existing pinned-repository Platform Engineer repair lane.
- Repository repair remains owner-only, pinned to the exact failed commit, network-denied, review-only, and cannot commit, merge, deploy, or self-approve.
- Incomplete/successful logs remain analysis-only; no source or repository authority is inferred from them.
- Concierge remains the user-facing surface; Builder/Platform Engineer executes behind it.

## Regression requirement

Tests must prove that passive logs stay non-executing, explicit repair intent is distinguishable, source-attached repairs remain Builder-routable, and an exact failed SignalBoost snapshot can reach only the governed repository-repair lane.