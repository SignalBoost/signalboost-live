import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { ONE_TIME_TEACHER_MAX_ESTIMATED_COST_USD } from './cosUniversityOneTimeTeacherDispatch.ts'
import { ONE_TIME_DATASET_PREPARATION_MAX_ESTIMATED_COST_USD } from './cosUniversityOneTimeDatasetPreparationDispatch.ts'
import { ONE_TIME_STUDENT_TRAINING_MAX_ESTIMATED_COST_USD } from './cosUniversityOneTimeStudentTrainingDispatch.ts'

export const COS_UNIVERSITY_MASS_DISTILLATION_CAMPAIGN_PLAN_PROFILE = 'cos-university-mass-distillation-campaign-plan-v1' as const
export const MASS_DISTILLATION_JOBS_PER_BATCH = 3 as const
export const MASS_DISTILLATION_PER_BATCH_MAX_ESTIMATED_COST_USD = Number((
  ONE_TIME_TEACHER_MAX_ESTIMATED_COST_USD
  + ONE_TIME_DATASET_PREPARATION_MAX_ESTIMATED_COST_USD
  + ONE_TIME_STUDENT_TRAINING_MAX_ESTIMATED_COST_USD
).toFixed(6))

export type MassDistillationPreparedBatch = Readonly<{
  batch_key: string
  subject_id: string
  source_count: number
  student_model_id: string
  dispatch_authorized: boolean
}>

function clean(value: unknown, limit = 240): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

export function summarizeMassDistillationCampaign(
  rows: readonly MassDistillationPreparedBatch[],
  requestedBatches?: number,
) {
  const prepared = rows.filter(row => clean(row.batch_key, 128)
    && clean(row.subject_id, 240)
    && clean(row.student_model_id, 240)
    && row.dispatch_authorized === false
    && Number.isFinite(Number(row.source_count))
    && Number(row.source_count) > 0)
  const boundedRequested = Number.isFinite(Number(requestedBatches))
    ? Math.max(1, Math.min(prepared.length || 1, Math.floor(Number(requestedBatches))))
    : prepared.length
  const selected = prepared.slice(0, boundedRequested)
  const sourceItems = selected.reduce((sum, row) => sum + Math.floor(Number(row.source_count)), 0)
  const maximumAuthorizedCostUsd = roundUsd(selected.length * MASS_DISTILLATION_PER_BATCH_MAX_ESTIMATED_COST_USD)

  return Object.freeze({
    profile: COS_UNIVERSITY_MASS_DISTILLATION_CAMPAIGN_PLAN_PROFILE,
    preparedBatches: prepared.length,
    selectedBatches: selected.length,
    sourceItems,
    jobsPerBatch: MASS_DISTILLATION_JOBS_PER_BATCH,
    totalJobs: selected.length * MASS_DISTILLATION_JOBS_PER_BATCH,
    perBatchMaximumEstimatedCostUsd: MASS_DISTILLATION_PER_BATCH_MAX_ESTIMATED_COST_USD,
    maximumAuthorizedCostUsd,
    costCaps: Object.freeze({
      teacherUsd: ONE_TIME_TEACHER_MAX_ESTIMATED_COST_USD,
      datasetPreparationUsd: ONE_TIME_DATASET_PREPARATION_MAX_ESTIMATED_COST_USD,
      studentTrainingUsd: ONE_TIME_STUDENT_TRAINING_MAX_ESTIMATED_COST_USD,
    }),
    batches: Object.freeze(selected.map(row => Object.freeze({
      batchKey: clean(row.batch_key, 128),
      subjectId: clean(row.subject_id, 240),
      sourceCount: Math.floor(Number(row.source_count)),
      studentModelId: clean(row.student_model_id, 240),
    }))),
    dispatchAuthorized: false,
    providerMutation: false,
    automaticPromotionAuthorized: false,
    authorityExpanded: false,
    nextGate: selected.length ? 'explicit_owner_campaign_budget' : 'prepare_rights_cleared_curriculum',
    semantics: 'read_only_campaign_plan_no_provider_dispatch_no_spend_no_traffic_authorization' as const,
  })
}

/**
 * Read-only owner planning surface. It never creates one-time approvals or provider jobs. The maximum
 * cost is deliberately derived from the existing hard one-time ceilings, so a later campaign
 * authorization cannot quietly invent a larger per-job budget.
 */
export async function readMassDistillationCampaignPlan(requestedBatches?: number) {
  const db = cosServiceDb()
  if (!db) return { ok: false as const, error: 'service_database_unavailable' }
  const result = await db.from('cos_university_distillation_curriculum_batches')
    .select('batch_key,subject_id,source_count,student_model_id,dispatch_authorized')
    .eq('status', 'prepared')
    .eq('dispatch_authorized', false)
    .order('prepared_at', { ascending: true })
    .limit(100)
  if (result.error) return { ok: false as const, error: clean(result.error.message || result.error, 300) || 'database_error' }
  return Object.freeze({
    ok: true as const,
    plan: summarizeMassDistillationCampaign((result.data || []) as MassDistillationPreparedBatch[], requestedBatches),
  })
}
