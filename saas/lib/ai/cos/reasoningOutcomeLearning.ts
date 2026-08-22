import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { classifyProblemClass } from '@/lib/ai/cos/cosProblemClass'
import type { CosReasoningWorkerRole } from '@/lib/ai/cos/cosReasoningControlPlane'
import {
  deriveReasoningOutcomeProfile,
  type ReasoningOutcomeSample,
  type ReasoningProblemPreference,
} from '@/lib/ai/cos/reasoningOutcomeProfile'

const CACHE_TTL_MS = 5 * 60 * 1000
const METRIC_ROW_LIMIT = 250

type CachedPreference = { expiresAt: number; preference: ReasoningProblemPreference | null }
const preferenceCache = new Map<string, CachedPreference>()

function validRole(value: unknown): value is CosReasoningWorkerRole {
  return value === 'primary' || value === 'coder' || value === 'critic' || value === 'verifier' || value === 'researcher'
}

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function nullableBoolean(value: unknown): boolean | null {
  return value === true ? true : value === false ? false : null
}

function cacheKey(problemClass: string): string {
  return String(problemClass || 'general reasoning').trim().toLowerCase()
}

async function readProblemPreference(problemClass: string): Promise<ReasoningProblemPreference | null> {
  const db = cosServiceDb()
  if (!db) return null
  const metrics = await db.from('cos_reasoning_worker_metrics')
    .select('turn_id,problem_class,worker_role,reasoner_label,latency_ms,estimated_cost_usd,recorded_at')
    .eq('problem_class', problemClass)
    .order('recorded_at', { ascending: false })
    .limit(METRIC_ROW_LIMIT)
  if (metrics.error || !metrics.data?.length) return null

  const metricRows = metrics.data.filter((row: any) => row?.turn_id && validRole(row.worker_role) && row.reasoner_label)
  if (!metricRows.length) return null
  const turnIds = metricRows.map((row: any) => String(row.turn_id))
  const outcomes = await db.from('cos_turn_outcomes')
    .select('turn_id,repair_needed,escalated,verified_success')
    .in('turn_id', turnIds)
  if (outcomes.error) return null
  const outcomeByTurn = new Map((outcomes.data ?? []).map((row: any) => [String(row.turn_id), row]))

  const samples: ReasoningOutcomeSample[] = metricRows.map((row: any) => {
    const outcome: any = outcomeByTurn.get(String(row.turn_id)) ?? {}
    const cost = row.estimated_cost_usd == null ? null : finiteNumber(row.estimated_cost_usd, Number.NaN)
    return {
      turnId: String(row.turn_id),
      problemClass: String(row.problem_class || problemClass),
      workerRole: row.worker_role,
      reasonerLabel: String(row.reasoner_label),
      latencyMs: Math.max(0, finiteNumber(row.latency_ms)),
      estimatedCostUsd: cost !== null && Number.isFinite(cost) ? Math.max(0, cost) : null,
      verifiedSuccess: nullableBoolean(outcome.verified_success),
      repairNeeded: nullableBoolean(outcome.repair_needed),
      escalated: nullableBoolean(outcome.escalated),
    }
  })

  const profile = deriveReasoningOutcomeProfile(samples)
  return profile.preferences.find(preference => preference.problemClass === problemClass) ?? null
}

export async function loadReasoningOutcomeStatus(
  problemClass: string,
  options: { fresh?: boolean } = {},
): Promise<ReasoningProblemPreference | null> {
  const key = cacheKey(problemClass)
  const now = Date.now()
  if (!options.fresh) {
    const cached = preferenceCache.get(key)
    if (cached && cached.expiresAt > now) return cached.preference
  }
  try {
    const preference = await readProblemPreference(problemClass)
    preferenceCache.set(key, { expiresAt: now + CACHE_TTL_MS, preference })
    return preference
  } catch (error) {
    console.warn('[cos-reasoning-outcome-learning] preference read failed closed:', error instanceof Error ? error.message : String(error))
    preferenceCache.set(key, { expiresAt: now + 30_000, preference: null })
    return null
  }
}

export function invalidateReasoningOutcomeStatus(problemClass: string): void {
  preferenceCache.delete(cacheKey(problemClass))
}

export async function loadLearnedReasoningPreference(problemClass: string): Promise<ReasoningProblemPreference | null> {
  const preference = await loadReasoningOutcomeStatus(problemClass)
  return preference?.status === 'learned' ? preference : null
}

export type AppliedReasoningPreference = {
  workerRole: CosReasoningWorkerRole
  reasonerLabel: string
  reason: string
}

/**
 * Only a recommendation for the currently configured model label can affect live routing today.
 * A better historical/alternate model is still visible in the derived profile but cannot be invoked
 * until that model is explicitly registered as an available worker.
 */
export async function learnedRoutingOverride(args: {
  prompt: string
  currentReasonerLabel: string
  deterministicRole: CosReasoningWorkerRole
}): Promise<AppliedReasoningPreference | null> {
  if (process.env.COS_REASONING_OUTCOME_LEARNING_ENABLED === 'false') return null
  if (args.deterministicRole === 'verifier') return null
  const problemClass = classifyProblemClass(args.prompt)
  const preference = await loadLearnedReasoningPreference(problemClass)
  if (!preference?.recommendedWorkerRole || !preference.recommendedReasonerLabel) return null
  if (preference.recommendedReasonerLabel !== args.currentReasonerLabel) {
    console.info('[cos-reasoning-model-advisory]', JSON.stringify({
      at: new Date().toISOString(),
      problemClass,
      currentReasonerLabel: args.currentReasonerLabel,
      recommendedReasonerLabel: preference.recommendedReasonerLabel,
      recommendedWorkerRole: preference.recommendedWorkerRole,
      applied: false,
      reason: 'recommended_model_not_registered_as_current_worker',
    }))
    return null
  }
  return {
    workerRole: preference.recommendedWorkerRole,
    reasonerLabel: preference.recommendedReasonerLabel,
    reason: preference.reason,
  }
}
