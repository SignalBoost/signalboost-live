import type { CachedResponse, EmbeddingGenerator, KnowledgeStore } from './types'

function stripVolatileRankingScores(value: string): string {
  return String(value ?? '')
    .replace(/;\s*(?:similarity|relevance)\s+-?\d+(?:\.\d+)?/gi, '')
    .replace(/(?:similarity|relevance)\s+-?\d+(?:\.\d+)?;\s*/gi, '')
    .replace(/\[(?:similarity|relevance)\s+-?\d+(?:\.\d+)?\]/gi, '')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

/**
 * Ranking scores describe one retrieval pass; they are not part of the durable evidence itself.
 * Cache embeddings must therefore ignore those volatile scores or identical prompts can generate
 * different cache vectors merely because relevance moved from, for example, 0.71 to 0.73.
 * Material evidence text, confidence, status, source and ordering remain intact and still invalidate
 * the cache naturally when they actually change.
 */
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
      return nearestMatch && nearestMatch.similarityScore >= this.similarityThreshold ? nearestMatch : null
    } catch (error) {
      this.dependencies.onError?.(error)
      return null
    }
  }

  async commitToMemory(taskId: string, prompt: string, contextWindow: string, responsePayload: unknown): Promise<void> {
    try {
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
