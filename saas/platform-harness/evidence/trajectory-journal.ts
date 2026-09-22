// saas/platform-harness/evidence/trajectory-journal.ts
//
// Durable trajectory inputs are observable operational facts only. Never persist
// chain-of-thought, scratchpads, hidden reasoning, or private internal monologue.

import type { HarnessObservableEvent } from '../core/types.ts'

const PRIVATE_REASONING_KEY =
  /(chain.?of.?thought|scratchpad|hidden.?reasoning|hidden.?thought|internal.?monologue|private.?reasoning)/i

function containsForbiddenReasoningKey(value: unknown, seen = new Set<object>()): boolean {
  if (!value || typeof value !== 'object') return false
  if (seen.has(value as object)) return false
  seen.add(value as object)

  if (Array.isArray(value)) {
    return value.some(item => containsForbiddenReasoningKey(item, seen))
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (PRIVATE_REASONING_KEY.test(key)) return true
    if (containsForbiddenReasoningKey(child, seen)) return true
  }
  return false
}

export interface AppendHarnessObservableEvent {
  kind: HarnessObservableEvent['kind']
  summary: string
  evidenceRefs?: readonly string[]
  data?: Readonly<Record<string, unknown>>
  at?: string
}

export interface HarnessTrajectoryJournal {
  append(event: AppendHarnessObservableEvent): HarnessObservableEvent
  snapshot(): readonly HarnessObservableEvent[]
}

export function createTrajectoryJournal(
  runId: string,
  now: () => Date = () => new Date(),
): HarnessTrajectoryJournal {
  const events: HarnessObservableEvent[] = []

  return Object.freeze({
    append(event: AppendHarnessObservableEvent): HarnessObservableEvent {
      if (containsForbiddenReasoningKey(event.data)) {
        throw new Error('harness_private_reasoning_persistence_forbidden')
      }
      const summary = String(event.summary ?? '').trim().slice(0, 2_000)
      if (!summary) throw new Error('harness_trajectory_summary_required')

      const entry: HarnessObservableEvent = Object.freeze({
        runId,
        sequence: events.length + 1,
        at: event.at ?? now().toISOString(),
        kind: event.kind,
        summary,
        ...(event.evidenceRefs?.length
          ? { evidenceRefs: Object.freeze([...event.evidenceRefs]) }
          : {}),
        ...(event.data ? { data: Object.freeze({ ...event.data }) } : {}),
      })
      events.push(entry)
      return entry
    },

    snapshot(): readonly HarnessObservableEvent[] {
      return Object.freeze([...events])
    },
  })
}
