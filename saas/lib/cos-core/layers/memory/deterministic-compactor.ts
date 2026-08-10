import type { ChatMessage, CompressedMemorySnapshot, MemoryCompactor } from './types'

const MAX_SUMMARY_CHARS = 2400
const MAX_FACTS = 24
const MAX_RECENT_MESSAGES = 4

function clean(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function unique(values: string[]): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  for (const value of values) {
    const normalized = clean(value)
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    output.push(normalized)
  }
  return output
}

function factCandidates(messages: ChatMessage[]): string[] {
  const candidates: string[] = []
  const factPattern = /\b(?:is|are|has|have|uses|use|needs|need|wants|want|prefers|prefer|requires|require|must|should|will|goal|target|deadline|budget|owner|email|url|domain)\b/i

  for (const message of messages) {
    if (message.role === 'tool') continue
    const sentences = message.content
      .split(/(?<=[.!?])\s+|\n+/)
      .map(clean)
      .filter(sentence => sentence.length >= 12 && sentence.length <= 280)

    for (const sentence of sentences) {
      if (factPattern.test(sentence)) candidates.push(sentence)
    }
  }

  return unique(candidates).slice(-MAX_FACTS)
}

function buildSummary(messages: ChatMessage[], prior?: CompressedMemorySnapshot): string {
  const segments: string[] = []
  if (prior?.summary) segments.push(clean(prior.summary))

  for (const message of messages) {
    if (message.role === 'tool') continue
    const text = clean(message.content)
    if (!text) continue
    const prefix = message.role === 'user' ? 'User' : message.role === 'assistant' ? 'COS' : 'System'
    segments.push(`${prefix}: ${text}`)
  }

  const merged = segments.join(' | ')
  if (merged.length <= MAX_SUMMARY_CHARS) return merged
  return merged.slice(merged.length - MAX_SUMMARY_CHARS)
}

/**
 * Zero-provider memory compaction for COS. It preserves recent context,
 * carries forward prior facts, and extracts bounded factual statements using
 * deterministic rules. No AI/LLM/provider call is made here.
 */
export const deterministicMemoryCompactor: MemoryCompactor = async ({ sessionId, oldTurns, priorSnapshot }) => {
  const priorFacts = priorSnapshot?.extractedFacts ?? []
  const extractedFacts = unique([...priorFacts, ...factCandidates(oldTurns)]).slice(-MAX_FACTS)
  const recentMessages = oldTurns.slice(-MAX_RECENT_MESSAGES).map(message => ({ ...message, content: clean(message.content) }))

  return {
    sessionId,
    summary: buildSummary(oldTurns, priorSnapshot),
    extractedFacts,
    recentMessages,
  }
}
