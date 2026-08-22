// Applied knowledge: newly retained evidence can only reopen a dormant question
// for a normal governed retest. It never answers or resolves the question itself.

export type RetainedKnowledgeRow = {
  contentHash: string
  subject: string
  summary: string
  sourceKind: string
  sourceTitle?: string | null
  observedAt?: string | null
  createdAt?: string | null
  confidence?: number | null
}

export type DormantQuestionRow = {
  id: string
  subject: string
  question: string
  status: string
  autopsyVerdict?: string | null
  autopsyAt?: string | null
  lastSeenAt?: string | null
  attemptCount?: number | null
  reopenedCount?: number | null
}

export type ApplicationVerdict =
  | 'reopen_and_retest'
  | 'insufficient_overlap'
  | 'evidence_predates_failure'
  | 'source_confidence_too_low'
  | 'not_reopenable'
  | 'reopen_limit_reached'
  | 'no_new_evidence'

export type ApplicationCandidate = {
  gapId: string
  gapSubject: string
  gapQuestion: string
  contentHash: string | null
  sourceKind: string | null
  sourceTitle: string | null
  matchedTerms: string[]
  coverage: number
  verdict: ApplicationVerdict
  rationale: string
}

export const MINIMUM_MATCHED_TERMS = 2
export const MINIMUM_COVERAGE = 0.25
export const MINIMUM_SOURCE_CONFIDENCE = 0.6
export const REOPEN_LIMIT = 2
export const MAX_REOPEN_PER_CYCLE = 3

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'against', 'also', 'among', 'because', 'been', 'before', 'being',
  'between', 'both', 'could', 'current', 'does', 'during', 'each', 'from', 'have', 'here', 'high',
  'how', 'into', 'like', 'made', 'make', 'many', 'more', 'most', 'much', 'must', 'need',
  'only', 'other', 'over', 'same', 'should', 'since', 'some', 'such', 'than', 'that', 'their',
  'them', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'under', 'until', 'used',
  'using', 'verified', 'very', 'what', 'when', 'where', 'which', 'while', 'with', 'within',
  'would', 'your', 'knowledge', 'evidence', 'confidence', 'independent', 'resolve', 'resolves',
  'missing', 'facts', 'concepts', 'practices', 'assumptions', 'adjacent', 'relationships',
  'failure', 'modes', 'cos', 'higher', 'locally', 'handle', 'important', 'recently', 'changed',
  'especially', 'around', 'validate', 'correct', 'extend', 'retained', 'update', 'updating', 'best',
])

function terms(value: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ')) {
    const word = raw.trim()
    if (word.length < 4 || STOP_WORDS.has(word) || /^[0-9]+$/.test(word) || seen.has(word)) continue
    seen.add(word)
    out.push(word)
  }
  return out
}

function timestamp(value: unknown): number | null {
  if (!value) return null
  const ms = new Date(String(value)).getTime()
  return Number.isFinite(ms) ? ms : null
}

function bounded(value: string, max: number): string {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

export function isReopenable(gap: DormantQuestionRow): boolean {
  const status = String(gap.status || '').toLowerCase()
  const verdict = String(gap.autopsyVerdict || '').toLowerCase()
  if (status === 'unstudyable' || verdict === 'malformed') return false
  if (status === 'retired') return true
  return status === 'failed' && Boolean(gap.autopsyAt)
}

export function dormantSince(gap: DormantQuestionRow): number | null {
  return timestamp(gap.autopsyAt) ?? timestamp(gap.lastSeenAt)
}

function knowledgeObservedAt(row: RetainedKnowledgeRow): number | null {
  return timestamp(row.observedAt) ?? timestamp(row.createdAt)
}

type Match = { row: RetainedKnowledgeRow; matched: string[]; coverage: number; anchored: boolean }

function bestMatch(gap: DormantQuestionRow, knowledge: RetainedKnowledgeRow[]): Match | null {
  const subjectTerms = new Set(terms(gap.subject))
  const questionTerms = terms(`${gap.subject} ${gap.question}`)
  if (!questionTerms.length) return null
  let best: Match | null = null
  for (const row of knowledge) {
    const haystack = new Set(terms(`${row.subject} ${row.sourceTitle || ''} ${row.summary}`))
    const matched = questionTerms.filter(term => haystack.has(term))
    if (!matched.length) continue
    const candidate: Match = {
      row,
      matched,
      coverage: matched.length / questionTerms.length,
      anchored: matched.some(term => subjectTerms.has(term)),
    }
    if (!best || (candidate.anchored && !best.anchored) ||
      (candidate.anchored === best.anchored && (candidate.matched.length > best.matched.length ||
        (candidate.matched.length === best.matched.length && candidate.coverage > best.coverage)))) best = candidate
  }
  return best
}

export function assessDormantQuestion(gap: DormantQuestionRow, knowledge: RetainedKnowledgeRow[]): ApplicationCandidate {
  const base = {
    gapId: gap.id, gapSubject: bounded(gap.subject, 180), gapQuestion: bounded(gap.question, 400),
    contentHash: null as string | null, sourceKind: null as string | null, sourceTitle: null as string | null,
    matchedTerms: [] as string[], coverage: 0,
  }
  if (!isReopenable(gap)) return { ...base, verdict: 'not_reopenable', rationale: `status=${bounded(gap.status, 40)} verdict=${bounded(String(gap.autopsyVerdict || 'none'), 40)}: terminal by shape, not by missing evidence` }
  const reopened = Math.max(0, Math.floor(Number(gap.reopenedCount ?? 0)))
  if (reopened >= REOPEN_LIMIT) return { ...base, verdict: 'reopen_limit_reached', rationale: `already reopened ${reopened} times without resolving; further matches indicate a matcher problem, not a study problem` }
  const match = bestMatch(gap, knowledge)
  if (!match) return { ...base, verdict: 'no_new_evidence', rationale: 'no newly retained record shares vocabulary with this question' }
  const withMatch = {
    ...base, contentHash: match.row.contentHash, sourceKind: bounded(match.row.sourceKind, 60),
    sourceTitle: bounded(String(match.row.sourceTitle || ''), 200) || null,
    matchedTerms: match.matched.slice(0, 12), coverage: Number(match.coverage.toFixed(3)),
  }
  const confidence = Number(match.row.confidence ?? 0)
  if (!Number.isFinite(confidence) || confidence < MINIMUM_SOURCE_CONFIDENCE) return { ...withMatch, verdict: 'source_confidence_too_low', rationale: `matching record confidence ${Number.isFinite(confidence) ? confidence.toFixed(2) : 'unknown'} is below ${MINIMUM_SOURCE_CONFIDENCE}` }
  const dormant = dormantSince(gap)
  const observed = knowledgeObservedAt(match.row)
  if (dormant !== null && observed !== null && observed <= dormant) return { ...withMatch, verdict: 'evidence_predates_failure', rationale: 'matching record was already retained when this question was retired; it was available to the cycle that failed' }
  if (!match.anchored) return { ...withMatch, verdict: 'insufficient_overlap', rationale: 'no term from the question subject appears in the record; shared vocabulary is incidental' }
  if (match.matched.length < MINIMUM_MATCHED_TERMS || match.coverage < MINIMUM_COVERAGE) return { ...withMatch, verdict: 'insufficient_overlap', rationale: `${match.matched.length} matched terms at ${(match.coverage * 100).toFixed(0)}% coverage is below the ${MINIMUM_MATCHED_TERMS}-term / ${(MINIMUM_COVERAGE * 100).toFixed(0)}% trigger` }
  return { ...withMatch, verdict: 'reopen_and_retest', rationale: `evidence retained after this question went dormant matches ${match.matched.length} of its distinctive terms (${match.matched.slice(0, 6).join(', ')}); requeue for a normal governed study attempt` }
}

export function scanKnowledgeApplication(gaps: DormantQuestionRow[], knowledge: RetainedKnowledgeRow[]): ApplicationCandidate[] {
  const usable = (knowledge || []).filter(row => row && row.contentHash && row.summary)
  return (gaps || []).filter(gap => gap && gap.id && gap.subject && gap.question).map(gap => assessDormantQuestion(gap, usable))
}

export function selectReopenBatch(candidates: ApplicationCandidate[], max: number = MAX_REOPEN_PER_CYCLE): ApplicationCandidate[] {
  const limit = Math.max(0, Math.min(MAX_REOPEN_PER_CYCLE, Math.floor(max)))
  const seen = new Set<string>()
  return (candidates || []).filter(candidate => candidate.verdict === 'reopen_and_retest')
    .sort((a, b) => b.coverage - a.coverage || b.matchedTerms.length - a.matchedTerms.length || a.gapId.localeCompare(b.gapId))
    .filter(candidate => { if (seen.has(candidate.gapId)) return false; seen.add(candidate.gapId); return true }).slice(0, limit)
}

export function summarizeApplicationScan(candidates: ApplicationCandidate[]): Record<ApplicationVerdict, number> {
  const summary: Record<ApplicationVerdict, number> = {
    reopen_and_retest: 0, insufficient_overlap: 0, evidence_predates_failure: 0,
    source_confidence_too_low: 0, not_reopenable: 0, reopen_limit_reached: 0, no_new_evidence: 0,
  }
  for (const candidate of candidates || []) if (candidate && candidate.verdict in summary) summary[candidate.verdict] += 1
  return summary
}
