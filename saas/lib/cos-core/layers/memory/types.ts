export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  name?: string
}

export interface CompressedMemorySnapshot {
  sessionId: string
  summary: string
  extractedFacts: string[]
  recentMessages: ChatMessage[]
}

export type MemoryCompactor = (input: {
  sessionId: string
  oldTurns: ChatMessage[]
  priorSnapshot?: CompressedMemorySnapshot
}) => Promise<CompressedMemorySnapshot>
