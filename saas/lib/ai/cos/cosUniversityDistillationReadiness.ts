import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

export const COS_UNIVERSITY_DISTILLATION_READINESS_PROFILE = 'cos-university-distillation-readiness-v1' as const

export type DistillationReadinessSummaryInput = Readonly<{
  artifacts: readonly Readonly<{ status?: unknown; subject_id?: unknown; student_model_id?: unknown }>[]
  curriculum: readonly Readonly<{ status?: unknown; source_count?: unknown; subject_id?: unknown }>[]
  usage: readonly Readonly<{
    provider?: unknown
    route_owner?: unknown
    fallback_from_owned?: unknown
    provider_estimated_cost_usd?: unknown
    success?: unknown
  }>[]
}>

function clean(value: unknown, limit = 160): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function number(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function round(value: number, digits = 4): number {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}

export function summarizeUniversityDistillationReadiness(input: DistillationReadinessSummaryInput) {
  const artifactByStatus: Record<string, number> = {}
  const curriculumByStatus: Record<string, number> = {}
  const activeSubjects = new Set<string>()
  const studentModels = new Set<string>()
  let curriculumItems = 0
  let localOwnedRequests = 0
  let externalRequests = 0
  let deepinfraRequests = 0
  let runpodRequests = 0
  let ownedFallbackRequests = 0
  let successfulRequests = 0
  let externalEstimatedCostUsd = 0

  for (const row of input.artifacts || []) {
    const status = clean(row.status, 60) || 'unknown'
    artifactByStatus[status] = (artifactByStatus[status] || 0) + 1
    const model = clean(row.student_model_id, 240)
    if (model) studentModels.add(model)
    if (status === 'active') {
      const subject = clean(row.subject_id, 240)
      if (subject) activeSubjects.add(subject)
    }
  }

  for (const row of input.curriculum || []) {
    const status = clean(row.status, 60) || 'unknown'
    curriculumByStatus[status] = (curriculumByStatus[status] || 0) + 1
    curriculumItems += Math.max(0, Math.floor(number(row.source_count)))
  }

  for (const row of input.usage || []) {
    const provider = clean(row.provider, 120).toLowerCase()
    const owner = clean(row.route_owner, 40).toLowerCase()
    if (owner === 'itmounts') localOwnedRequests += 1
    else externalRequests += 1
    if (provider === 'deepinfra') deepinfraRequests += 1
    if (provider === 'runpod') runpodRequests += 1
    if (row.fallback_from_owned === true) ownedFallbackRequests += 1
    if (row.success === true) successfulRequests += 1
    if (owner !== 'itmounts') externalEstimatedCostUsd += number(row.provider_estimated_cost_usd)
  }

  const totalRequests = localOwnedRequests + externalRequests
  const totalArtifacts = Object.values(artifactByStatus).reduce((sum, count) => sum + count, 0)
  const preparedBatches = curriculumByStatus.prepared || 0
  return Object.freeze({
    profile: COS_UNIVERSITY_DISTILLATION_READINESS_PROFILE,
    artifacts: Object.freeze({
      total: totalArtifacts,
      byStatus: Object.freeze(artifactByStatus),
      active: artifactByStatus.active || 0,
      evaluationPending: artifactByStatus.evaluation_pending || 0,
      runtimePending: artifactByStatus.runtime_pending || 0,
      quarantined: artifactByStatus.quarantined || 0,
      activeSubjects: Object.freeze([...activeSubjects].sort()),
      studentModels: Object.freeze([...studentModels].sort()),
    }),
    curriculum: Object.freeze({
      totalBatches: Object.values(curriculumByStatus).reduce((sum, count) => sum + count, 0),
      preparedBatches,
      sourceItems: curriculumItems,
      byStatus: Object.freeze(curriculumByStatus),
    }),
    inference: Object.freeze({
      totalRequests,
      localOwnedRequests,
      externalRequests,
      deepinfraRequests,
      runpodRequests,
      ownedFallbackRequests,
      successfulRequests,
      localOwnedShare: totalRequests ? round(localOwnedRequests / totalRequests, 4) : null,
      deepinfraShare: totalRequests ? round(deepinfraRequests / totalRequests, 4) : null,
      fallbackShare: totalRequests ? round(ownedFallbackRequests / totalRequests, 4) : null,
      externalEstimatedCostUsd: round(externalEstimatedCostUsd, 6),
    }),
    independence: Object.freeze({
      goal: 'increase_local_owned_share_without_quality_regression',
      readyForMassTraining: preparedBatches > 0,
      productionLocalCoverageProven: totalRequests > 0 && localOwnedRequests > 0,
      fullyIndependent: totalRequests > 0 && externalRequests === 0 && ownedFallbackRequests === 0,
    }),
  })
}

async function safeRows<T>(operation: () => PromiseLike<{ data: T[] | null; error: any }>): Promise<{ rows: T[]; error: string | null }> {
  try {
    const result = await operation()
    if (result.error) return { rows: [], error: clean(result.error?.message || result.error, 300) || 'database_error' }
    return { rows: result.data || [], error: null }
  } catch (error) {
    return { rows: [], error: error instanceof Error ? clean(error.message, 300) : 'database_error' }
  }
}

/** Owner/reporting path only. Reads durable evidence and never triggers inference, training or deployment. */
export async function readUniversityDistillationReadiness(now = new Date(), lookbackHours = 24) {
  const db = cosServiceDb()
  if (!db) return { ok: false as const, error: 'service_database_unavailable' }
  const boundedHours = Math.max(1, Math.min(24 * 30, Math.floor(lookbackHours)))
  const since = new Date(now.getTime() - boundedHours * 60 * 60 * 1000).toISOString()

  const [artifacts, curriculum, usage] = await Promise.all([
    safeRows<any>(() => db.from('cos_local_distillation_artifacts')
      .select('status,subject_id,student_model_id,updated_at')
      .order('updated_at', { ascending: false })
      .limit(1000)),
    safeRows<any>(() => db.from('cos_university_distillation_curriculum_batches')
      .select('status,source_count,subject_id,prepared_at')
      .order('prepared_at', { ascending: false })
      .limit(1000)),
    safeRows<any>(() => db.from('provider_inference_usage')
      .select('provider,route_owner,fallback_from_owned,provider_estimated_cost_usd,success,created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5000)),
  ])

  const summary = summarizeUniversityDistillationReadiness({
    artifacts: artifacts.rows,
    curriculum: curriculum.rows,
    usage: usage.rows,
  })
  return Object.freeze({
    ok: true as const,
    generatedAt: now.toISOString(),
    lookbackHours: boundedHours,
    summary,
    partial: Boolean(artifacts.error || curriculum.error || usage.error),
    errors: Object.freeze({ artifacts: artifacts.error, curriculum: curriculum.error, usage: usage.error }),
    semantics: 'read_only_no_training_no_inference_no_provider_mutation' as const,
  })
}
