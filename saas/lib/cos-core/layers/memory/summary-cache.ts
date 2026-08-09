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

/** Prevents paying repeatedly to summarize unchanged conversation history. */
export function withContextSummaryCache(compactor: MemoryCompactor, store: ContextSummaryStore): MemoryCompactor {
  return async (input) => {
    const key = summaryKey(input.sessionId, input.oldTurns, input.priorSnapshot)
    const cached = await store.get(key)
    if (cached) return cached

    const snapshot = await compactor(input)
    await store.set(key, snapshot)
    return snapshot
  }
}
