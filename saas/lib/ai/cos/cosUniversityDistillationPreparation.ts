import { createHash } from 'node:crypto'
import { decideModelDistillationCandidate, type ModelDistillationCandidateInput, type ModelDistillationTrainingRights } from './cosUniversityModelDistillation.ts'
import { decodeHuggingFaceDatasetRef } from './cosUniversityHuggingFaceJobs.ts'
import { selectCosUniversityStudyStrategy, type CosUniversityFailureClass } from './cosUniversityStudyStrategy.ts'
import { controlledFineTuneDatasetHash, type ControlledFineTunePlanIdentityInput } from './cosUniversityTrainingIdentity.ts'

export const COS_UNIVERSITY_DISTILLATION_PREPARATION_PROFILE = 'cos_university_distillation_preparation_v1' as const
const UNSEEN_EXAM_PROFILE = 'cos_university_unseen_v1'
const HASH = /^[a-f0-9]{64}$/i
const HF_COMMIT_SHA = /^[a-f0-9]{40}$/i

export type DistillationExamRun = Readonly<{
  id: string
  profile?: string | null
  status: 'passed' | 'failed' | string
  manifest_hash?: string | null
  completed_at?: string | null
  execution_provenance?: unknown
}>

export type DistillationFailureQualification = Readonly<{
  eligible: boolean
  repeatedFailures: number
  independentRetestFailures: number
  failedRunIds: readonly string[]
  manifestHashes: readonly string[]
  latestFailureAt: string | null
  lastPassAt: string | null
  blockers: readonly string[]
}>

export type DistillationDatasetBindingInput = Readonly<{
  plan: ControlledFineTunePlanIdentityInput & { evidence?: unknown }
  teacherModelId: string
  studentModelId: string
  studentControlledByBuyer: boolean
  sourceRef: string
  provenanceRefs: readonly string[]
  trainingRights: ModelDistillationTrainingRights
  containsPrivateProductionData: boolean
  teacherOutputItemHashes: readonly string[]
}>

export type DistillationDatasetBindingDecision = Readonly<{
  eligible: boolean
  blockers: readonly string[]
  datasetHash: string | null
  teacherOutputManifestHash: string | null
  candidate: ModelDistillationCandidateInput | null
  binding: Readonly<Record<string, unknown>> | null
}>

type ActivePlanRow = ControlledFineTunePlanIdentityInput & Readonly<{
  id: string
  agent_id: string
  language_code: string | null
  language_dimension: string | null
  failure_class: CosUniversityFailureClass
  fine_tune_candidate: boolean
  status: string
  evidence: unknown
}>

function clean(value: unknown, max = 2000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

async function serviceDb() {
  const { cosServiceDb } = await import('../../cos-core/storage/supabase.ts')
  return cosServiceDb()
}

function validTime(value: unknown): number | null {
  const parsed = Date.parse(clean(value, 100))
  return Number.isFinite(parsed) ? parsed : null
}

function manifestHash(row: DistillationExamRun): string | null {
  const direct = clean(row.manifest_hash, 64).toLowerCase()
  if (HASH.test(direct)) return direct
  const provenance = record(row.execution_provenance)
  const nested = clean(provenance.manifestHash, 64).toLowerCase()
  return HASH.test(nested) ? nested : null
}

/**
 * The active failure episode begins after the most recent passed unseen exam. Replays of one hidden
 * manifest count as repeated failures but not as independent retests. A newer pass resets the
 * episode, so old failures cannot manufacture a distillation candidate after the weakness clears.
 */
export function deriveDistillationFailureQualification(rows: readonly DistillationExamRun[]): DistillationFailureQualification {
  const ordered = rows
    .filter(row => clean(row.profile, 100) === UNSEEN_EXAM_PROFILE && ['passed', 'failed'].includes(clean(row.status, 20)))
    .map(row => ({ row, at: validTime(row.completed_at) }))
    .filter((entry): entry is { row: DistillationExamRun; at: number } => entry.at !== null)
    .sort((a, b) => b.at - a.at)

  const blockers: string[] = []
  if (!ordered.length) blockers.push('independent_retest_evidence_missing')
  const latest = ordered[0]
  if (latest && latest.row.status !== 'failed') blockers.push('latest_unseen_outcome_not_failed')

  const latestPass = ordered.find(entry => entry.row.status === 'passed') || null
  const episode = ordered.filter(entry => entry.row.status === 'failed' && (!latestPass || entry.at > latestPass.at))
  const failedRunIds = [...new Set(episode.map(entry => clean(entry.row.id, 100)).filter(Boolean))]
  const manifestHashes = [...new Set(episode.map(entry => manifestHash(entry.row)).filter((value): value is string => Boolean(value)))]
  const repeatedFailures = failedRunIds.length
  const independentRetestFailures = manifestHashes.length

  if (repeatedFailures < 3) blockers.push('repeated_failure_threshold_not_met')
  if (independentRetestFailures < 2) blockers.push('independent_retest_threshold_not_met')

  return Object.freeze({
    eligible: blockers.length === 0,
    repeatedFailures,
    independentRetestFailures,
    failedRunIds: Object.freeze(failedRunIds),
    manifestHashes: Object.freeze(manifestHashes),
    latestFailureAt: episode[0] ? new Date(episode[0].at).toISOString() : null,
    lastPassAt: latestPass ? new Date(latestPass.at).toISOString() : null,
    blockers: Object.freeze(blockers),
  })
}

function readQualification(evidence: unknown): DistillationFailureQualification | null {
  const value = record(record(evidence).distillationQualification)
  const failedRunIds = Array.isArray(value.failedRunIds) ? value.failedRunIds.map(item => clean(item, 100)).filter(Boolean) : []
  const manifestHashes = Array.isArray(value.manifestHashes)
    ? value.manifestHashes.map(item => clean(item, 64).toLowerCase()).filter(item => HASH.test(item))
    : []
  const repeatedFailures = Math.max(0, Math.floor(Number(value.repeatedFailures || 0)))
  const independentRetestFailures = Math.max(0, Math.floor(Number(value.independentRetestFailures || 0)))
  if (value.profile !== COS_UNIVERSITY_DISTILLATION_PREPARATION_PROFILE || value.eligible !== true) return null
  if (repeatedFailures < 3 || independentRetestFailures < 2 || failedRunIds.length < 3 || manifestHashes.length < 2) return null
  return Object.freeze({
    eligible: true,
    repeatedFailures,
    independentRetestFailures,
    failedRunIds: Object.freeze([...new Set(failedRunIds)]),
    manifestHashes: Object.freeze([...new Set(manifestHashes)]),
    latestFailureAt: clean(value.latestFailureAt, 100) || null,
    lastPassAt: clean(value.lastPassAt, 100) || null,
    blockers: Object.freeze([]),
  })
}

function pinnedDatasetRef(value: unknown): boolean {
  const decoded = decodeHuggingFaceDatasetRef(value)
  return Boolean(decoded?.revision && HF_COMMIT_SHA.test(decoded.revision))
}

function hashItems(items: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify({ items: [...items].sort() })).digest('hex')
}

/**
 * Validate an already-created teacher-output dataset before attaching it to a training candidate.
 * This is pure metadata validation: it uploads nothing and cannot launch a Hugging Face Job.
 */
export function buildDistillationDatasetBinding(input: DistillationDatasetBindingInput): DistillationDatasetBindingDecision {
  const blockers: string[] = []
  const sourceRef = clean(input.sourceRef, 2000)
  if (!pinnedDatasetRef(sourceRef)) blockers.push('distillation_dataset_revision_not_pinned')

  const itemHashes = [...new Set((input.teacherOutputItemHashes || [])
    .map(item => clean(item, 64).toLowerCase())
    .filter(item => HASH.test(item)))]
  if (itemHashes.length < 20) blockers.push('teacher_output_dataset_too_small')

  const qualification = readQualification(input.plan.evidence)
  if (!qualification) blockers.push('distillation_failure_qualification_missing')
  if (blockers.length) {
    return Object.freeze({ eligible: false, blockers: Object.freeze(blockers), datasetHash: null, teacherOutputManifestHash: null, candidate: null, binding: null })
  }

  const datasetHash = controlledFineTuneDatasetHash(input.plan, { trainingSourceRef: sourceRef })
  const teacherOutputManifestHash = hashItems(itemHashes)
  const candidate: ModelDistillationCandidateInput = {
    teacherModelId: clean(input.teacherModelId, 240),
    studentModelId: clean(input.studentModelId, 240),
    datasetHash,
    provenanceRefs: [...new Set((input.provenanceRefs || []).map(item => clean(item, 1000)).filter(Boolean))],
    trainingRights: input.trainingRights,
    studentControlledByBuyer: input.studentControlledByBuyer === true,
    containsPrivateProductionData: input.containsPrivateProductionData,
    repeatedFailures: qualification!.repeatedFailures,
    independentRetestFailures: qualification!.independentRetestFailures,
  }
  const decision = decideModelDistillationCandidate(candidate)
  if (!decision.candidate) blockers.push(...decision.blockers)
  if (blockers.length) {
    return Object.freeze({ eligible: false, blockers: Object.freeze([...new Set(blockers)]), datasetHash, teacherOutputManifestHash, candidate, binding: null })
  }

  const binding = Object.freeze({
    profile: COS_UNIVERSITY_DISTILLATION_PREPARATION_PROFILE,
    sourceRef,
    datasetHash,
    teacherOutputManifestHash,
    teacherOutputItemCount: itemHashes.length,
    teacherModelId: candidate.teacherModelId,
    studentModelId: candidate.studentModelId,
    trainingRights: candidate.trainingRights,
    provenanceRefs: [...candidate.provenanceRefs],
    studentControlledByBuyer: true,
    containsPrivateProductionData: false,
    qualification: {
      repeatedFailures: qualification!.repeatedFailures,
      independentRetestFailures: qualification!.independentRetestFailures,
      failedRunIds: [...qualification!.failedRunIds],
      manifestHashes: [...qualification!.manifestHashes],
    },
    autoExecuteTraining: false,
    authorityExpanded: false,
  })
  return Object.freeze({ eligible: true, blockers: Object.freeze([]), datasetHash, teacherOutputManifestHash, candidate, binding })
}

async function examHistoryForPlan(plan: ActivePlanRow): Promise<DistillationExamRun[]> {
  const db = await serviceDb()
  if (!db) return []
  let query = db.from('cos_university_exam_runs')
    .select('id,profile,status,manifest_hash,completed_at,execution_provenance')
    .eq('agent_id', plan.agent_id)
    .eq('profile', UNSEEN_EXAM_PROFILE)
    .in('status', ['passed', 'failed'])
  if (plan.language_code && plan.language_dimension) {
    query = query.eq('target_kind', 'language').eq('language_code', plan.language_code).eq('language_dimension', plan.language_dimension)
  } else {
    query = query.eq('target_kind', 'subject').eq('subject_id', clean(plan.subject_id, 120))
  }
  const result = await query.order('completed_at', { ascending: false }).limit(100)
  if (result.error) throw result.error
  return (result.data || []) as DistillationExamRun[]
}

/**
 * Non-spending reconciliation. It can promote an unresolved remediation row to candidate status
 * after durable unseen-failure evidence crosses the existing 3/2 threshold. It cannot attach a
 * dataset, approve training, enable dispatch, call Hugging Face, or expand model authority.
 */
export async function reconcileCosUniversityDistillationCandidates(now = new Date()) {
  const db = await serviceDb()
  if (!db) return { considered: 0, eligible: 0, promoted: 0, candidates: [], semantics: 'service_database_unavailable' as const }
  const result = await db.from('cos_university_study_plans')
    .select('id,plan_key,agent_id,subject_id,language_code,language_dimension,failure_class,objective,methods,source_ref,fine_tune_candidate,status,evidence')
    .eq('source_kind', 'recertification')
    .in('status', ['queued', 'studying', 'ready_for_exam'])
    .order('updated_at', { ascending: false })
    .limit(40)
  if (result.error) throw result.error

  let eligible = 0
  let promoted = 0
  const candidates: Array<Record<string, unknown>> = []
  for (const raw of result.data || []) {
    const plan = raw as ActivePlanRow
    const qualification = deriveDistillationFailureQualification(await examHistoryForPlan(plan))
    if (!qualification.eligible) continue
    eligible += 1
    const strategy = selectCosUniversityStudyStrategy({
      failureClass: plan.failure_class,
      repeatedFailures: qualification.repeatedFailures,
      independentRetestFailures: qualification.independentRetestFailures,
    })
    if (!strategy.fineTuneCandidate) continue

    const evidence = {
      ...record(plan.evidence),
      learningDesign: strategy.learningDesign,
      distillationQualification: {
        profile: COS_UNIVERSITY_DISTILLATION_PREPARATION_PROFILE,
        eligible: true,
        repeatedFailures: qualification.repeatedFailures,
        independentRetestFailures: qualification.independentRetestFailures,
        failedRunIds: [...qualification.failedRunIds],
        manifestHashes: [...qualification.manifestHashes],
        latestFailureAt: qualification.latestFailureAt,
        lastPassAt: qualification.lastPassAt,
        qualifiedAt: now.toISOString(),
        academicCredit: false,
        autoExecuteTraining: false,
        authorityExpanded: false,
      },
    }
    if (!plan.fine_tune_candidate) {
      const update = await db.from('cos_university_study_plans').update({
        fine_tune_candidate: true,
        methods: strategy.methods,
        evidence,
        updated_at: now.toISOString(),
      }).eq('id', plan.id).eq('fine_tune_candidate', false).in('status', ['queued', 'studying', 'ready_for_exam'])
      if (update.error) throw update.error
      promoted += 1
    }
    candidates.push({
      candidateId: `study-plan:${plan.id}`,
      agentId: plan.agent_id,
      subjectId: plan.subject_id,
      repeatedFailures: qualification.repeatedFailures,
      independentRetestFailures: qualification.independentRetestFailures,
      promoted: !plan.fine_tune_candidate,
    })
  }
  return Object.freeze({
    considered: (result.data || []).length,
    eligible,
    promoted,
    candidates: Object.freeze(candidates),
    semantics: 'candidate_only_no_dataset_no_dispatch_no_training' as const,
  })
}
