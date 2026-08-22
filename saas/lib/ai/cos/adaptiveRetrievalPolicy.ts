import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  ADAPTIVE_RETRIEVAL_REQUIRED_VALIDATIONS,
  deriveAdaptiveRetrievalCandidate,
  type AdaptiveRetrievalDerivedCandidate,
  type AdaptiveRetrievalTrainingRow,
} from '@/lib/ai/cos/adaptiveRetrievalPolicyLogic'

export {
  ADAPTIVE_RETRIEVAL_MIN_TRAINING_CASES,
  ADAPTIVE_RETRIEVAL_MIN_INJECTED_ITEMS,
  ADAPTIVE_RETRIEVAL_MIN_SUCCESS_RATE,
  ADAPTIVE_RETRIEVAL_MIN_UNUSED_RATE,
  ADAPTIVE_RETRIEVAL_REQUIRED_VALIDATIONS,
  LIVE_LEARNED_CORPUS_MAX_INJECTED,
  deriveAdaptiveRetrievalCandidate,
  adaptiveRetrievalTrainingCaseId,
} from '@/lib/ai/cos/adaptiveRetrievalPolicyLogic'
export type { AdaptiveRetrievalDerivedCandidate, AdaptiveRetrievalTrainingRow } from '@/lib/ai/cos/adaptiveRetrievalPolicyLogic'

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
  const candidate = deriveAdaptiveRetrievalCandidate(await trainingRows(), learnedCorpusMinSimilarity())
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
