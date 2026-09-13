import { createHash } from 'node:crypto'
import {
  COS_UNIVERSITY_TRAINING_EXECUTOR_PROFILE,
  requireExplicitTrainingDispatchConfirmation,
  signTrainingExecutorPayload,
  trainingExecutorConfigFromEnv,
  verifyTrainingExecutorPayload,
} from './cosUniversityTrainingExecutor.ts'
import {
  decodeHuggingFaceDatasetRef,
  huggingFaceJobsConfigFromEnv,
  installHuggingFaceTrainingExecutorEnv,
  resolveHuggingFaceHardwareRate,
  resolveHuggingFaceModelMetadata,
} from './cosUniversityHuggingFaceJobs.ts'
import { registerCosUniversityDistillationTrainingPlan } from './cosUniversityDistillationDatasetPlan.ts'

export const COS_UNIVERSITY_TEACHER_DATASET_PROFILE = 'cos_university_teacher_dataset_v1' as const
export const DEFAULT_DISTILLATION_TEACHER_MODEL = 'Qwen/Qwen3-8B' as const
export const DEFAULT_DISTILLATION_STUDENT_MODEL = 'Qwen/Qwen3-4B' as const
export const TEACHER_DATASET_CALLBACK_PATH = '/api/internal/cos/university-distillation-teacher/evidence' as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HASH = /^[a-f0-9]{64}$/i
const COMMIT = /^[a-f0-9]{40}$/i

function clean(value: unknown, max = 4000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
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

function planId(candidateId: string): string {
  const match = /^study-plan:([0-9a-f-]+)$/i.exec(clean(candidateId, 120))
  if (!match || !UUID.test(match[1])) throw new Error('teacher_dataset_candidate_id_invalid')
  return match[1]
}

export type TeacherPrompt = Readonly<{ id: string; prompt: string }>

const REASONING_SKILLS = Object.freeze([
  {
    id: 'evidence_discrimination',
    instruction: 'Separate direct evidence, reasonable inference, and unsupported assumption. Recommend what can be concluded now and what evidence would change the conclusion.',
  },
  {
    id: 'causal_reasoning',
    instruction: 'Distinguish correlation from causation. Identify plausible confounders and propose the smallest useful test that would discriminate among competing explanations.',
  },
  {
    id: 'counterfactual_reasoning',
    instruction: 'Evaluate the proposed counterfactual without treating it as observed fact. State which premises are fixed, which consequences are modeled, and which claims remain uncertain.',
  },
  {
    id: 'decision_under_uncertainty',
    instruction: 'Choose an action under uncertainty using reversible steps, expected downside, information value, and explicit stop or escalation conditions.',
  },
  {
    id: 'argument_critique',
    instruction: 'Identify the strongest claim, the evidence actually supporting it, material logical gaps, and a stronger version of the argument that does not overclaim.',
  },
  {
    id: 'constraint_following',
    instruction: 'Satisfy every explicit constraint, especially requested scope and word budget. Do not drop a material qualification merely to sound decisive.',
  },
  {
    id: 'calibration',
    instruction: 'Give a calibrated conclusion. Distinguish known, likely, plausible, and unknown rather than manufacturing numeric confidence or certainty.',
  },
  {
    id: 'cross_domain_synthesis',
    instruction: 'Integrate the technical, operational, and human factors without letting one domain silently substitute for evidence from another.',
  },
] as const)

const PUBLIC_PRACTICE_CASES = Object.freeze([
  {
    id: 'software_incident',
    text: 'A service became slower after a deployment. CPU utilization rose, database latency did not, and a rollback restored normal latency. One engineer says the new code is definitely the root cause; another says the rollback proves nothing because traffic also fell by 8 percent.',
  },
  {
    id: 'security_alert',
    text: 'A security monitor reports repeated authentication failures followed by one successful login from a new device. The account owner was traveling, MFA remained enabled, and there is no evidence yet of data access after the login.',
  },
  {
    id: 'scientific_claim',
    text: 'A small observational study reports that people who used a new study technique scored higher. Participants selected their own technique, the groups differed in prior grades, and the result has not been replicated.',
  },
  {
    id: 'operations_change',
    text: 'A support team changed its triage process and average resolution time fell 18 percent. During the same month ticket volume fell 12 percent and two senior staff returned from leave.',
  },
  {
    id: 'procurement_choice',
    text: 'Two vendors meet the mandatory specification. Vendor A costs less and has limited reliability history. Vendor B costs more and has stronger reliability evidence but a longer delivery time. A decision is required before all uncertainty can be removed.',
  },
  {
    id: 'policy_pilot',
    text: 'A city piloted a traffic policy in one district and collisions fell. Nearby districts also improved during the same period, enforcement increased citywide, and seasonal traffic volume was lower than the previous quarter.',
  },
  {
    id: 'customer_escalation',
    text: 'A customer says a recent product change caused a billing error. Logs show the error occurred after the change, but only one account is affected and the billing provider also changed an API rule that day.',
  },
  {
    id: 'project_schedule',
    text: 'A project is five days behind plan. One dependency arrived three days late, the team added two unplanned requirements, and current estimates have wide uncertainty. Leadership asks whether the original launch date is still realistic.',
  },
] as const)

/**
 * Public, synthetic practice only. Candidate IDs, hidden exam content, Production prompts, private
 * memories, raw incident text, rubrics and user data are intentionally absent from these prompts.
 */
export function buildDistillationTeacherPromptSet(subjectId: unknown): Readonly<{
  profile: typeof COS_UNIVERSITY_TEACHER_DATASET_PROFILE
  subjectId: 'reasoning_decision_science'
  promptSetHash: string
  prompts: readonly TeacherPrompt[]
}> {
  if (clean(subjectId, 120) !== 'reasoning_decision_science') {
    throw new Error('teacher_dataset_subject_not_supported')
  }
  const prompts: TeacherPrompt[] = []
  for (const skill of REASONING_SKILLS) {
    for (const scenario of PUBLIC_PRACTICE_CASES) {
      const id = `${skill.id}:${scenario.id}`
      const prompt = [
        'Standalone public practice case for Reasoning & Decision Science.',
        `Case: ${scenario.text}`,
        `Task: ${skill.instruction}`,
        'Write a useful final response in 120-220 words unless the task itself requires a shorter answer.',
        'Use only facts stated in the case and general reasoning principles. Do not invent telemetry, laws, prices, people, sources, or events.',
        'Give the final answer and concise supporting reasons only. Do not reveal hidden chain-of-thought, scratch work, or internal reasoning traces.',
      ].join('\n\n')
      prompts.push(Object.freeze({ id, prompt }))
    }
  }
  const promptSetHash = hash(prompts)
  return Object.freeze({
    profile: COS_UNIVERSITY_TEACHER_DATASET_PROFILE,
    subjectId: 'reasoning_decision_science',
    promptSetHash,
    prompts: Object.freeze(prompts),
  })
}

async function readQualifiedPlan(candidateId: string) {
  const db = await serviceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_university_study_plans')
    .select('id,agent_id,subject_id,fine_tune_candidate,status,evidence')
    .eq('id', planId(candidateId)).maybeSingle()
  if (result.error) throw result.error
  const plan: any = result.data
  const qualification = record(record(plan?.evidence).distillationQualification)
  if (!plan || plan.fine_tune_candidate !== true || !['queued', 'studying', 'ready_for_exam'].includes(String(plan.status))) {
    throw new Error('teacher_dataset_candidate_not_authorized')
  }
  if (qualification.profile !== 'cos_university_distillation_preparation_v1'
    || qualification.eligible !== true
    || Number(qualification.repeatedFailures || 0) < 3
    || Number(qualification.independentRetestFailures || 0) < 2) {
    throw new Error('teacher_dataset_qualification_missing')
  }
  return plan as Readonly<{ id: string; agent_id: string; subject_id: string; evidence: unknown }>
}

async function recordAudit(input: {
  candidateId: string
  subjectId: string
  claim: 'teacher_dataset_dispatch_prepared' | 'teacher_dataset_job_dispatched' | 'teacher_dataset_registered'
  evidence: Record<string, unknown>
  verifier: 'host_controller' | 'training_executor'
}) {
  const db = await serviceDb()
  if (!db) throw new Error('service_database_unavailable')
  const evidence = {
    profile: COS_UNIVERSITY_TEACHER_DATASET_PROFILE,
    claim: input.claim,
    candidateId: input.candidateId,
    ...input.evidence,
    authorityExpanded: false,
  }
  const eventKey = hash([COS_UNIVERSITY_TEACHER_DATASET_PROFILE, input.claim, input.candidateId, evidence])
  const result = await db.from('cos_university_learning_assurance_events').upsert({
    event_key: eventKey,
    event_type: 'fine_tune',
    subject_id: input.subjectId,
    candidate_id: input.candidateId,
    evidence_hash: hash(evidence),
    evidence,
    verifier: input.verifier,
    observed_at: new Date().toISOString(),
  }, { onConflict: 'event_key', ignoreDuplicates: true })
  if (result.error) throw result.error
  return eventKey
}

type DispatchPort = (url: string, init: RequestInit) => Promise<Response>

async function dispatchSignedTeacherJob(input: {
  body: Record<string, unknown>
  idempotencyKey: string
  fetchImpl?: DispatchPort
}) {
  installHuggingFaceTrainingExecutorEnv()
  const config = trainingExecutorConfigFromEnv()
  if (!config) throw new Error('training_executor_not_configured')
  if (!config.dispatchEnabled) throw new Error('training_executor_dispatch_disabled')
  const rawBody = JSON.stringify(input.body)
  const timestamp = new Date().toISOString()
  const signature = signTrainingExecutorPayload({ secret: config.secret, timestamp, idempotencyKey: input.idempotencyKey, rawBody })
  const response = await (input.fetchImpl || fetch)(config.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-itmounts-training-profile': COS_UNIVERSITY_TRAINING_EXECUTOR_PROFILE,
      'x-itmounts-training-timestamp': timestamp,
      'x-itmounts-training-idempotency-key': input.idempotencyKey,
      'x-itmounts-training-signature': signature,
    },
    body: rawBody,
    redirect: 'error',
  })
  const responseBody = await response.text()
  const responseTimestamp = response.headers.get('x-itmounts-training-timestamp') || ''
  const responseKey = response.headers.get('x-itmounts-training-idempotency-key') || ''
  const responseSignature = response.headers.get('x-itmounts-training-signature') || ''
  if (!response.ok) throw new Error(`teacher_dataset_executor_rejected:${response.status}`)
  if (responseKey !== input.idempotencyKey || !verifyTrainingExecutorPayload({
    secret: config.secret,
    timestamp: responseTimestamp,
    idempotencyKey: responseKey,
    rawBody: responseBody,
    signature: responseSignature,
  })) throw new Error('teacher_dataset_executor_response_signature_invalid')
  let payload: any = null
  try { payload = JSON.parse(responseBody) } catch { payload = null }
  const jobId = clean(payload?.jobId, 240)
  if (payload?.accepted !== true || !jobId) throw new Error('teacher_dataset_executor_response_invalid')
  return Object.freeze({
    jobId,
    jobUrl: clean(payload?.jobUrl, 2000) || null,
    flavor: clean(payload?.flavor, 80) || null,
    hourlyCostUsd: Number(payload?.hourlyCostUsd),
    maxEstimatedCostUsd: Number(payload?.maxEstimatedCostUsd),
  })
}

export async function dispatchCosUniversityDistillationTeacherDataset(input: {
  candidateId: string
  confirmDispatch: unknown
  fetchImpl?: DispatchPort
}) {
  requireExplicitTrainingDispatchConfirmation(input.confirmDispatch)
  const plan = await readQualifiedPlan(input.candidateId)
  const prompts = buildDistillationTeacherPromptSet(plan.subject_id)
  const hf = huggingFaceJobsConfigFromEnv()
  if (!hf) throw new Error('huggingface_training_not_configured')

  const teacherModelId = clean(process.env.COS_UNIVERSITY_HF_TEACHER_MODEL, 240) || DEFAULT_DISTILLATION_TEACHER_MODEL
  const studentModelId = clean(process.env.COS_UNIVERSITY_HF_STUDENT_MODEL, 240) || DEFAULT_DISTILLATION_STUDENT_MODEL
  const teacher = await resolveHuggingFaceModelMetadata({ modelId: teacherModelId, token: hf.token, fetchImpl: input.fetchImpl })
  const student = await resolveHuggingFaceModelMetadata({ modelId: studentModelId, token: hf.token, fetchImpl: input.fetchImpl })
  if (teacher.license !== 'apache-2.0' || student.license !== 'apache-2.0') {
    throw new Error('teacher_dataset_open_license_not_proven')
  }
  if (teacher.modelId === student.modelId) throw new Error('teacher_dataset_teacher_student_not_separated')

  const hardware = await resolveHuggingFaceHardwareRate({ flavor: hf.teacherFlavor, token: hf.token, fetchImpl: input.fetchImpl })
  if (hardware.hourlyCostUsd > hf.maxHourlyCostUsd) throw new Error('huggingface_training_hourly_cost_cap_exceeded')
  const maxEstimatedCostUsd = Number((hardware.hourlyCostUsd * hf.teacherTimeoutSeconds / 3600).toFixed(6))
  const idempotencyKey = hash([
    COS_UNIVERSITY_TEACHER_DATASET_PROFILE,
    input.candidateId,
    prompts.promptSetHash,
    teacher.modelId,
    teacher.revision,
    student.modelId,
    student.revision,
  ])

  const envelope = {
    profile: COS_UNIVERSITY_TRAINING_EXECUTOR_PROFILE,
    operation: 'generate_teacher_dataset',
    candidateId: input.candidateId,
    subjectId: plan.subject_id,
    promptProfile: COS_UNIVERSITY_TEACHER_DATASET_PROFILE,
    promptSetHash: prompts.promptSetHash,
    prompts: prompts.prompts,
    teacher: { modelId: teacher.modelId, revision: teacher.revision, license: teacher.license },
    student: { modelId: student.modelId, revision: student.revision, license: student.license },
    trainingRights: 'open_license',
    studentControlledByBuyer: true,
    containsPrivateProductionData: false,
    callbackPath: TEACHER_DATASET_CALLBACK_PATH,
    authorityExpanded: false,
  }

  const auditBase = {
    idempotencyKey,
    promptSetHash: prompts.promptSetHash,
    promptCount: prompts.prompts.length,
    teacherModelId: teacher.modelId,
    teacherModelRevision: teacher.revision,
    teacherLicense: teacher.license,
    studentModelId: student.modelId,
    studentModelRevision: student.revision,
    studentLicense: student.license,
    studentControlledByBuyer: true,
    containsPrivateProductionData: false,
    trainingRights: 'open_license',
    flavor: hardware.flavor,
    hourlyCostUsd: hardware.hourlyCostUsd,
    timeoutSeconds: hf.teacherTimeoutSeconds,
    maxEstimatedCostUsd,
  }
  await recordAudit({
    candidateId: input.candidateId,
    subjectId: plan.subject_id,
    claim: 'teacher_dataset_dispatch_prepared',
    evidence: auditBase,
    verifier: 'host_controller',
  })
  const submitted = await dispatchSignedTeacherJob({ body: envelope, idempotencyKey, fetchImpl: input.fetchImpl })
  await recordAudit({
    candidateId: input.candidateId,
    subjectId: plan.subject_id,
    claim: 'teacher_dataset_job_dispatched',
    evidence: { ...auditBase, jobId: submitted.jobId, jobUrl: submitted.jobUrl },
    verifier: 'host_controller',
  })
  return Object.freeze({
    accepted: true,
    operation: 'generate_teacher_dataset' as const,
    candidateId: input.candidateId,
    jobId: submitted.jobId,
    jobUrl: submitted.jobUrl,
    teacherModel: `${teacher.modelId}@${teacher.revision}`,
    studentModel: `${student.modelId}@${student.revision}`,
    promptCount: prompts.prompts.length,
    flavor: hardware.flavor,
    hourlyCostUsd: hardware.hourlyCostUsd,
    maxEstimatedCostUsd,
  })
}

async function readTeacherDispatch(input: { candidateId: string; idempotencyKey: string; jobId: string }) {
  const db = await serviceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_university_learning_assurance_events')
    .select('subject_id,evidence,verifier,observed_at')
    .eq('event_type', 'fine_tune')
    .eq('candidate_id', input.candidateId)
    .eq('verifier', 'host_controller')
    .contains('evidence', {
      profile: COS_UNIVERSITY_TEACHER_DATASET_PROFILE,
      claim: 'teacher_dataset_job_dispatched',
      idempotencyKey: input.idempotencyKey,
      jobId: input.jobId,
    })
    .order('observed_at', { ascending: false })
    .limit(10)
  if (result.error) throw result.error
  for (const row of result.data || []) {
    const evidence = record(row.evidence)
    if (evidence.authorityExpanded !== false) continue
    return { subjectId: String(row.subject_id || ''), evidence }
  }
  throw new Error('teacher_dataset_dispatch_binding_missing')
}

function normalizedHashes(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(item => clean(item, 64).toLowerCase()).filter(item => HASH.test(item)))]
}

export async function recordCosUniversityDistillationTeacherDatasetEvidence(
  body: any,
  binding: { idempotencyKey: string },
) {
  if (body?.claim !== 'teacher_dataset_registered') throw new Error('teacher_dataset_claim_not_permitted')
  const candidateId = clean(body?.candidateId, 120)
  planId(candidateId)
  const jobId = clean(body?.jobId, 240)
  const idempotencyKey = clean(binding?.idempotencyKey, 128)
  if (!jobId || !idempotencyKey) throw new Error('teacher_dataset_callback_binding_missing')
  const dispatched = await readTeacherDispatch({ candidateId, idempotencyKey, jobId })
  const evidence = dispatched.evidence

  const sourceRef = clean(body?.sourceRef, 2000)
  const decoded = decodeHuggingFaceDatasetRef(sourceRef)
  if (!decoded || decoded.split !== 'train' || !decoded.revision || !COMMIT.test(decoded.revision)) {
    throw new Error('teacher_dataset_immutable_source_required')
  }
  const itemHashes = normalizedHashes(body?.teacherOutputItemHashes)
  if (itemHashes.length < 20) throw new Error('teacher_dataset_output_too_small')

  const exact = [
    ['promptSetHash', clean(body?.promptSetHash, 64).toLowerCase()],
    ['teacherModelId', clean(body?.teacherModelId, 240)],
    ['teacherModelRevision', clean(body?.teacherModelRevision, 40).toLowerCase()],
    ['studentModelId', clean(body?.studentModelId, 240)],
    ['studentModelRevision', clean(body?.studentModelRevision, 40).toLowerCase()],
  ] as const
  for (const [key, observed] of exact) {
    if (!observed || observed !== clean(evidence[key], 240).toLowerCase()) {
      throw new Error(`teacher_dataset_${key}_mismatch`)
    }
  }
  if (body?.containsPrivateProductionData !== false || evidence.containsPrivateProductionData !== false) {
    throw new Error('teacher_dataset_private_production_data_forbidden')
  }
  if (body?.studentControlledByBuyer !== true || evidence.studentControlledByBuyer !== true) {
    throw new Error('teacher_dataset_student_control_not_proven')
  }
  if (body?.trainingRights !== 'open_license' || evidence.trainingRights !== 'open_license') {
    throw new Error('teacher_dataset_training_rights_not_proven')
  }

  const provenanceRefs = [
    `hf://models/${evidence.teacherModelId}@${evidence.teacherModelRevision}`,
    `hf://models/${evidence.studentModelId}@${evidence.studentModelRevision}`,
    sourceRef,
    `prompt-set:sha256:${evidence.promptSetHash}`,
    'license:apache-2.0',
    'teacher-output:public-synthetic-practice-only',
  ]
  const registered = await registerCosUniversityDistillationTrainingPlan({
    candidateId,
    teacherModelId: String(evidence.teacherModelId),
    studentModelId: String(evidence.studentModelId),
    studentControlledByBuyer: true,
    sourceRef,
    provenanceRefs,
    trainingRights: 'open_license',
    containsPrivateProductionData: false,
    teacherOutputItemHashes: itemHashes,
  })
  await recordAudit({
    candidateId,
    subjectId: dispatched.subjectId,
    claim: 'teacher_dataset_registered',
    evidence: {
      idempotencyKey,
      jobId,
      sourceRef,
      teacherOutputItemCount: itemHashes.length,
      teacherOutputManifestHash: hash([...itemHashes].sort()),
      promptSetHash: evidence.promptSetHash,
      teacherModelId: evidence.teacherModelId,
      teacherModelRevision: evidence.teacherModelRevision,
      studentModelId: evidence.studentModelId,
      studentModelRevision: evidence.studentModelRevision,
      trainingCandidateId: registered.trainingCandidateId,
      trainingRights: 'open_license',
      studentControlledByBuyer: true,
      containsPrivateProductionData: false,
    },
    verifier: 'training_executor',
  })
  return Object.freeze({
    registered: true,
    sourceCandidateId: candidateId,
    trainingCandidateId: registered.trainingCandidateId,
    sourceRef,
    teacherOutputItemCount: itemHashes.length,
    autoExecuteTraining: false,
  })
}
