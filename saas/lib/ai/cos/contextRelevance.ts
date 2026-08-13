import { generateLocalEmbeddings } from '@/lib/ai/cos/localEmbeddings'

const STOP = new Set([
  'about','after','again','also','because','before','being','could','does','from','have','into','more','most','should','that','their','there','these','they','this','those','through','under','what','when','where','which','while','with','would','your','you','and','the','for','are','how','why','only','normal','unchanged','without',
])

export type ContextCandidate<T> = { item: T; text: string }
export type RankedContextCandidate<T> = ContextCandidate<T> & { similarity: number }
export type ContextRankResult<T> = {
  mode: 'semantic' | 'lexical-fallback'
  retrieved: number
  relevant: RankedContextCandidate<T>[]
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return -1
  let dot = 0
  let aa = 0
  let bb = 0
  for (let i = 0; i < a.length; i += 1) {
    const av = Number(a[i] ?? 0)
    const bv = Number(b[i] ?? 0)
    dot += av * bv
    aa += av * av
    bb += bv * bv
  }
  if (!aa || !bb) return -1
  return dot / (Math.sqrt(aa) * Math.sqrt(bb))
}

export function relevanceTerms(text: string): string[] {
  return [...new Set(
    String(text ?? '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_-]+/gu, ' ')
      .split(/\s+/)
      .map(value => value.trim())
      .filter(value => value.length >= 4 && !STOP.has(value)),
  )].slice(0, 16)
}

export function lexicalOverlapScore(query: string, candidate: string): number {
  const q = relevanceTerms(query)
  if (q.length === 0) return 0
  const c = new Set(relevanceTerms(candidate))
  const overlap = q.filter(term => c.has(term)).length
  return overlap / q.length
}

export function rankByVectors<T>(
  candidates: ContextCandidate<T>[],
  queryVector: number[],
  candidateVectors: number[][],
  threshold: number,
): RankedContextCandidate<T>[] {
  return candidates
    .map((candidate, index) => ({ ...candidate, similarity: cosineSimilarity(queryVector, candidateVectors[index] ?? []) }))
    .filter(candidate => candidate.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
}

/**
 * Re-rank a bounded lexical prefetch semantically with ONE local embeddings call. If the local
 * embedding endpoint is unavailable, fail conservative: require at least two meaningful query-term
 * matches instead of declaring every SQL ILIKE hit relevant.
 */
export async function rankContextCandidates<T>(
  query: string,
  candidates: ContextCandidate<T>[],
  options: { threshold: number; limit: number },
): Promise<ContextRankResult<T>> {
  if (candidates.length === 0) return { mode: 'semantic', retrieved: 0, relevant: [] }
  try {
    const vectors = await generateLocalEmbeddings([query, ...candidates.map(candidate => candidate.text)])
    const queryVector = vectors[0] ?? []
    const ranked = rankByVectors(candidates, queryVector, vectors.slice(1), options.threshold).slice(0, options.limit)
    return { mode: 'semantic', retrieved: candidates.length, relevant: ranked }
  } catch (error) {
    console.warn('contextRelevance: local semantic rank unavailable; using conservative lexical fallback', error)
    const queryTerms = relevanceTerms(query)
    const minimumOverlap = Math.min(2, Math.max(1, queryTerms.length))
    const relevant = candidates
      .map(candidate => {
        const textTerms = new Set(relevanceTerms(candidate.text))
        const overlap = queryTerms.filter(term => textTerms.has(term)).length
        return { ...candidate, similarity: queryTerms.length ? overlap / queryTerms.length : 0, overlap }
      })
      .filter(candidate => candidate.overlap >= minimumOverlap)
      .sort((a, b) => b.overlap - a.overlap || b.similarity - a.similarity)
      .slice(0, options.limit)
      .map(({ overlap: _overlap, ...candidate }) => candidate)
    return { mode: 'lexical-fallback', retrieved: candidates.length, relevant }
  }
}
