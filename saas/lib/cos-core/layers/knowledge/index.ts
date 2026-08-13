import type { CachedResponse, EmbeddingGenerator, KnowledgeStore } from './types'

function stripVolatileRankingScores(value: string): string {
  return String(value ?? '')
    .replace(/;\s*(?:similarity|relevance)\s+-?\d+(?:\.\d+)?/gi, '')
    .replace(/(?:similarity|relevance)\s+-?\d+(?:\.\d+)?;\s*/gi, '')
    .replace(/\[(?:similarity|relevance)\s+-?\d+(?:\.\d+)?\]/gi, '')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

export function canonicalizeSemanticCacheContext(contextWindow: string): string {
  return String(contextWindow ?? '')
    .split('\n')
    .map(stripVolatileRankingScores)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function semanticEmbeddingInput(prompt: string, contextWindow: string): string {
  const stableContext = canonicalizeSemanticCacheContext(contextWindow)
  return stableContext ? `${stableContext}\n${prompt}` : String(prompt ?? '')
}

function responseUsesUserMemory(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false
  const origin = (payload as Record<string, unknown>).origin
  if (!origin || typeof origin !== 'object' || Array.isArray(origin)) return false
  return Number((origin as Record<string, unknown>).userMemoriesUsed || 0) > 0
}

export class KnowledgeLayer {
  constructor(private readonly dependencies: {
    generateEmbedding: EmbeddingGenerator
    store: KnowledgeStore
    similarityThreshold?: number
    onError?: (error: unknown) => void
  }) {}

  private get similarityThreshold() { return this.dependencies.similarityThreshold ?? 0.96 }

  async lookupSemanticCache(taskId: string, prompt: string, contextWindow: string): Promise<CachedResponse | null> {
    try {
      const embedding = await this.dependencies.generateEmbedding(semanticEmbeddingInput(prompt, contextWindow))
      const nearestMatch = await this.dependencies.store.queryNearest(embedding, { taskId })
      if (!nearestMatch || nearestMatch.similarityScore < this.similarityThreshold) return null
      if (responseUsesUserMemory(nearestMatch.responsePayload)) return null
      return nearestMatch
    } catch (error) {
      this.dependencies.onError?.(error)
      return null
    }
  }

  async commitToMemory(taskId: string, prompt: string, contextWindow: string, responsePayload: unknown): Promise<void> {
    try {
      if (responseUsesUserMemory(responsePayload)) return
      const stableContext = canonicalizeSemanticCacheContext(contextWindow)
      const embedding = await this.dependencies.generateEmbedding(semanticEmbeddingInput(prompt, stableContext))
      await this.dependencies.store.save({ taskId, promptText: prompt, contextText: stableContext, embeddingVector: embedding, responseData: responsePayload, createdAt: new Date() })
    } catch (error) {
      this.dependencies.onError?.(error)
    }
  }
}

export * from './persistent'
export type { CachedResponse, EmbeddingGenerator, KnowledgeRecord, KnowledgeStore } from './types'
