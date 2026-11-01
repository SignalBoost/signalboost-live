// saas/lib/ai/cos/requestTurnCorrelation.ts
//
// THE TURN RECORDS ONE REQUEST PRODUCED. A browser request can run several reasoner turns (the main answer, a rescue,
// a repair), and each writes its own cos_turn_experience row under its own turn id. Nothing returned those ids, so a
// request could not be traced to its records (production campaign 2026-11-01: every PAC result showed "Correlation: -"
// and PAC-16/PAC-17 were BLOCKED). The ingress opens one scope per request; every turn id that is given a record is
// noted here, in order, and the ingress can hand them back to a caller allowed to read them.
//
// Request-local (AsyncLocalStorage); outside a scope noting is a no-op. No I/O.

import { AsyncLocalStorage } from 'node:async_hooks'

const scope = new AsyncLocalStorage<{ turnIds: string[] }>()

/** Run one request with its own turn-id record. */
export function withRequestTurnCorrelation<T>(work: () => Promise<T>): Promise<T> {
  return scope.run({ turnIds: [] }, work)
}

/** Note a turn id that has (or is getting) its turn record. Duplicates are kept once, first position. */
export function noteRequestTurnId(turnId: string | null | undefined): void {
  const value = String(turnId ?? '').trim()
  const store = scope.getStore()
  if (!value || !store || store.turnIds.includes(value)) return
  store.turnIds.push(value)
}

/** The turn ids this request recorded, oldest first. */
export function requestTurnIds(): readonly string[] {
  return [...(scope.getStore()?.turnIds ?? [])]
}
