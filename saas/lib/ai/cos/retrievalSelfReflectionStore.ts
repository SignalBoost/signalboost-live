// saas/lib/ai/cos/retrievalSelfReflectionStore.ts
//
// Durable prompt-free retrieval reflection storage and predictive reporting.

import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  assessRetrievalReflectionPredictiveValue,
  deriveRetrievalSelfReflection,
  retrievalPredictionBrier,
  retrievalPredictionCorrect,
  RETRIEVAL_REFLECTION_VERSION,
  type RetrievalReflectionItem,
  type RetrievalRecommendation,
} from '@/lib/ai/cos/retrievalSelfReflection'

const REPORT_LIMIT = 1000
const JOIN_BATCH_SIZE = 200

export type RecordRetrievalReflectionInput = {
  turnId: string
  injected: number
  cited: number
  items?: RetrievalReflectionItem[]
}

/** Post-commit convergence hook used from both sides of the turn/outcome race. */
export async function reconcileRetrievalReflectionOutcome(turnId: string): Promise<boolean> {
  try {
    const cleanTurnId = String(turnId || '').trim()
    if (!cleanTurnId) return false
    const db = cosServiceDb()
    if (!db) return false
    const result = await db.rpc('cos_reconcile_retrieval_reflection', { p_turn_id: cleanTurnId })
    if (result.error) return false
    return Number(result.data || 0) > 0
  } catch {
    return false
  }
}

export async function persistRetrievalSelfReflection(input: RecordRetrievalReflectionInput): Promise<void> {
  try {
    const turnId = String(input?.turnId || '').trim()
    if (!turnId || Number(input?.injected) <= 0) return
    const db = cosServiceDb()
    if (!db) return
    const reflection = deriveRetrievalSelfReflection(input)
    const result = await db.from('cos_retrieval_reflections').upsert({
      turn_id: turnId,
      evidence_system: 'learned_corpus',
      reflection_version: RETRIEVAL_REFLECTION_VERSION,
      injected: reflection.signals.injected,
      cited: reflection.signals.cited,
      unused_rate: reflection.signals.unusedRate,
      distinct_source_kinds: reflection.signals.distinctSourceKinds,
      avg_similarity: reflection.signals.avgSimilarity,
      cited_avg_similarity: reflection.signals.citedAvgSimilarity,
      unused_avg_similarity: reflection.signals.unusedAvgSimilarity,
      sufficiency: reflection.sufficiency,
      missing_evidence_class: reflection.missingEvidenceClass,
      recommendation: reflection.recommendation,
      predicted_failure_risk: reflection.predictedFailureRisk,
      signals: reflection.signals,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'turn_id,evidence_system,reflection_version' })
    if (result.error) throw result.error
    // Supabase REST writes are committed before this next request starts. Combined with the same
    // post-commit hook on outcome persistence, whichever side finishes second closes concurrency races.
    await reconcileRetrievalReflectionOutcome(turnId)
  } catch (error) {
    console.warn('[cos-retrieval-reflection] record failed (non-fatal):', error instanceof Error ? error.message : String(error))
  }
}

type ReflectionRow = {
  turn_id?: string | null
  recommendation?: RetrievalRecommendation | null
  predicted_failure_risk?: number | null
  observed_verified_success?: boolean | null
  prediction_correct?: boolean | null
  brier_score?: number | null
  outcome_source?: string | null
  created_at?: string | null
}

type TurnContextRow = {
  turn_id?: string | null
  problem_class?: string | null
  reasoner_label?: string | null
  route_class?: string | null
  response_source?: string | null
}

type OutcomeRow = {
  turn_id?: string | null
  verified_success?: boolean | null
  repair_needed?: boolean | null
  outcome_source?: string | null
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size) as T[])
  return out
}

async function loadTurnContexts(turnIds: string[]): Promise<Map<string, TurnContextRow>> {
  const db = cosServiceDb()
  const map = new Map<string, TurnContextRow>()
  if (!db || turnIds.length === 0) return map
  for (const batch of chunk([...new Set(turnIds)], JOIN_BATCH_SIZE)) {
    const result = await db.from('cos_turn_experience')
      .select('turn_id,problem_class,reasoner_label,route_class,response_source')
      .in('turn_id', batch)
    if (result.error) continue
    for (const row of (result.data ?? []) as TurnContextRow[]) if (row.turn_id) map.set(row.turn_id, row)
  }
  return map
}

async function loadAuthoritativeOutcomes(turnIds: string[]): Promise<Map<string, OutcomeRow>> {
  const db = cosServiceDb()
  const map = new Map<string, OutcomeRow>()
  if (!db || turnIds.length === 0) return map
  for (const batch of chunk([...new Set(turnIds)], JOIN_BATCH_SIZE)) {
    const result = await db.from('cos_turn_outcomes')
      .select('turn_id,verified_success,repair_needed,outcome_source')
      .in('turn_id', batch)
    if (result.error) continue
    for (const row of (result.data ?? []) as OutcomeRow[]) if (row.turn_id) map.set(row.turn_id, row)
  }
  return map
}

function round(value: number): number {
  return Number(value.toFixed(4))
}

export async function readRetrievalSelfReflectionReport(limit = REPORT_LIMIT) {
  const db = cosServiceDb()
  if (!db) return { ok: false as const, error: 'COS service database is not configured.' }
  const result = await db.from('cos_retrieval_reflections')
    .select('turn_id,recommendation,predicted_failure_risk,observed_verified_success,prediction_correct,brier_score,outcome_source,created_at')
    .eq('evidence_system', 'learned_corpus')
    .eq('reflection_version', RETRIEVAL_REFLECTION_VERSION)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(REPORT_LIMIT, Math.floor(limit))))
  if (result.error) return { ok: false as const, error: `cos_retrieval_reflections read failed: ${result.error.message}` }

  const rows = (result.data ?? []) as ReflectionRow[]
  const turnIds = rows.map(row => String(row.turn_id || '')).filter(Boolean)
  const [contexts, outcomes] = await Promise.all([
    loadTurnContexts(turnIds),
    loadAuthoritativeOutcomes(turnIds),
  ])
  // Reporting/predictive gates join the authoritative outcome table dynamically, so even an
  // interrupted reconciliation write cannot bias the learning metric.
  const verified = rows.flatMap(row => {
    if (!row.turn_id || row.predicted_failure_risk == null) return []
    const outcome = outcomes.get(row.turn_id)
    if (typeof outcome?.verified_success !== 'boolean') return []
    return [{ row, verifiedSuccess: outcome.verified_success }]
  })
  const predictive = assessRetrievalReflectionPredictiveValue(verified.map(entry => ({
    turnId: String(entry.row.turn_id),
    predictedFailureRisk: Number(entry.row.predicted_failure_risk),
    verifiedSuccess: entry.verifiedSuccess,
  })))

  const recommendations = new Map<string, { turns: number; verified: number; successes: number; brier: number[] }>()
  for (const row of rows) {
    const key = String(row.recommendation || 'unknown')
    const bucket = recommendations.get(key) || { turns: 0, verified: 0, successes: 0, brier: [] }
    bucket.turns += 1
    const success = row.turn_id ? outcomes.get(row.turn_id)?.verified_success : null
    if (typeof success === 'boolean' && row.predicted_failure_risk != null) {
      bucket.verified += 1
      if (success) bucket.successes += 1
      bucket.brier.push(retrievalPredictionBrier({ predictedFailureRisk: Number(row.predicted_failure_risk), verifiedSuccess: success }))
    }
    recommendations.set(key, bucket)
  }

  const byRecommendation = [...recommendations.entries()].map(([recommendation, bucket]) => ({
    recommendation,
    turns: bucket.turns,
    verifiedOutcomes: bucket.verified,
    verifiedSuccessRate: bucket.verified ? round(bucket.successes / bucket.verified) : null,
    avgBrierScore: bucket.brier.length ? round(bucket.brier.reduce((sum, value) => sum + value, 0) / bucket.brier.length) : null,
  })).sort((a, b) => b.turns - a.turns || a.recommendation.localeCompare(b.recommendation))

  const byProblemClass = new Map<string, { turns: number; verified: number; correct: number }>()
  for (const row of rows) {
    const context = row.turn_id ? contexts.get(row.turn_id) : null
    const key = String(context?.problem_class || 'unclassified')
    const bucket = byProblemClass.get(key) || { turns: 0, verified: 0, correct: 0 }
    bucket.turns += 1
    const success = row.turn_id ? outcomes.get(row.turn_id)?.verified_success : null
    if (typeof success === 'boolean' && row.predicted_failure_risk != null) {
      bucket.verified += 1
      if (retrievalPredictionCorrect({ predictedFailureRisk: Number(row.predicted_failure_risk), verifiedSuccess: success })) bucket.correct += 1
    }
    byProblemClass.set(key, bucket)
  }

  return {
    ok: true as const,
    report: {
      evidenceSystem: 'learned_corpus' as const,
      reflectionVersion: RETRIEVAL_REFLECTION_VERSION,
      turns: rows.length,
      verifiedOutcomeCoverage: rows.length ? round(verified.length / rows.length) : null,
      predictive,
      byRecommendation,
      byProblemClass: [...byProblemClass.entries()].map(([problemClass, bucket]) => ({
        problemClass,
        turns: bucket.turns,
        verifiedOutcomes: bucket.verified,
        predictionAccuracy: bucket.verified ? round(bucket.correct / bucket.verified) : null,
      })).sort((a, b) => b.turns - a.turns || a.problemClass.localeCompare(b.problemClass)),
      livePolicyChanged: false,
      nextStep: predictive.shadowValidationEligible
        ? 'Predictive gate passed. A separate controlled shadow-policy validation may now test whether the recommendations causally improve retrieval.'
        : 'Continue collecting exact verified outcomes. Reflection recommendations remain hypotheses and cannot change live retrieval.',
    },
  }
}
