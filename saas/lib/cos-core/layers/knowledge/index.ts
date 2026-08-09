import type {
  CachedResponse,
  EmbeddingGenerator,
  KnowledgeStore,
} from './types'

export class KnowledgeLayer {
  constructor(
    private readonly dependencies: {
      generateEmbedding: EmbeddingGenerator
      store: KnowledgeStore
      similarityThreshold?: number
      onError?: (error: unknown) => void
    },
  ) {}

  private get similarityThreshold() {
    return this.dependencies.similarityThreshold ?? 0.96
  }

  async lookupSemanticCache(
    taskId: string,
    prompt: string,
    contextWindow: string,
  ): Promise<CachedResponse | null> {
    try {
      const embedding = await this.dependencies.generateEmbedding(`${contextWindow}\n${prompt}`)
      const nearestMatch = await this.dependencies.store.queryNearest(embedding, { taskId })
      if (nearestMatch && nearestMatch.similarityScore >= this.similarityThreshold) {
        return nearestMatch
      }
      return null
    } catch (error) {
      this.dependencies.onError?.(error)
      return null
    }
  }

  async commitToMemory(
    taskId: string,
    prompt: string,
    contextWindow: string,
    responsePayload: unknown,
  ): Promise<void> {
    try {
      const embedding = await this.dependencies.generateEmbedding(`${contextWindow}\n${prompt}`)
      await this.dependencies.store.save({
        taskId,
        promptText: prompt,
        contextText: contextWindow,
        embeddingVector: embedding,
        responseData: responsePayload,
        createdAt: new Date(),
      })
    } catch (error) {
      // Knowledge persistence is an optimization. A cache failure must never
      // turn a successful user operation into a failed request.
      this.dependencies.onError?.(error)
    }
  }
}

export type { CachedResponse, EmbeddingGenerator, KnowledgeRecord, KnowledgeStore } from './types'
