import { createHash } from 'node:crypto'
import { buildDistillationDatasetBinding, type DistillationDatasetBindingInput } from './cosUniversityDistillationPreparation.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function clean(value: unknown, max = 2000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function hash(parts: readonly unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex')
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

function candidateUuid(candidateId: string): string {
  const match = /^study-plan:([0-9a-f-]+)$/i.exec(clean(candidateId, 100))
  if (!match || !UUID.test(match[1])) throw new Error('distillation_dataset_candidate_id_invalid')
  return match[1]
}

export type DistillationTrainingPlanSource = Readonly<{
  id: string
  plan_key: string
  agent_id: string
  subject_id: string | null
  language_code: string | null
  language_dimension: string | null
  failure_class: string | null
  objective: string | null
  methods: unknown
  acquisition_source_kinds: unknown
  source_ref: string | null
  fine_tune_candidate: boolean
  status: string
  evidence: unknown
}>

/**
 * Build a dedicated training row instead of rewriting the remediation row. The remediation source
 * remains the failed exam/run lineage; the training row receives the immutable hf:// dataset source.
 */
export function buildDistillationTrainingPlan(input: Omit<DistillationDatasetBindingInput, 'plan'> & {
  sourcePlan: DistillationTrainingPlanSource
}) {
  const sourceRef = clean(input.sourceRef, 2000)
  const studentModelId = clean(input.studentModelId, 240)
  const teacherModelId = clean(input.teacherModelId, 240)
  const planKey = hash(['distillation_training_plan_v1', input.sourcePlan.plan_key, sourceRef, teacherModelId, studentModelId])
  const objective = `Run a controlled, evidence-gated model-distillation experiment for the unresolved ${clean(input.sourcePlan.subject_id, 120) || 'University'} weakness. Training data is bound to an immutable teacher-output dataset; promotion still requires independent evaluation, safety, unseen transfer, delayed retention, Production canary, and rollback proof.`
  const prospectivePlan = {
    plan_key: planKey,
    subject_id: input.sourcePlan.subject_id,
    failure_class: input.sourcePlan.failure_class,
    objective,
    methods: input.sourcePlan.methods,
    source_ref: sourceRef,
    evidence: input.sourcePlan.evidence,
  }
  const binding = buildDistillationDatasetBinding({ ...input, plan: prospectivePlan })
  if (!binding.eligible || !binding.binding || !binding.candidate) {
    return Object.freeze({ eligible: false, blockers: binding.blockers, plan: null, candidate: binding.candidate })
  }
  return Object.freeze({
    eligible: true,
    blockers: Object.freeze([]),
    candidate: binding.candidate,
    plan: Object.freeze({
      plan_key: planKey,
      agent_id: input.sourcePlan.agent_id,
      subject_id: input.sourcePlan.subject_id,
      language_code: input.sourcePlan.language_code,
      language_dimension: input.sourcePlan.language_dimension,
      failure_class: input.sourcePlan.failure_class,
      target_grade: 'A+',
      source_kind: 'operational_weakness',
      source_ref: sourceRef,
      problem_class: `model_distillation:${clean(input.sourcePlan.subject_id, 120) || 'unscoped'}`,
      objective,
      methods: input.sourcePlan.methods,
      acquisition_source_kinds: input.sourcePlan.acquisition_source_kinds,
      fine_tune_candidate: true,
      priority: 100,
      status: 'queued',
      evidence: {
        sourceCandidateId: `study-plan:${input.sourcePlan.id}`,
        sourcePlanKey: input.sourcePlan.plan_key,
        sourcePlanEvidence: record(input.sourcePlan.evidence).distillationQualification || null,
        distillationDataset: binding.binding,
        distillationCandidate: binding.candidate,
        academicCredit: false,
        autoExecuteTraining: false,
        authorityExpanded: false,
      },
    }),
  })
}

/**
 * Register metadata for a pre-existing teacher-output dataset. This cannot enable dispatch, approve
 * training, submit a Hugging Face Job, or spend credits.
 */
export async function registerCosUniversityDistillationTrainingPlan(input: Omit<DistillationDatasetBindingInput, 'plan'> & {
  candidateId: string
}) {
  const db = await serviceDb()
  if (!db) throw new Error('service_database_unavailable')
  const sourceId = candidateUuid(input.candidateId)
  const result = await db.from('cos_university_study_plans')
    .select('id,plan_key,agent_id,subject_id,language_code,language_dimension,failure_class,objective,methods,acquisition_source_kinds,source_ref,fine_tune_candidate,status,evidence')
    .eq('id', sourceId).maybeSingle()
  if (result.error) throw result.error
  const sourcePlan = result.data as DistillationTrainingPlanSource | null
  if (!sourcePlan || sourcePlan.fine_tune_candidate !== true || !['queued', 'studying', 'ready_for_exam'].includes(sourcePlan.status)) {
    throw new Error('distillation_dataset_candidate_not_authorized')
  }

  const built = buildDistillationTrainingPlan({ ...input, sourcePlan })
  if (!built.eligible || !built.plan || !built.candidate) {
    throw new Error(`distillation_dataset_blocked:${built.blockers.join(',')}`)
  }
  const now = new Date().toISOString()
  const inserted = await db.from('cos_university_study_plans').upsert({
    ...built.plan,
    last_seen_at: now,
    updated_at: now,
  }, { onConflict: 'plan_key', ignoreDuplicates: true })
  if (inserted.error) throw inserted.error

  const created = await db.from('cos_university_study_plans')
    .select('id,plan_key,source_ref,fine_tune_candidate,status,evidence')
    .eq('plan_key', built.plan.plan_key).maybeSingle()
  if (created.error) throw created.error
  if (!created.data) throw new Error('distillation_training_plan_registration_missing')
  return Object.freeze({
    registered: true,
    sourceCandidateId: input.candidateId,
    trainingCandidateId: `study-plan:${created.data.id}`,
    sourceRef: created.data.source_ref,
    datasetHash: built.candidate.datasetHash,
    distillationCandidate: built.candidate,
    autoExecuteTraining: false,
  })
}
