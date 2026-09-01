# Full Assistant → Concierge deterministic repair ingress

## Problem

The owner Full Assistant could still return the passive Vercel-log response after the prior routing fixes because its ordinary transport sends to `/api/cos-primary`. A previous proxy fix depended on browser `Referer` to recognize `/dashboard/assistant`; that header is not a sufficiently reliable routing contract.

## Fix

The Full Assistant transport boundary keeps ordinary owner COS turns on `/api/cos-primary`, preserving privileged owner context. Only a pasted operational log with explicit repair intent in the current or immediately preceding user turn is sent to `/api/concierge`, which rewrites to `/api/cos-browser` and owns the governed repository-repair handoff.

Existing direct client-side Builder/artifact handling remains unchanged.

## Invariants

- No repair routing authority depends on Referer.
- `debug/fix this` followed by a pasted Vercel log enters the same governed repair ingress as homepage Concierge.
- Ordinary owner questions stay on `/api/cos-primary`; owner/private context is not downgraded to public scope.
- Passive logs remain non-executing when there is no explicit repair intent.
- Source-attached Builder requests keep the existing Builder boundary.
- Internal/non-Full-Assistant COS callers are unchanged.
