import type { SupabaseClient } from '@supabase/supabase-js'
import type { EmbeddingGenerator } from '@/lib/cos-core/layers/knowledge'
import type { CompressedMemorySnapshot, MemoryCompactor } from '@/lib/cos-core/layers/memory'
import { createPersistentCOSRuntime } from '@/lib/cos-core/storage'
import { createPlatformAiPort } from '@/lib/cos/aiPort'

export type PlatformPersistentCOSRuntimeOptions = {
  generateEmbedding: EmbeddingGenerator
  compactMemory?: MemoryCompactor
  db?: SupabaseClient | null
  similarityThreshold?: number
  exactCacheTtlMs?: number | null
  maxRawTurns?: number
  highFidelityTurns?: number
  onError?: (error: unknown) => void
}

function extractJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const value = JSON.parse(trimmed.slice(start, end + 1))
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

function validMemorySummary(text: string): boolean {
  const parsed = extractJson(text)
  return typeof parsed?.summary === 'string'
    && parsed.summary.trim().length > 0
    && Array.isArray(parsed.extractedFacts)
}

function fallbackSnapshot(input: Parameters<MemoryCompactor>[0]): CompressedMemorySnapshot {
  const priorFacts = input.priorSnapshot?.extractedFacts ?? []
  const compact = input.oldTurns
    .map((message) => `${message.role}: ${message.content}`)
    .join('\n')
    .slice(-6_000)
  return {
    sessionId: input.sessionId,
    summary: [input.priorSnapshot?.summary, compact].filter(Boolean).join('\n').slice(-8_000),
    extractedFacts: priorFacts.slice(-100),
    recentMessages: [],
  }
}

/**
 * Default production compactor. Summaries themselves enter COS, so unchanged
 * history is satisfied by the durable summary cache/text gateway instead of
 * repeatedly paying an external model. A provider outage degrades to bounded
 * deterministic compaction rather than breaking the request.
 */
export function createPlatformMemoryCompactor(): MemoryCompactor {
  const ai = createPlatformAiPort()
  return async (input) => {
    const prompt = JSON.stringify({
      priorSummary: input.priorSnapshot?.summary ?? '',
      priorFacts: input.priorSnapshot?.extractedFacts ?? [],
      turns: input.oldTurns,
    })
    try {
      const raw = await ai.generate({
        taskId: 'cos-context-summary',
        modelPreference: 'openai',
        systemPrompt: [
          'Compress conversation history for the SignalBoost Cognitive Operating System.',
          'Preserve decisions, constraints, durable facts, unresolved work, and identifiers.',
          'Do not invent facts. Return JSON only: {"summary":string,"extractedFacts":string[]}.',
        ].join(' '),
        prompt,
        maxTokens: 1_200,
        cacheValidator: validMemorySummary,
      })
      const parsed = extractJson(raw)
      if (!parsed) return fallbackSnapshot(input)
      return {
        sessionId: input.sessionId,
        summary: String(parsed.summary || '').trim(),
        extractedFacts: (parsed.extractedFacts as unknown[]).map(String).filter(Boolean).slice(0, 100),
        recentMessages: [],
      }
    } catch (error) {
      return fallbackSnapshot(input)
    }
  }
}

/**
 * SignalBoost production composition root: persistent semantic knowledge,
 * knowledge graph, learning, automatic cached summaries, exact cache, and ROI.
 */
export function createPlatformPersistentCOSRuntime(options: PlatformPersistentCOSRuntimeOptions) {
  return createPersistentCOSRuntime({
    ...options,
    compactMemory: options.compactMemory ?? createPlatformMemoryCompactor(),
  })
}
