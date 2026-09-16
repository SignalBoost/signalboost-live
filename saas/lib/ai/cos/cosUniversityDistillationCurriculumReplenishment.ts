import { ContinuousLearningCycle } from '@/lib/cos-core/layers/learning/cycle'
import { ContinuousLearningDirector, type ContinuousLearningPolicy } from '@/lib/cos-core/layers/learning'
import { createLiveLearningAdapters } from '@/lib/cos-core/layers/learning/liveSources'
import { createSupabaseCOSStores, cosServiceDb } from '@/lib/cos-core/storage/supabase'
import type { MassDistillationSubjectSupply } from './cosUniversityMassDistillation.ts'
import {
  buildMassDistillationReplenishmentGaps,
  MASS_DISTILLATION_DEFAULT_QUERIES_PER_SUBJECT,
  MASS_DISTILLATION_REPLENISHMENT_INTERVAL_MINUTES,
} from './cosUniversityDistillationCurriculumPlan.ts'

// OpenAlex currently serves at most ten works per query through this adapter. Distillation scales
// discovery through buyer-controlled query diversity rather than pretending a per-request provider
// page size is the product throughput ceiling.
const DISTILLATION_OPENALEX_RESULTS_PER_QUERY = 10

function rightsClearedPolicy(maxCandidatesPerCycle: number): ContinuousLearningPolicy {
  return {
    allowedSourceKinds: new Set(['scientific_journal']),
    minimumConfidence: 0.80,
    maxCandidatesPerCycle,
    maxExternalCostUsdPerCycle: 0,
  }
}

function slotKey(now: Date): string {
  const interval = MASS_DISTILLATION_REPLENISHMENT_INTERVAL_MINUTES * 60_000
  const slot = new Date(Math.floor(now.getTime() / interval) * interval)
  return `distillation-replenishment-${slot.toISOString().slice(0, 16).replace(/[-:T]/g, '')}`
}

export async function replenishUniversityMassDistillationCurriculum(input: {
  supply: readonly MassDistillationSubjectSupply[]
  now?: Date
  maxSubjects?: number
  queriesPerSubject?: number
  maxCandidatesPerCycle?: number
}) {
  const now = input.now || new Date()
  const maxSubjects = Number.isSafeInteger(input.maxSubjects) && Number(input.maxSubjects) > 0 ? Number(input.maxSubjects) : 3
  const queriesPerSubject = Number.isSafeInteger(input.queriesPerSubject) && Number(input.queriesPerSubject) > 0
    ? Number(input.queriesPerSubject)
    : MASS_DISTILLATION_DEFAULT_QUERIES_PER_SUBJECT
  const maxCandidatesPerCycle = Number.isSafeInteger(input.maxCandidatesPerCycle) && Number(input.maxCandidatesPerCycle) > 0
    ? Number(input.maxCandidatesPerCycle)
    : 40
  const gaps = buildMassDistillationReplenishmentGaps(input.supply, now, maxSubjects, queriesPerSubject)
  if (!gaps.length) return Object.freeze({ ok: true, skipped: true, reason: 'no_targetable_subject_shortfall', targets: [], externalCostUsd: 0 })

  const db = cosServiceDb()
  const stores = createSupabaseCOSStores()
  if (!db || !stores?.continuousLearning) throw new Error('persistent_learning_store_unavailable')

  const key = slotKey(now)
  const claim = await db.from('cos_university_continuous_runs').insert({
    slot_key: key,
    status: 'running',
    planned_count: gaps.length,
    eligible_count: gaps.length,
    gap_count: gaps.length,
    started_at: now.toISOString(),
    updated_at: now.toISOString(),
  }).select('id').maybeSingle()
  if (String((claim.error as { code?: string } | null)?.code || '') === '23505') {
    return Object.freeze({ ok: true, skipped: true, reason: 'replenishment_slot_already_claimed', slotKey: key, targets: gaps.map(gap => gap.subject), externalCostUsd: 0 })
  }
  if (claim.error) throw claim.error
  if (!claim.data?.id) throw new Error('replenishment_slot_claim_failed')

  const adapters = createLiveLearningAdapters({
    ...process.env,
    COS_LEARNING_CAP_OPENALEX: String(DISTILLATION_OPENALEX_RESULTS_PER_QUERY),
  }).filter(adapter => adapter.id === 'openalex')
  if (!adapters.length) {
    await db.from('cos_university_continuous_runs').update({
      status: 'error', errors: ['rights_cleared_openalex_adapter_unavailable'], completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', claim.data.id)
    return Object.freeze({ ok: false, skipped: false, reason: 'rights_cleared_openalex_adapter_unavailable', slotKey: key, targets: gaps.map(gap => gap.subject), externalCostUsd: 0 })
  }

  try {
    const cycle = new ContinuousLearningCycle(
      new ContinuousLearningDirector(stores.continuousLearning, rightsClearedPolicy(maxCandidatesPerCycle)),
      adapters,
    )
    const result = await cycle.run(gaps, 0)
    const completedAt = new Date().toISOString()
    const update = await db.from('cos_university_continuous_runs').update({
      status: 'completed',
      documents_acquired: result.documentsAcquired,
      accepted_count: result.accepted,
      probationary_count: result.probationary,
      rejected_counts: result.rejected,
      source_errors: result.sourceErrors,
      gap_diagnostics: result.gapDiagnostics,
      completed_at: completedAt,
      updated_at: completedAt,
    }).eq('id', claim.data.id)
    if (update.error) throw update.error

    return Object.freeze({
      ok: true,
      skipped: false,
      slotKey: key,
      targets: [...new Set(gaps.map(gap => gap.subject))],
      queriesPerSubject,
      queryCount: gaps.length,
      resultsPerQuery: DISTILLATION_OPENALEX_RESULTS_PER_QUERY,
      maxCandidatesPerCycle,
      documentsAcquired: result.documentsAcquired,
      accepted: result.accepted,
      probationary: result.probationary,
      rejected: result.rejected,
      sourceErrors: result.sourceErrors,
      externalCostUsd: 0,
      semantics: 'diversified_targeted_post_dedup_shortfall_acquisition_openalex_cc0_existing_learning_admission_no_provider_training_dispatch',
    })
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error || 'unknown_error').slice(0, 800)
    const completedAt = new Date().toISOString()
    await db.from('cos_university_continuous_runs').update({
      status: 'error', errors: [message], completed_at: completedAt, updated_at: completedAt,
    }).eq('id', claim.data.id)
    throw error
  }
}
