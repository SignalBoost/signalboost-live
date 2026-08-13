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

function cachedReply(payload: unknown): string {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return ''
  return String((payload as Record<string, unknown>).reply ?? '')
}

function citedLabels(payload: unknown): string[] {
  const seen = new Set<string>()
  const labels: string[] = []
  for (const match of cachedReply(payload).matchAll(/\[(KG|CL|EM|SK)(\d{1,2})\]/g)) {
    const label = `${match[1]}${match[2]}`
    if (seen.has(label)) continue
    seen.add(label)
    labels.push(label)
  }
  return labels
}

function labelledContext(contextWindow: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const line of canonicalizeSemanticCacheContext(contextWindow).split('\n')) {
    const match = line.match(/^\[(KG|CL|EM|SK)(\d{1,2})\]\s/)
    if (match) map.set(`${match[1]}${match[2]}`, line)
  }
  return map
}

export function citedCacheContextStillCurrent(payload: unknown, storedContext: string, currentContext: string): boolean {
  const labels = citedLabels(payload)
  if (!labels.length) return false
  const stored = labelledContext(storedContext)
  const current = labelledContext(currentContext)
  return labels.every(label => stored.has(label) && current.has(label) && stored.get(label) === current.get(label))
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
      const stableContext = canonicalizeSemanticCacheContext(contextWindow)
      const exact = await this.dependencies.store.queryExact?.({ taskId, prompt })
      if (exact && !responseUsesUserMemory(exact.responsePayload)) {
        const exactContext = canonicalizeSemanticCacheContext(exact.contextText ?? '')
        const exactContextCurrent = exactContext === stableContext
          || citedCacheContextStillCurrent(exact.responsePayload, exactContext, stableContext)
        if (exactContextCurrent) return { ...exact, similarityScore: 1 }
      }

      const embedding = await this.dependencies.generateEmbedding(semanticEmbeddingInput(prompt, stableContext))
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
