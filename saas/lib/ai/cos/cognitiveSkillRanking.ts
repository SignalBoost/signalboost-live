import { generateLocalEmbeddings } from '@/lib/ai/cos/localEmbeddings'
import {
  cosineSimilarity,
  domainCompatibleContext,
  relevanceTerms,
  type ContextCandidate,
  type RankedContextCandidate,
} from '@/lib/ai/cos/contextRelevance'
import { touchRunpodActivityLease } from '@/lib/ai/cos/runpodActivityLease'
import { ensureLocalInferenceRuntimeReady } from '@/lib/ai/local-inference'

const MAX_CACHED_SKILL_EMBEDDINGS = 128
const candidateEmbeddingCache = new Map<string, number[]>()

function embeddingModelIdentity(): string {
  return String(process.env.LOCAL_AI_EMBEDDING_MODEL || 'unknown-embedding-model').trim()
}

function cacheKey(text: string): string {
  return `${embeddingModelIdentity()}\u0000${text}`
}

function remember(key: string, vector: number[]): void {
  if (!vector.length) return
  if (candidateEmbeddingCache.has(key)) candidateEmbeddingCache.delete(key)
  candidateEmbeddingCache.set(key, vector)
  while (candidateEmbeddingCache.size > MAX_CACHED_SKILL_EMBEDDINGS) {
    const oldest = candidateEmbeddingCache.keys().next().value
    if (!oldest) break
    candidateEmbeddingCache.delete(oldest)
  }
}

function lexicalFallback<T>(
  query: string,
  candidates: ContextCandidate<T>[],
  limit: number,
): RankedContextCandidate<T>[] {
  const queryTerms = relevanceTerms(query)
  const minimumOverlap = Math.min(2, Math.max(1, queryTerms.length))
  return candidates
    .map(candidate => {
      const textTerms = new Set(relevanceTerms(candidate.text))
      const overlap = queryTerms.filter(term => textTerms.has(term)).length
      return { ...candidate, similarity: queryTerms.length ? overlap / queryTerms.length : 0, overlap }
    })
    .filter(candidate => candidate.overlap >= minimumOverlap)
    .sort((a, b) => b.overlap - a.overlap || b.similarity - a.similarity)
    .slice(0, limit)
    .map(({ overlap: _overlap, ...candidate }) => candidate)
}

export type CognitiveSkillRankResult<T> = {
  mode: 'semantic' | 'lexical-fallback'
  retrieved: number
  domainCandidates: number
  cachedCandidateEmbeddings: number
  generatedCandidateEmbeddings: number
  relevant: RankedContextCandidate<T>[]
}

/**
 * Cognitive procedures are durable while user prompts are not. Re-embedding the same validated
 * procedure on every turn wastes inference capacity without improving selection. This ranker keeps
 * the query embedding fresh, reuses only exact-text candidate embeddings under the active embedding
 * model identity, and preserves the existing domain gate, cosine threshold and lexical fail-closed
 * fallback semantics.
 */
export async function rankCognitiveSkillCandidates<T>(
  query: string,
  candidates: ContextCandidate<T>[],
  options: { threshold: number; limit: number },
): Promise<CognitiveSkillRankResult<T>> {
  if (!candidates.length) {
    return { mode: 'semantic', retrieved: 0, domainCandidates: 0, cachedCandidateEmbeddings: 0, generatedCandidateEmbeddings: 0, relevant: [] }
  }

  const domainCandidates = candidates.filter(candidate => domainCompatibleContext(query, candidate.text))
  if (!domainCandidates.length) {
    return { mode: 'semantic', retrieved: candidates.length, domainCandidates: 0, cachedCandidateEmbeddings: 0, generatedCandidateEmbeddings: 0, relevant: [] }
  }

  const keys = domainCandidates.map(candidate => cacheKey(candidate.text))
  const missingIndexes = keys.flatMap((key, index) => candidateEmbeddingCache.has(key) ? [] : [index])
  const cachedCandidateEmbeddings = domainCandidates.length - missingIndexes.length

  try {
    await touchRunpodActivityLease('cognitive_skill_semantic_ranking')
    await ensureLocalInferenceRuntimeReady()

    const embeddingInputs = [query, ...missingIndexes.map(index => domainCandidates[index]!.text)]
    const vectors = await generateLocalEmbeddings(embeddingInputs)
    const queryVector = vectors[0] ?? []
    if (!queryVector.length) throw new Error('cognitive_skill_query_embedding_missing')

    missingIndexes.forEach((candidateIndex, vectorIndex) => {
      const vector = vectors[vectorIndex + 1] ?? []
      if (!vector.length) throw new Error('cognitive_skill_candidate_embedding_missing')
      remember(keys[candidateIndex]!, vector)
    })

    const relevant = domainCandidates
      .map((candidate, index) => ({
        ...candidate,
        similarity: cosineSimilarity(queryVector, candidateEmbeddingCache.get(keys[index]!) ?? []),
      }))
      .filter(candidate => candidate.similarity >= options.threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, options.limit)

    return {
      mode: 'semantic',
      retrieved: candidates.length,
      domainCandidates: domainCandidates.length,
      cachedCandidateEmbeddings,
      generatedCandidateEmbeddings: missingIndexes.length,
      relevant,
    }
  } catch (error) {
    console.warn('[cos-cognitive-skill-ranking] semantic rank unavailable; using conservative lexical fallback', error)
    return {
      mode: 'lexical-fallback',
      retrieved: candidates.length,
      domainCandidates: domainCandidates.length,
      cachedCandidateEmbeddings,
      generatedCandidateEmbeddings: 0,
      relevant: lexicalFallback(query, domainCandidates, options.limit),
    }
  }
}

export function clearCognitiveSkillEmbeddingCacheForTests(): void {
  candidateEmbeddingCache.clear()
}

export function cognitiveSkillEmbeddingCacheSizeForTests(): number {
  return candidateEmbeddingCache.size
}
