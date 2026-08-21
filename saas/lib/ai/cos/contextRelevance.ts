import { generateLocalEmbeddings } from '@/lib/ai/cos/localEmbeddings'
import { touchRunpodActivityLease } from '@/lib/ai/cos/runpodActivityLease'
import { ensureLocalInferenceRuntimeReady } from '@/lib/ai/local-inference'
import { FOUNDATIONAL_KNOWLEDGE_DOMAINS } from '@/lib/cos-core/layers/learning/foundational'

const STOP = new Set([
  'about','after','again','also','because','before','being','could','does','from','have','into','more','most','should','that','their','there','these','they','this','those','through','under','what','when','where','which','while','with','would','your','you','and','the','for','are','how','why','only','normal','unchanged','without','suddenly','shows','showed','occurred','overall','remain','remains',
])

export type ContextCandidate<T> = { item: T; text: string }
export type RankedContextCandidate<T> = ContextCandidate<T> & { similarity: number }
export type ContextRankResult<T> = {
  mode: 'semantic' | 'lexical-fallback'
  retrieved: number
  relevant: RankedContextCandidate<T>[]
}
export type FoundationalDomainMatch = { id: string; subject: string; score: number }

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

function normalizedDomainTerms(text: string): string[] {
  const values = relevanceTerms(text).flatMap(term => term.split('-'))
  return [...new Set(values.map(term => {
    if (term.length > 5 && term.endsWith('s') && !term.endsWith('ss')) return term.slice(0, -1)
    return term
  }).filter(term => term.length >= 4))]
}

export function foundationalDomainMatches(text: string, limit = 2): FoundationalDomainMatch[] {
  const wanted = normalizedDomainTerms(text)
  if (!wanted.length) return []
  return FOUNDATIONAL_KNOWLEDGE_DOMAINS
    .map(domain => {
      const subjectTerms = new Set(normalizedDomainTerms(domain.subject))
      const questionTerms = new Set(normalizedDomainTerms(domain.questions.join(' ')))
      const score = wanted.reduce((total, term) => total + (subjectTerms.has(term) ? 2 : questionTerms.has(term) ? 1 : 0), 0)
      return { id: domain.id, subject: domain.subject, score }
    })
    .filter(match => match.score >= 2)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, Math.max(1, limit))
}

function normalizedOverlapCount(query: string, candidate: string): number {
  const queryTerms = normalizedDomainTerms(query)
  const candidateTerms = new Set(normalizedDomainTerms(candidate))
  return queryTerms.filter(term => candidateTerms.has(term)).length
}

function unknownDomainCompatible(query: string, candidate: string): boolean {
  const queryTerms = normalizedDomainTerms(query)
  if (!queryTerms.length) return false
  const requiredOverlap = Math.min(2, Math.max(1, queryTerms.length))
  return normalizedOverlapCount(query, candidate) >= requiredOverlap
}

/**
 * First-pass domain gate for durable context. Semantic similarity alone is too permissive for a
 * mixed technical corpus: unrelated healthcare, robotics, marketing and cybersecurity material can
 * all look vaguely "technical" to an embedding model. Keep candidates that share one of the query's
 * top foundational domains. If the query itself cannot be mapped to a known domain, fail
 * conservatively: require lexical anchors instead of treating every candidate as domain-compatible.
 * If a candidate cannot be classified, also require two meaningful lexical anchors before allowing
 * semantic ranking to decide.
 */
export function domainCompatibleContext(query: string, candidate: string): boolean {
  const queryDomains = foundationalDomainMatches(query, 2)
  if (!queryDomains.length) return unknownDomainCompatible(query, candidate)
  const candidateDomains = foundationalDomainMatches(candidate, 2)
  if (candidateDomains.length) {
    const allowed = new Set(queryDomains.map(match => match.id))
    return candidateDomains.some(match => allowed.has(match.id))
  }
  return normalizedOverlapCount(query, candidate) >= 2
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
 * Domain-gate a bounded lexical prefetch, then re-rank the survivors semantically with ONE local
 * embeddings call. Mark the work in the same durable activity clock used by RunPod idle-stop, then
 * wake through Qwen's bounded readiness gate. If semantic ranking is unavailable, fail conservative
 * with lexical overlap. `retrieved` remains the caller's original candidate count so provenance shows
 * how much the domain gate removed before semantic relevance.
 */
export async function rankContextCandidates<T>(
  query: string,
  candidates: ContextCandidate<T>[],
  options: { threshold: number; limit: number },
): Promise<ContextRankResult<T>> {
  if (candidates.length === 0) return { mode: 'semantic', retrieved: 0, relevant: [] }
  const domainCandidates = candidates.filter(candidate => domainCompatibleContext(query, candidate.text))
  if (domainCandidates.length === 0) return { mode: 'semantic', retrieved: candidates.length, relevant: [] }
  try {
    await touchRunpodActivityLease('semantic_context_ranking')
    await ensureLocalInferenceRuntimeReady()
    const vectors = await generateLocalEmbeddings([query, ...domainCandidates.map(candidate => candidate.text)])
    const queryVector = vectors[0] ?? []
    const ranked = rankByVectors(domainCandidates, queryVector, vectors.slice(1), options.threshold).slice(0, options.limit)
    return { mode: 'semantic', retrieved: candidates.length, relevant: ranked }
  } catch (error) {
    console.warn('contextRelevance: local semantic rank unavailable; using conservative lexical fallback', error)
    const queryTerms = relevanceTerms(query)
    const minimumOverlap = Math.min(2, Math.max(1, queryTerms.length))
    const relevant = domainCandidates
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
