import { createHash } from 'node:crypto'
import type { ChatMessage, CompressedMemorySnapshot, MemoryCompactor } from './types'

export interface ContextSummaryStore {
  get(key: string): Promise<CompressedMemorySnapshot | null>
  set(key: string, snapshot: CompressedMemorySnapshot): Promise<void>
}

function summaryKey(sessionId: string, messages: ChatMessage[], prior?: CompressedMemorySnapshot) {
  const payload = JSON.stringify({ sessionId, messages, prior })
  return `cos:summary:v1:${createHash('sha256').update(payload).digest('hex')}`
}

const inFlightSummaries = new Map<string, Promise<CompressedMemorySnapshot>>()

/**
 * Summary caching is an optimization only: reads/writes fail open, and
 * identical concurrent history is compacted once per process.
 */
export function withContextSummaryCache(
  compactor: MemoryCompactor,
  store: ContextSummaryStore,
  onError?: (error: unknown) => void,
): MemoryCompactor {
  return async (input) => {
    const key = summaryKey(input.sessionId, input.oldTurns, input.priorSnapshot)

    try {
      const cached = await store.get(key)
      if (cached) return cached
    } catch (error) {
      onError?.(error)
    }

    const existing = inFlightSummaries.get(key)
    if (existing) return existing

    const execution = (async () => {
      const snapshot = await compactor(input)
      try {
        await store.set(key, snapshot)
      } catch (error) {
        onError?.(error)
      }
      return snapshot
    })()

    inFlightSummaries.set(key, execution)
    try {
      return await execution
    } finally {
      inFlightSummaries.delete(key)
    }
  }
}
