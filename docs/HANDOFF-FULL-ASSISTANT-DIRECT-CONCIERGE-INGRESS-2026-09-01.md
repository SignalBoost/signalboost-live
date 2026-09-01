# Full Assistant → Concierge deterministic ingress

## Problem

The owner Full Assistant could still return the passive Vercel-log response after the prior routing fixes because its transport sent ordinary turns to `/api/cos-primary`. The previous proxy fix depended on browser `Referer` to recognize `/dashboard/assistant`; that header is not a sufficiently reliable routing contract.

## Fix

The Full Assistant transport boundary now sends ordinary COS turns directly to `/api/concierge`, the canonical browser ingress. Existing direct client-side Builder/artifact handling remains unchanged. `/api/concierge` is rewritten to `/api/cos-browser`, which owns operational-log repair intent, owner-only pinned repository repair, provenance, and paid-compute permission.

## Invariants

- No routing authority depends on Referer for the Full Assistant.
- `debug/fix this` followed by a pasted Vercel log reaches the same Concierge browser ingress as the homepage Concierge.
- Passive logs remain non-executing when there is no explicit repair intent.
- Source-attached Builder requests keep the existing Builder boundary.
- Internal/non-Full-Assistant COS callers are not changed by this transport update.
