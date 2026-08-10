import { deterministicMemoryCompactor } from './deterministic-compactor'
import type {
  ChatMessage,
  CompressedMemorySnapshot,
  MemoryCompactor,
} from './types'

export class MemoryLayer {
  constructor(
    private readonly compact: MemoryCompactor = deterministicMemoryCompactor,
    private readonly maxRawTurns = 6,
    private readonly highFidelityTurns = 2,
  ) {}

  async processMemoryLayer(
    sessionId: string,
    currentMessages: ChatMessage[],
    existingSnapshot?: CompressedMemorySnapshot,
  ): Promise<ChatMessage[]> {
    if (currentMessages.length <= this.maxRawTurns) return [...currentMessages]

    const splitAt = Math.max(0, currentMessages.length - this.highFidelityTurns)
    const turnsToCompress = currentMessages.slice(0, splitAt)
    const rollingHighFidelityTurns = currentMessages.slice(splitAt)
    const snapshot = await this.compact({ sessionId, oldTurns: turnsToCompress, priorSnapshot: existingSnapshot })

    return [{
      role: 'system',
      content: [
        '[COS OPERATING SYSTEM CONTEXT SYSTEM SNAPSHOT]',
        `Core History Summary: ${snapshot.summary}`,
        `Known State Attributes: ${snapshot.extractedFacts.join(' | ')}`,
      ].join('\n'),
    }, ...rollingHighFidelityTurns]
  }
}

export * from './deterministic-compactor'
export * from './summary-cache'
export type { ChatMessage, CompressedMemorySnapshot, MemoryCompactor } from './types'
