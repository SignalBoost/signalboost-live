// Canonical deterministic ranking for Enterprise Memory retrieval.
// Pure and provider-neutral: callers supply sanitized candidates from memory stores.

export type EnterpriseMemoryKind =
  | 'organization'
  | 'intelligence'
  | 'repository'
  | 'campaign'
  | 'approval'
  | 'confidence'
  | 'audience'
  | 'product'
  | 'strategy_profile'

export type EnterpriseMemoryCandidate = {
  id: string
  kind: EnterpriseMemoryKind
  workspace?: string | null
  confidence?: number | null
  approved?: boolean
  performanceScore?: number | null
  occurredAt?: string | null
  taskTags?: readonly string[]
  payload: Record<string, unknown>
}

export type EnterpriseMemoryRetrievalQuery = {
  workspace?: string | null
  taskTags?: readonly string[]
  now?: number
  limit?: number
}

export type RankedEnterpriseMemory = EnterpriseMemoryCandidate & {
  score: number
  reasons: readonly string[]
}

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_AGE_MS = 365 * DAY_MS

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function clamp01(value: unknown): number {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.min(1, Math.max(0, number))
}

function normalizeTags(values?: readonly string[]): Set<string> {
  return new Set((values || []).map(clean).filter(Boolean))
}

function recencyScore(occurredAt: string | null | undefined, now: number): number {
  if (!occurredAt) return 0
  const timestamp = Date.parse(occurredAt)
  if (!Number.isFinite(timestamp) || timestamp > now) return 0
  const age = now - timestamp
  if (age >= MAX_AGE_MS) return 0
  return 1 - age / MAX_AGE_MS
}

function taskMatchScore(candidateTags: readonly string[] | undefined, queryTags: Set<string>): number {
  if (!queryTags.size) return 0
  const candidate = normalizeTags(candidateTags)
  if (!candidate.size) return 0
  let matches = 0
  for (const tag of queryTags) if (candidate.has(tag)) matches += 1
  return matches / queryTags.size
}

export function rankEnterpriseMemoryCandidates(
  candidates: readonly EnterpriseMemoryCandidate[],
  query: EnterpriseMemoryRetrievalQuery = {},
): RankedEnterpriseMemory[] {
  const now = query.now ?? Date.now()
  const limit = query.limit ?? 8
  if (!Number.isFinite(now)) throw new Error('Enterprise Memory retrieval clock must be finite.')
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    throw new Error('Enterprise Memory retrieval limit must be an integer from 1 to 50.')
  }

  const workspace = clean(query.workspace)
  const queryTags = normalizeTags(query.taskTags)
  const seen = new Set<string>()

  return candidates
    .filter(candidate => Boolean(clean(candidate.id)))
    .filter(candidate => {
      const key = `${candidate.kind}:${clean(candidate.id)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map(candidate => {
      const reasons: string[] = []
      let score = 0

      const confidence = clamp01(candidate.confidence)
      score += confidence * 35
      if (confidence > 0) reasons.push(`confidence:${confidence.toFixed(2)}`)

      if (candidate.approved) {
        score += 25
        reasons.push('human_approved')
      }

      const performance = clamp01(candidate.performanceScore)
      score += performance * 20
      if (performance > 0) reasons.push(`performance:${performance.toFixed(2)}`)

      const recency = recencyScore(candidate.occurredAt, now)
      score += recency * 10
      if (recency > 0) reasons.push(`recency:${recency.toFixed(2)}`)

      const candidateWorkspace = clean(candidate.workspace)
      if (workspace && candidateWorkspace === workspace) {
        score += 5
        reasons.push('workspace_match')
      } else if (workspace && candidateWorkspace) {
        score -= 5
        reasons.push('workspace_mismatch')
      }

      const taskMatch = taskMatchScore(candidate.taskTags, queryTags)
      score += taskMatch * 5
      if (taskMatch > 0) reasons.push(`task_match:${taskMatch.toFixed(2)}`)

      return {
        ...candidate,
        score: Math.round(score * 100) / 100,
        reasons: Object.freeze(reasons),
      }
    })
    .sort((a, b) => b.score - a.score || clean(a.id).localeCompare(clean(b.id)))
    .slice(0, limit)
}
