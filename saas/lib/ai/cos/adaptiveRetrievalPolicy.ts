import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

export const ADAPTIVE_RETRIEVAL_MIN_TRAINING_CASES = 6
export const ADAPTIVE_RETRIEVAL_MIN_INJECTED_ITEMS = 36
export const ADAPTIVE_RETRIEVAL_MIN_SUCCESS_RATE = 0.80
export const ADAPTIVE_RETRIEVAL_MIN_UNUSED_RATE = 0.85
export const ADAPTIVE_RETRIEVAL_REQUIRED_VALIDATIONS = 2
export const LIVE_LEARNED_CORPUS_MAX_INJECTED = 6

export type AdaptiveRetrievalTrainingRow = {
  turnId: string
  injected: number
  cited: number
  items?: Array<{ similarity?: number | null; cited?: boolean }>
  verifiedSuccess: boolean | null
  repairNeeded: boolean | null
  outcomeSource: string | null
}

export type AdaptiveRetrievalDerivedCandidate = {
  eligible: boolean
  reason: string
  trainingCaseIds: string[]
  trainingTurnIds: string[]
  metrics: {
    distinctCases: number
    outcomeTurns: number
    verifiedSuccesses: number
    verifiedFailures: number
    successRate: number | null
    injected: number
    cited: number
    unusedRate: number | null
    itemSimilaritySamples: number
    citedSimilaritySamples: number
  }
  currentPolicy: {
    learnedCorpusMaxInjected: number
    learnedCorpusMinSimilarity: number
  }
  candidatePolicy: {
    learnedCorpusMaxInjected: number
    learnedCorpusMinSimilarity: number
    sourceMix: 'unchanged'
    similarityThresholdStatus: 'unchanged_until_item_level_evidence'
  }
}

export type AdaptiveRetrievalPolicyRow = {
  id: string
  status: string
  training_hash: string
  current_policy: Record<string, unknown>
  candidate_policy: Record<string, unknown>
  training_metrics: Record<string, unknown>
  training_case_ids: string[]
  validation_required: number
  validation_passed: number
  validation_failed: number
  created_at: string
  updated_at: string
}

function learnedCorpusMinSimilarity(): number {
  const value = Number(process.env.COS_LEARNED_CONTEXT_SIMILARITY_THRESHOLD || '0.45')
  return Number.isFinite(value) ? Math.max(0.20, Math.min(0.95, value)) : 0.45
}

function cleanCount(value: unknown): number {
  return Math.max(0, Math.floor(Number(value) || 0))
}

function trainingCaseId(source: string | null): string | null {
  const value = String(source ?? '').trim()
  if (!value || value.startsWith('failure_autopsy_retest:') || value.startsWith('adaptive_retrieval_validation:')) return null
  if (value.startsWith('evidence_utilization_benchmark:')) return value.slice('evidence_utilization_benchmark:'.length) || null
  if (value.startsWith('capability_benchmark:')) return `private:${value.slice('capability_benchmark:'.length)}`
  return null
}

/**
 * Produce a conservative context-waste hypothesis only. Zero citations are NOT interpreted as proof
 * that evidence was useless. The only automatic proposal here is a smaller injection cap, and it
 * remains request-local shadow policy until independent controlled validation succeeds.
 */
export function deriveAdaptiveRetrievalCandidate(
  rows: readonly AdaptiveRetrievalTrainingRow[],
): AdaptiveRetrievalDerivedCandidate {
  const latestByCase = new Map<string, AdaptiveRetrievalTrainingRow>()
  for (const row of rows) {
    if (row.verifiedSuccess == null) continue
    const caseId = trainingCaseId(row.outcomeSource)
    if (!caseId || latestByCase.has(caseId)) continue
    latestByCase.set(caseId, row)
  }

  const cohort = [...latestByCase.entries()]
  const trainingCaseIds = cohort.map(([caseId]) => caseId).sort()
  const trainingTurnIds = cohort.map(([, row]) => row.turnId).filter(Boolean).sort()
  const outcomeTurns = cohort.length
  const verifiedSuccesses = cohort.filter(([, row]) => row.verifiedSuccess === true).length
  const verifiedFailures = cohort.filter(([, row]) => row.verifiedSuccess === false).length
  const injected = cohort.reduce((sum, [, row]) => sum + cleanCount(row.injected), 0)
  const cited = cohort.reduce((sum, [, row]) => sum + Math.min(cleanCount(row.injected), cleanCount(row.cited)), 0)
  const similarityItems = cohort.flatMap(([, row]) => Array.isArray(row.items) ? row.items : [])
    .filter(item => item.similarity != null && Number.isFinite(Number(item.similarity)))
  const citedSimilarityItems = similarityItems.filter(item => item.cited === true)
  const successRate = outcomeTurns > 0 ? verifiedSuccesses / outcomeTurns : null
  const unusedRate = injected > 0 ? 1 - (cited / injected) : null

  const enoughCases = outcomeTurns >= ADAPTIVE_RETRIEVAL_MIN_TRAINING_CASES
  const enoughContext = injected >= ADAPTIVE_RETRIEVAL_MIN_INJECTED_ITEMS
  const qualityStrong = successRate != null && successRate >= ADAPTIVE_RETRIEVAL_MIN_SUCCESS_RATE
  const wasteHigh = unusedRate != null && unusedRate >= ADAPTIVE_RETRIEVAL_MIN_UNUSED_RATE
  const eligible = enoughCases && enoughContext && qualityStrong && wasteHigh

  const reason = !enoughCases
    ? `Need at least ${ADAPTIVE_RETRIEVAL_MIN_TRAINING_CASES} distinct outcome-labelled cases.`
    : !enoughContext
      ? `Need at least ${ADAPTIVE_RETRIEVAL_MIN_INJECTED_ITEMS} injected learned-corpus items in the training cohort.`
      : !qualityStrong
        ? `Verified success rate is below the ${Math.round(ADAPTIVE_RETRIEVAL_MIN_SUCCESS_RATE * 100)}% shadow-candidate floor.`
        : !wasteHigh
          ? `Injected-but-uncited rate is below the ${Math.round(ADAPTIVE_RETRIEVAL_MIN_UNUSED_RATE * 100)}% context-waste trigger.`
          : 'Context-waste hypothesis is eligible for shadow validation; no live retrieval policy changes are authorized.'

  const currentSimilarity = learnedCorpusMinSimilarity()
  return {
    eligible,
    reason,
    trainingCaseIds,
    trainingTurnIds,
    metrics: {
      distinctCases: trainingCaseIds.length,
      outcomeTurns,
      verifiedSuccesses,
      verifiedFailures,
      successRate: successRate == null ? null : Number(successRate.toFixed(4)),
      injected,
      cited,
      unusedRate: unusedRate == null ? null : Number(unusedRate.toFixed(4)),
      itemSimilaritySamples: similarityItems.length,
      citedSimilaritySamples: citedSimilarityItems.length,
    },
    currentPolicy: {
      learnedCorpusMaxInjected: LIVE_LEARNED_CORPUS_MAX_INJECTED,
      learnedCorpusMinSimilarity: currentSimilarity,
    },
    candidatePolicy: {
      // First candidate is deliberately conservative: reduce context by one third, not one half.
      learnedCorpusMaxInjected: Math.max(3, LIVE_LEARNED_CORPUS_MAX_INJECTED - 2),
      learnedCorpusMinSimilarity: currentSimilarity,
      sourceMix: 'unchanged',
      similarityThresholdStatus: 'unchanged_until_item_level_evidence',
    },
  }
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size) as T[])
  return out
}

async function trainingRows(): Promise<AdaptiveRetrievalTrainingRow[]> {
  const db = cosServiceDb()
  if (!db) return []
  const useResult = await db.from('cos_evidence_source_use')
    .select('turn_id,injected,cited,items,created_at')
    .eq('evidence_system', 'learned_corpus')
    .order('created_at', { ascending: false })
    .limit(1000)
  if (useResult.error) throw useResult.error

  const useRows = (useResult.data ?? []) as Array<Record<string, unknown>>
  const turnIds = useRows.map(row => String(row.turn_id || '')).filter(Boolean)
  const outcomes = new Map<string, Record<string, unknown>>()
  for (const batch of chunk([...new Set(turnIds)], 200)) {
    const result = await db.from('cos_turn_outcomes')
      .select('turn_id,verified_success,repair_needed,outcome_source,outcome_at')
      .in('turn_id', batch)
    if (result.error) throw result.error
    for (const row of (result.data ?? []) as Array<Record<string, unknown>>) outcomes.set(String(row.turn_id), row)
  }

  return useRows.map(row => {
    const outcome = outcomes.get(String(row.turn_id))
    return {
      turnId: String(row.turn_id || ''),
      injected: cleanCount(row.injected),
      cited: cleanCount(row.cited),
      items: Array.isArray(row.items) ? row.items as AdaptiveRetrievalTrainingRow['items'] : [],
      verifiedSuccess: typeof outcome?.verified_success === 'boolean' ? outcome.verified_success : null,
      repairNeeded: typeof outcome?.repair_needed === 'boolean' ? outcome.repair_needed : null,
      outcomeSource: outcome?.outcome_source == null ? null : String(outcome.outcome_source),
    }
  })
}

function trainingHash(candidate: AdaptiveRetrievalDerivedCandidate): string {
  return createHash('sha256')
    .update(JSON.stringify({ cases: candidate.trainingCaseIds, turns: candidate.trainingTurnIds, candidate: candidate.candidatePolicy }))
    .digest('hex')
}

export async function refreshAdaptiveRetrievalShadowCandidate(): Promise<{
  candidate: AdaptiveRetrievalDerivedCandidate
  policy: AdaptiveRetrievalPolicyRow | null
}> {
  const candidate = deriveAdaptiveRetrievalCandidate(await trainingRows())
  if (!candidate.eligible) return { candidate, policy: null }
  const db = cosServiceDb()
  if (!db) return { candidate, policy: null }

  const hash = trainingHash(candidate)
  const existing = await db.from('cos_adaptive_retrieval_policies')
    .select('*').eq('training_hash', hash).maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data) return { candidate, policy: existing.data as AdaptiveRetrievalPolicyRow }

  const inserted = await db.from('cos_adaptive_retrieval_policies').insert({
    evidence_system: 'learned_corpus',
    scope_key: 'global',
    status: 'validation_pending',
    training_hash: hash,
    current_policy: candidate.currentPolicy,
    candidate_policy: candidate.candidatePolicy,
    training_metrics: candidate.metrics,
    training_case_ids: candidate.trainingCaseIds,
    validation_required: ADAPTIVE_RETRIEVAL_REQUIRED_VALIDATIONS,
  }).select('*').single()
  if (inserted.error) throw inserted.error
  return { candidate, policy: inserted.data as AdaptiveRetrievalPolicyRow }
}

export async function readAdaptiveRetrievalPolicyReport(): Promise<{
  policies: AdaptiveRetrievalPolicyRow[]
  validations: Array<Record<string, unknown>>
  livePolicyChanged: false
}> {
  const db = cosServiceDb()
  if (!db) return { policies: [], validations: [], livePolicyChanged: false }
  const [policies, validations] = await Promise.all([
    db.from('cos_adaptive_retrieval_policies').select('*').order('updated_at', { ascending: false }).limit(20),
    db.from('cos_adaptive_retrieval_validations').select('*').order('created_at', { ascending: false }).limit(40),
  ])
  if (policies.error) throw policies.error
  if (validations.error) throw validations.error
  return {
    policies: (policies.data ?? []) as AdaptiveRetrievalPolicyRow[],
    validations: (validations.data ?? []) as Array<Record<string, unknown>>,
    livePolicyChanged: false,
  }
}
