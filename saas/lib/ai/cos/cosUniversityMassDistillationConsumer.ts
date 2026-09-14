import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  classifyMassDistillationRights,
  MASS_DISTILLATION_MIN_CONFIDENCE,
} from './cosUniversityMassDistillation.ts'
import {
  buildHuggingFaceJobSpec,
  decodeHuggingFaceDatasetRef,
  huggingFaceJobsConfigFromEnv,
  installHuggingFaceTrainingExecutorEnv,
  resolveHuggingFaceHardwareRate,
  resolveHuggingFaceModelMetadata,
  resolveHuggingFaceNamespace,
  submitHuggingFaceJob,
  type HuggingFaceJobsConfig,
} from './cosUniversityHuggingFaceJobs.ts'
import { trainingExecutorConfigFromEnv } from './cosUniversityTrainingExecutor.ts'

export const COS_UNIVERSITY_MASS_DISTILLATION_CAMPAIGN_PROFILE = 'cos-university-mass-distillation-campaign-v1' as const
export const MASS_DISTILLATION_CALLBACK_PATH = '/api/internal/cos/mass-distillation/evidence' as const
export const MASS_DISTILLATION_TEACHER_MODEL = 'Qwen/Qwen3-8B' as const
export const MASS_DISTILLATION_STUDENT_MODEL = 'Qwen/Qwen3-4B' as const
export const MASS_DISTILLATION_TEACHER_COST_CEILING_USD = 0.20 as const
export const MASS_DISTILLATION_PREPARATION_COST_CEILING_USD = 0.015 as const
export const MASS_DISTILLATION_TRAINING_COST_CEILING_USD = 1.61 as const

const HEX64 = /^[a-f0-9]{64}$/i
const HEX40 = /^[a-f0-9]{40}$/i
const MASS_CANDIDATE = /^mass:([0-9a-f-]{36}):([a-f0-9]{16})$/i

type Stage = 'teacher_dispatching' | 'preparation_dispatching' | 'training_dispatching'
type FetchPort = (url: string, init?: RequestInit) => Promise<Response>

type Claim = Readonly<{
  run_id: string
  campaign_id: string
  batch_key: string
  candidate_id: string
  subject_id: string
  student_model_id: string
  stage: Stage
  stage_cost_ceiling_usd: number
}>

function clean(value: unknown, limit = 4000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return clean(message, 300) || 'mass_distillation_unknown_error'
}

function normalizedHashes(value: unknown, min = 1, max = 500): string[] | null {
  if (!Array.isArray(value) || value.length < min || value.length > max) return null
  const out = value.map(item => clean(item, 64).toLowerCase())
  if (out.some(item => !HEX64.test(item)) || new Set(out).size !== out.length) return null
  return out
}

function manifestHash(items: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify({ items: [...items].sort() })).digest('hex')
}

function boundedFacts(value: unknown): string {
  if (!Array.isArray(value)) return ''
  return value.slice(0, 8).map(item => {
    if (typeof item === 'string') return clean(item, 1200)
    try { return clean(JSON.stringify(item), 1200) } catch { return '' }
  }).filter(Boolean).join('\n- ')
}

function stageCeiling(stage: Stage): number {
  if (stage === 'teacher_dispatching') return MASS_DISTILLATION_TEACHER_COST_CEILING_USD
  if (stage === 'preparation_dispatching') return MASS_DISTILLATION_PREPARATION_COST_CEILING_USD
  return MASS_DISTILLATION_TRAINING_COST_CEILING_USD
}

function boundedConfigForStage(
  config: HuggingFaceJobsConfig,
  stage: Stage,
  hourlyCostUsd: number,
  costCeilingUsd: number,
): HuggingFaceJobsConfig {
  if (!Number.isFinite(hourlyCostUsd) || hourlyCostUsd <= 0) throw new Error('mass_distillation_hardware_price_invalid')
  const maxSeconds = Math.floor(costCeilingUsd * 3600 / hourlyCostUsd)
  const minimum = stage === 'training_dispatching' ? 900 : 300
  if (maxSeconds < minimum) throw new Error('mass_distillation_stage_budget_too_small_for_hardware')
  if (stage === 'teacher_dispatching') {
    return Object.freeze({ ...config, teacherTimeoutSeconds: Math.min(config.teacherTimeoutSeconds, maxSeconds) })
  }
  if (stage === 'preparation_dispatching') {
    return Object.freeze({ ...config, preparationTimeoutSeconds: Math.min(config.preparationTimeoutSeconds, maxSeconds) })
  }
  return Object.freeze({ ...config, trainingTimeoutSeconds: Math.min(config.trainingTimeoutSeconds, maxSeconds) })
}

async function recordAssurance(input: {
  candidateId: string
  subjectId: string
  claim: string
  evidence: Record<string, unknown>
  verifier: 'host_controller' | 'training_executor'
}) {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const evidence = {
    profile: COS_UNIVERSITY_MASS_DISTILLATION_CAMPAIGN_PROFILE,
    claim: input.claim,
    candidateId: input.candidateId,
    ...input.evidence,
    authorityExpanded: false,
  }
  const evidenceHash = hash(evidence)
  const eventKey = hash([COS_UNIVERSITY_MASS_DISTILLATION_CAMPAIGN_PROFILE, input.claim, input.candidateId, evidenceHash])
  const result = await db.from('cos_university_learning_assurance_events').upsert({
    event_key: eventKey,
    event_type: 'fine_tune',
    subject_id: input.subjectId,
    candidate_id: input.candidateId,
    evidence_hash: evidenceHash,
    evidence,
    verifier: input.verifier,
    observed_at: new Date().toISOString(),
  }, { onConflict: 'event_key', ignoreDuplicates: true })
  if (result.error) throw result.error
}

async function markFailure(runId: string, campaignId: string, candidateId: string, subjectId: string, error: unknown) {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const reason = safeError(error)
  const now = new Date().toISOString()
  const run = await db.from('cos_university_mass_distillation_batch_runs')
    .update({ stage: 'failed', failure_reason: reason, updated_at: now })
    .eq('id', runId)
    .neq('stage', 'complete')
  if (run.error) throw run.error
  const campaign = await db.from('cos_university_mass_distillation_campaigns')
    .update({ status: 'failed', updated_at: now })
    .eq('id', campaignId)
    .in('status', ['authorized', 'active'])
  if (campaign.error) throw campaign.error
  await recordAssurance({
    candidateId,
    subjectId,
    claim: 'mass_distillation_stage_failed',
    evidence: { campaignId, runId, reason, automaticRetryAuthorized: false },
    verifier: 'host_controller',
  }).catch(() => null)
}

async function loadRunBundle(runId: string) {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const runResult = await db.from('cos_university_mass_distillation_batch_runs')
    .select('*')
    .eq('id', runId)
    .maybeSingle()
  if (runResult.error) throw runResult.error
  const run: any = runResult.data
  if (!run) throw new Error('mass_distillation_run_missing')
  const batchResult = await db.from('cos_university_distillation_curriculum_batches')
    .select('batch_key,curriculum_hash,subject_id,student_model_id,source_hashes,source_count,rights_classes,status,dispatch_authorized,authority_expanded')
    .eq('batch_key', run.batch_key)
    .maybeSingle()
  if (batchResult.error) throw batchResult.error
  const batch: any = batchResult.data
  if (!batch || batch.status !== 'prepared' || batch.dispatch_authorized !== false || batch.authority_expanded !== false) {
    throw new Error('mass_distillation_batch_contract_invalid')
  }
  if (batch.student_model_id !== MASS_DISTILLATION_STUDENT_MODEL || run.student_model_id !== MASS_DISTILLATION_STUDENT_MODEL) {
    throw new Error('mass_distillation_student_model_mismatch')
  }
  const sourceHashes = normalizedHashes(batch.source_hashes, 20, 128)
  if (!sourceHashes || sourceHashes.length !== Number(batch.source_count) || sourceHashes.length !== Number(run.source_count)) {
    throw new Error('mass_distillation_source_identity_invalid')
  }
  return { run, batch, sourceHashes }
}

async function buildTeacherPrompts(subjectId: string, sourceHashes: readonly string[]) {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const rows = await db.from('cos_continuous_learning')
    .select('content_hash,source_title,subject,summary,facts,confidence,license')
    .in('content_hash', [...sourceHashes])
    .limit(128)
  if (rows.error) throw rows.error
  const byHash = new Map((rows.data || []).map((row: any) => [clean(row.content_hash, 64).toLowerCase(), row]))
  if (byHash.size !== sourceHashes.length) throw new Error('mass_distillation_rights_cleared_source_missing')

  const prompts = sourceHashes.map(contentHash => {
    const row: any = byHash.get(contentHash)
    if (!row
      || Number(row.confidence) < MASS_DISTILLATION_MIN_CONFIDENCE
      || !classifyMassDistillationRights(row.license)) {
      throw new Error('mass_distillation_source_rights_recheck_failed')
    }
    const facts = boundedFacts(row.facts)
    const prompt = [
      `Standalone rights-cleared learning case for ${clean(subjectId, 240)}.`,
      clean(row.source_title, 400) ? `Source topic: ${clean(row.source_title, 400)}.` : '',
      `Retained public-domain/CC0 summary: ${clean(row.summary, 7000)}`,
      facts ? `Retained facts:\n- ${facts}` : '',
      'Task: turn the supplied material into one rigorous standalone teaching example that explains the important concept, shows how to apply it, and includes a useful check or counterexample where appropriate.',
      'Use only the supplied material and generally valid reasoning. Do not invent citations, telemetry, people, prices, laws, or events. Do not reproduce hidden chain-of-thought. Return only the final teaching response.',
    ].filter(Boolean).join('\n\n').slice(0, 11_800)
    return Object.freeze({ id: contentHash, prompt })
  })
  if (prompts.length < 20 || prompts.length > 128) throw new Error('mass_distillation_teacher_prompt_count_invalid')
  return Object.freeze({ prompts: Object.freeze(prompts), promptSetHash: hash(prompts) })
}

function expectedStageAfterDispatch(stage: Stage) {
  if (stage === 'teacher_dispatching') return 'teacher_dispatched'
  if (stage === 'preparation_dispatching') return 'preparation_dispatched'
  return 'training_dispatched'
}

async function dispatchClaim(claim: Claim, fetchImpl?: FetchPort) {
  if (!MASS_CANDIDATE.test(claim.candidate_id) || !HEX64.test(claim.batch_key)) {
    throw new Error('mass_distillation_claim_identity_invalid')
  }
  const expectedCeiling = stageCeiling(claim.stage)
  if (Math.abs(Number(claim.stage_cost_ceiling_usd) - expectedCeiling) > 0.000001) {
    throw new Error('mass_distillation_claim_cost_ceiling_mismatch')
  }

  installHuggingFaceTrainingExecutorEnv()
  const executor = trainingExecutorConfigFromEnv()
  const hf = huggingFaceJobsConfigFromEnv()
  if (!executor || !hf) throw new Error('mass_distillation_huggingface_not_configured')
  if (!executor.dispatchEnabled || process.env.COS_UNIVERSITY_TRAINING_EXECUTOR_DISPATCH_ENABLED !== 'true') {
    throw new Error('mass_distillation_global_dispatch_disabled')
  }

  const { run, batch, sourceHashes } = await loadRunBundle(claim.run_id)
  if (run.stage !== claim.stage || run.campaign_id !== claim.campaign_id || run.candidate_id !== claim.candidate_id) {
    throw new Error('mass_distillation_claim_fence_lost')
  }

  let envelope: Record<string, unknown>
  let idempotencyKey: string
  let hardwareFlavor: string
  let preDispatch: Record<string, unknown> = {}

  if (claim.stage === 'teacher_dispatching') {
    const promptSet = await buildTeacherPrompts(run.subject_id, sourceHashes)
    const teacherModelId = clean(process.env.COS_UNIVERSITY_HF_TEACHER_MODEL, 240) || MASS_DISTILLATION_TEACHER_MODEL
    const teacher = await resolveHuggingFaceModelMetadata({ modelId: teacherModelId, token: hf.token, fetchImpl })
    const student = await resolveHuggingFaceModelMetadata({ modelId: MASS_DISTILLATION_STUDENT_MODEL, token: hf.token, fetchImpl })
    if (teacher.license !== 'apache-2.0' || student.license !== 'apache-2.0' || teacher.modelId === student.modelId) {
      throw new Error('mass_distillation_model_rights_invalid')
    }
    idempotencyKey = hash([COS_UNIVERSITY_MASS_DISTILLATION_CAMPAIGN_PROFILE, claim.campaign_id, claim.batch_key, 'teacher', promptSet.promptSetHash, teacher.revision, student.revision])
    envelope = {
      profile: 'cos_university_training_executor_v1',
      operation: 'generate_teacher_dataset',
      candidateId: run.candidate_id,
      subjectId: run.subject_id,
      promptProfile: COS_UNIVERSITY_MASS_DISTILLATION_CAMPAIGN_PROFILE,
      promptSetHash: promptSet.promptSetHash,
      prompts: promptSet.prompts,
      teacher: { modelId: teacher.modelId, revision: teacher.revision, license: teacher.license },
      student: { modelId: student.modelId, revision: student.revision, license: student.license },
      trainingRights: 'open_license',
      studentControlledByBuyer: true,
      containsPrivateProductionData: false,
      callbackPath: MASS_DISTILLATION_CALLBACK_PATH,
      authorityExpanded: false,
    }
    hardwareFlavor = hf.teacherFlavor
    preDispatch = {
      teacher_model_id: teacher.modelId,
      teacher_model_revision: teacher.revision,
      student_model_revision: student.revision,
      prompt_set_hash: promptSet.promptSetHash,
    }
  } else if (claim.stage === 'preparation_dispatching') {
    if (!decodeHuggingFaceDatasetRef(run.teacher_source_ref) || !HEX64.test(clean(run.dataset_hash, 64))) {
      throw new Error('mass_distillation_teacher_material_missing')
    }
    idempotencyKey = hash([COS_UNIVERSITY_MASS_DISTILLATION_CAMPAIGN_PROFILE, claim.campaign_id, claim.batch_key, 'prepare', run.dataset_hash, run.teacher_source_ref])
    envelope = {
      profile: 'cos_university_training_executor_v1',
      operation: 'prepare_dataset',
      candidateId: run.candidate_id,
      subjectId: run.subject_id,
      baseModel: run.student_model_id,
      datasetHash: run.dataset_hash,
      candidate: { source: run.teacher_source_ref },
      callbackPath: MASS_DISTILLATION_CALLBACK_PATH,
      authorityExpanded: false,
    }
    hardwareFlavor = hf.preparationFlavor
  } else {
    const trainingDataRef = clean(run.training_data_ref, 2000)
    const holdoutDataRef = clean(run.holdout_data_ref, 2000)
    const datasetHash = clean(run.dataset_hash, 64).toLowerCase()
    const trainingManifestHash = clean(run.training_manifest_hash, 64).toLowerCase()
    const holdoutManifestHash = clean(run.holdout_manifest_hash, 64).toLowerCase()
    const baseModelRevision = clean(run.student_model_revision, 40).toLowerCase()
    if (!decodeHuggingFaceDatasetRef(trainingDataRef) || !decodeHuggingFaceDatasetRef(holdoutDataRef)
      || !HEX64.test(datasetHash) || !HEX64.test(trainingManifestHash) || !HEX64.test(holdoutManifestHash)
      || !HEX40.test(baseModelRevision)) {
      throw new Error('mass_distillation_partition_material_missing')
    }
    const revision = { baseModel: run.student_model_id, baseModelRevision, datasetHash, trainingManifestHash, holdoutManifestHash }
    const revisionKey = hash(revision)
    idempotencyKey = hash([COS_UNIVERSITY_MASS_DISTILLATION_CAMPAIGN_PROFILE, claim.campaign_id, claim.batch_key, 'train', revisionKey])
    envelope = {
      profile: 'cos_university_training_executor_v1',
      operation: 'train',
      trainingMode: 'distillation',
      candidateId: run.candidate_id,
      subjectId: run.subject_id,
      revision,
      revisionKey,
      trainingDataRef,
      holdoutDataRef,
      distillation: {
        teacherModelId: run.teacher_model_id,
        studentModelId: run.student_model_id,
        datasetHash,
        provenanceRefs: [`mass-batch:${run.batch_key}`, `mass-campaign:${run.campaign_id}`],
        trainingRights: 'open_license',
        studentControlledByBuyer: true,
        containsPrivateProductionData: false,
      },
      callbackPath: MASS_DISTILLATION_CALLBACK_PATH,
      authorityExpanded: false,
    }
    hardwareFlavor = hf.trainingFlavor
    preDispatch = { revision_key: revisionKey }
  }

  const price = await resolveHuggingFaceHardwareRate({ flavor: hardwareFlavor, token: hf.token, fetchImpl })
  const bounded = boundedConfigForStage(hf, claim.stage, price.hourlyCostUsd, expectedCeiling)
  const callbackUrl = new URL(MASS_DISTILLATION_CALLBACK_PATH, executor.url).toString()
  const spec = buildHuggingFaceJobSpec({
    envelope,
    callbackUrl,
    idempotencyKey,
    callbackSecret: executor.secret,
    config: bounded,
  })
  const maxEstimatedCostUsd = Number((price.hourlyCostUsd * spec.timeoutSeconds / 3600).toFixed(6))
  if (maxEstimatedCostUsd > expectedCeiling + 1e-9) throw new Error('mass_distillation_stage_cost_ceiling_exceeded')

  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const fenced = await db.from('cos_university_mass_distillation_batch_runs')
    .update({
      stage_idempotency_key: idempotencyKey,
      ...preDispatch,
      updated_at: new Date().toISOString(),
    })
    .eq('id', claim.run_id)
    .eq('stage', claim.stage)
    .select('id')
    .maybeSingle()
  if (fenced.error) throw fenced.error
  if (!fenced.data) throw new Error('mass_distillation_pre_dispatch_fence_lost')

  const namespace = await resolveHuggingFaceNamespace({ token: hf.token, fetchImpl })
  const submitted = await submitHuggingFaceJob({ namespace, token: hf.token, spec, fetchImpl })
  const jobColumns = claim.stage === 'teacher_dispatching'
    ? { teacher_job_id: submitted.jobId, teacher_job_url: submitted.jobUrl }
    : claim.stage === 'preparation_dispatching'
      ? { preparation_job_id: submitted.jobId, preparation_job_url: submitted.jobUrl }
      : { training_job_id: submitted.jobId, training_job_url: submitted.jobUrl }
  const finished = await db.from('cos_university_mass_distillation_batch_runs')
    .update({ ...jobColumns, stage: expectedStageAfterDispatch(claim.stage), updated_at: new Date().toISOString() })
    .eq('id', claim.run_id)
    .eq('stage', claim.stage)
    .eq('stage_idempotency_key', idempotencyKey)
    .select('id')
    .maybeSingle()
  if (finished.error) throw finished.error
  if (!finished.data) throw new Error('mass_distillation_post_dispatch_fence_lost')

  await recordAssurance({
    candidateId: run.candidate_id,
    subjectId: run.subject_id,
    claim: 'mass_distillation_job_dispatched',
    evidence: {
      campaignId: run.campaign_id,
      batchKey: run.batch_key,
      operation: String((envelope as any).operation),
      stage: claim.stage,
      idempotencyKey,
      jobId: submitted.jobId,
      flavor: price.flavor,
      hourlyCostUsd: price.hourlyCostUsd,
      timeoutSeconds: spec.timeoutSeconds,
      maxEstimatedCostUsd,
      reservedCostCeilingUsd: expectedCeiling,
      automaticPromotionAuthorized: false,
      runpodMutationAuthorized: false,
    },
    verifier: 'host_controller',
  })

  return Object.freeze({
    runId: claim.run_id,
    campaignId: claim.campaign_id,
    batchKey: claim.batch_key,
    subjectId: run.subject_id,
    stage: claim.stage,
    jobId: submitted.jobId,
    jobUrl: submitted.jobUrl,
    hourlyCostUsd: price.hourlyCostUsd,
    maxEstimatedCostUsd,
    reservedCostCeilingUsd: expectedCeiling,
  })
}

export async function runMassDistillationCampaignConsumer(input: {
  now?: Date
  maxDispatches?: number
  fetchImpl?: FetchPort
} = {}) {
  installHuggingFaceTrainingExecutorEnv()
  const executor = trainingExecutorConfigFromEnv()
  const hf = huggingFaceJobsConfigFromEnv()
  if (!executor || !hf) return { ok: false as const, skipped: true as const, reason: 'huggingface_not_configured' as const }
  if (!executor.dispatchEnabled || process.env.COS_UNIVERSITY_TRAINING_EXECUTOR_DISPATCH_ENABLED !== 'true') {
    return { ok: false as const, skipped: true as const, reason: 'global_training_dispatch_disabled' as const }
  }
  const db = cosServiceDb()
  if (!db) return { ok: false as const, skipped: true as const, reason: 'service_database_unavailable' as const }

  const campaigns = await db.from('cos_university_mass_distillation_campaigns')
    .select('id,status,max_total_cost_usd,committed_cost_usd,expires_at')
    .in('status', ['authorized', 'active'])
    .gt('expires_at', (input.now || new Date()).toISOString())
    .order('authorized_at', { ascending: true })
    .limit(1)
  if (campaigns.error) throw campaigns.error
  const campaign: any = campaigns.data?.[0]
  if (!campaign) return { ok: true as const, skipped: true as const, reason: 'no_authorized_campaign' as const, dispatched: 0 }

  const maxDispatches = Math.max(1, Math.min(5, Math.floor(input.maxDispatches ?? 3)))
  const dispatched: unknown[] = []
  for (let index = 0; index < maxDispatches; index += 1) {
    const claimed = await db.rpc('claim_cos_university_mass_distillation_stage', { p_campaign_id: campaign.id })
    if (claimed.error) throw claimed.error
    const claim = Array.isArray(claimed.data) ? claimed.data[0] as Claim | undefined : undefined
    if (!claim) break
    try {
      dispatched.push(await dispatchClaim(claim, input.fetchImpl))
    } catch (error) {
      await markFailure(claim.run_id, claim.campaign_id, claim.candidate_id, claim.subject_id, error)
      return {
        ok: false as const,
        campaignId: campaign.id,
        dispatched: dispatched.length,
        jobs: dispatched,
        failedRunId: claim.run_id,
        error: safeError(error),
        semantics: 'campaign_stopped_on_first_failed_or_uncertain_dispatch_no_automatic_retry' as const,
      }
    }
  }

  return {
    ok: true as const,
    campaignId: campaign.id,
    dispatched: dispatched.length,
    jobs: dispatched,
    maxTotalCostUsd: Number(campaign.max_total_cost_usd),
    previouslyCommittedCostUsd: Number(campaign.committed_cost_usd),
    automaticPromotionAuthorized: false,
    runpodMutationAuthorized: false,
    semantics: 'bounded_owner_authorized_huggingface_campaign_no_runpod_mutation_no_promotion' as const,
  }
}

async function completeCampaignIfDone(campaignId: string) {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const rows = await db.from('cos_university_mass_distillation_batch_runs')
    .select('stage')
    .eq('campaign_id', campaignId)
    .limit(20)
  if (rows.error) throw rows.error
  if ((rows.data || []).length > 0 && (rows.data || []).every((row: any) => row.stage === 'complete')) {
    const now = new Date().toISOString()
    const result = await db.from('cos_university_mass_distillation_campaigns')
      .update({ status: 'completed', completed_at: now, updated_at: now })
      .eq('id', campaignId)
      .in('status', ['authorized', 'active'])
    if (result.error) throw result.error
  }
}

export async function recordMassDistillationWorkerEvidence(
  body: Record<string, unknown>,
  binding: { idempotencyKey: string },
) {
  const candidateId = clean(body.candidateId, 120)
  if (!MASS_CANDIDATE.test(candidateId)) throw new Error('mass_distillation_callback_candidate_invalid')
  const jobId = clean(body.jobId, 240)
  const idempotencyKey = clean(binding.idempotencyKey, 64).toLowerCase()
  if (!jobId || !HEX64.test(idempotencyKey)) throw new Error('mass_distillation_callback_binding_invalid')
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_university_mass_distillation_batch_runs')
    .select('*')
    .eq('candidate_id', candidateId)
    .maybeSingle()
  if (result.error) throw result.error
  const run: any = result.data
  if (!run || clean(run.stage_idempotency_key, 64).toLowerCase() !== idempotencyKey) {
    throw new Error('mass_distillation_callback_dispatch_binding_missing')
  }
  const claim = clean(body.claim, 80)
  const now = new Date().toISOString()

  if (claim === 'teacher_dataset_registered') {
    if (!['teacher_dispatching', 'teacher_dispatched'].includes(run.stage)
      || (run.teacher_job_id && run.teacher_job_id !== jobId)) throw new Error('mass_distillation_teacher_callback_stage_mismatch')
    const sourceRef = clean(body.sourceRef, 2000)
    const outputHashes = normalizedHashes(body.teacherOutputItemHashes, 20, 256)
    const promptSetHash = clean(body.promptSetHash, 64).toLowerCase()
    if (!decodeHuggingFaceDatasetRef(sourceRef) || !outputHashes || promptSetHash !== clean(run.prompt_set_hash, 64).toLowerCase()) {
      throw new Error('mass_distillation_teacher_callback_invalid')
    }
    if (clean(body.teacherModelId, 240) !== run.teacher_model_id
      || clean(body.teacherModelRevision, 40).toLowerCase() !== clean(run.teacher_model_revision, 40).toLowerCase()
      || clean(body.studentModelId, 240) !== run.student_model_id
      || clean(body.studentModelRevision, 40).toLowerCase() !== clean(run.student_model_revision, 40).toLowerCase()
      || body.trainingRights !== 'open_license'
      || body.studentControlledByBuyer !== true
      || body.containsPrivateProductionData !== false) {
      throw new Error('mass_distillation_teacher_callback_provenance_mismatch')
    }
    const datasetHash = manifestHash(outputHashes)
    const updated = await db.from('cos_university_mass_distillation_batch_runs').update({
      teacher_job_id: jobId,
      teacher_source_ref: sourceRef,
      teacher_output_hashes: outputHashes,
      dataset_hash: datasetHash,
      stage: 'preparation_pending',
      stage_reserved_cost_usd: 0,
      stage_idempotency_key: null,
      claimed_at: null,
      updated_at: now,
    }).eq('id', run.id).in('stage', ['teacher_dispatching', 'teacher_dispatched'])
    if (updated.error) throw updated.error
    await recordAssurance({
      candidateId, subjectId: run.subject_id, claim,
      evidence: { campaignId: run.campaign_id, batchKey: run.batch_key, jobId, sourceRef, datasetHash, promptSetHash, outputCount: outputHashes.length },
      verifier: 'training_executor',
    })
    return { ok: true as const, campaignId: run.campaign_id, batchKey: run.batch_key, nextStage: 'preparation_pending' as const }
  }

  if (claim === 'partition_manifests_registered') {
    if (!['preparation_dispatching', 'preparation_dispatched'].includes(run.stage)
      || (run.preparation_job_id && run.preparation_job_id !== jobId)) throw new Error('mass_distillation_partition_callback_stage_mismatch')
    const trainingHashes = normalizedHashes(body.trainingItemHashes, 1, 5000)
    const holdoutHashes = normalizedHashes(body.holdoutItemHashes, 1, 500)
    const trainingDataRef = clean(body.trainingDataRef, 2000)
    const holdoutDataRef = clean(body.holdoutDataRef, 2000)
    const evidenceRef = clean(body.evidenceRef, 2000)
    const datasetHash = clean(body.datasetHash, 64).toLowerCase()
    if (!trainingHashes || !holdoutHashes
      || !decodeHuggingFaceDatasetRef(trainingDataRef) || !decodeHuggingFaceDatasetRef(holdoutDataRef)
      || !evidenceRef || datasetHash !== clean(run.dataset_hash, 64).toLowerCase()
      || clean(body.baseModel, 240) !== run.student_model_id) {
      throw new Error('mass_distillation_partition_callback_invalid')
    }
    const trainingManifestHash = manifestHash(trainingHashes)
    const holdoutManifestHash = manifestHash(holdoutHashes)
    const revision = {
      baseModel: run.student_model_id,
      baseModelRevision: clean(run.student_model_revision, 40).toLowerCase(),
      datasetHash,
      trainingManifestHash,
      holdoutManifestHash,
    }
    const revisionKey = hash(revision)
    const updated = await db.from('cos_university_mass_distillation_batch_runs').update({
      preparation_job_id: jobId,
      training_data_ref: trainingDataRef,
      holdout_data_ref: holdoutDataRef,
      training_manifest_hash: trainingManifestHash,
      holdout_manifest_hash: holdoutManifestHash,
      revision_key: revisionKey,
      stage: 'training_pending',
      stage_reserved_cost_usd: 0,
      stage_idempotency_key: null,
      claimed_at: null,
      updated_at: now,
    }).eq('id', run.id).in('stage', ['preparation_dispatching', 'preparation_dispatched'])
    if (updated.error) throw updated.error
    await recordAssurance({
      candidateId, subjectId: run.subject_id, claim,
      evidence: {
        campaignId: run.campaign_id, batchKey: run.batch_key, jobId, evidenceRef, datasetHash,
        trainingManifestHash, holdoutManifestHash, revisionKey, trainingDataRef, holdoutDataRef,
      },
      verifier: 'training_executor',
    })
    return { ok: true as const, campaignId: run.campaign_id, batchKey: run.batch_key, nextStage: 'training_pending' as const }
  }

  if (claim !== 'trained_artifact_registered' && claim !== 'rollback_artifact_registered') {
    throw new Error('mass_distillation_callback_claim_not_permitted')
  }
  if (!['training_dispatching', 'training_dispatched', 'trained_pending_rollback'].includes(run.stage)
    || (run.training_job_id && run.training_job_id !== jobId)) throw new Error('mass_distillation_training_callback_stage_mismatch')
  const baseModel = clean(body.baseModel, 240)
  const datasetHash = clean(body.datasetHash, 64).toLowerCase()
  const trainingManifestHash = clean(body.trainingManifestHash, 64).toLowerCase()
  const holdoutManifestHash = clean(body.holdoutManifestHash, 64).toLowerCase()
  const trainedArtifactId = clean(body.trainedArtifactId, 500)
  const trainedArtifactHash = clean(body.artifactHash, 64).toLowerCase()
  const evidenceRef = clean(body.evidenceRef, 2000)
  if (baseModel !== run.student_model_id
    || datasetHash !== clean(run.dataset_hash, 64).toLowerCase()
    || trainingManifestHash !== clean(run.training_manifest_hash, 64).toLowerCase()
    || holdoutManifestHash !== clean(run.holdout_manifest_hash, 64).toLowerCase()
    || !trainedArtifactId || !HEX64.test(trainedArtifactHash) || !evidenceRef) {
    throw new Error('mass_distillation_training_callback_invalid')
  }

  if (claim === 'trained_artifact_registered') {
    const updated = await db.from('cos_university_mass_distillation_batch_runs').update({
      training_job_id: jobId,
      trained_artifact_id: trainedArtifactId,
      trained_artifact_hash: trainedArtifactHash,
      evidence_ref: evidenceRef,
      stage: 'trained_pending_rollback',
      updated_at: now,
    }).eq('id', run.id).in('stage', ['training_dispatching', 'training_dispatched', 'trained_pending_rollback'])
    if (updated.error) throw updated.error
    await recordAssurance({
      candidateId, subjectId: run.subject_id, claim,
      evidence: {
        campaignId: run.campaign_id, batchKey: run.batch_key, jobId, evidenceRef,
        baseModel, datasetHash, trainingManifestHash, holdoutManifestHash,
        revisionKey: run.revision_key, trainedArtifactId, artifactHash: trainedArtifactHash,
        trainingMode: 'distillation',
      },
      verifier: 'training_executor',
    })
    return { ok: true as const, campaignId: run.campaign_id, batchKey: run.batch_key, nextStage: 'trained_pending_rollback' as const }
  }

  if (run.trained_artifact_id && run.trained_artifact_id !== trainedArtifactId) throw new Error('mass_distillation_rollback_artifact_id_mismatch')
  if (run.trained_artifact_hash && run.trained_artifact_hash !== trainedArtifactHash) throw new Error('mass_distillation_rollback_artifact_hash_mismatch')
  const rollbackArtifactRef = clean(body.rollbackArtifactRef, 2000)
  if (!rollbackArtifactRef) throw new Error('mass_distillation_rollback_ref_missing')

  const completed = await db.from('cos_university_mass_distillation_batch_runs').update({
    training_job_id: jobId,
    trained_artifact_id: trainedArtifactId,
    trained_artifact_hash: trainedArtifactHash,
    evidence_ref: evidenceRef,
    rollback_artifact_ref: rollbackArtifactRef,
    stage: 'complete',
    stage_reserved_cost_usd: 0,
    stage_idempotency_key: null,
    claimed_at: null,
    completed_at: now,
    updated_at: now,
  }).eq('id', run.id).in('stage', ['training_dispatching', 'training_dispatched', 'trained_pending_rollback'])
  if (completed.error) throw completed.error

  const local = await db.from('cos_local_distillation_artifacts').upsert({
    candidate_id: candidateId,
    subject_id: run.subject_id,
    student_model_id: run.student_model_id,
    teacher_model_id: run.teacher_model_id || null,
    trained_artifact_id: trainedArtifactId,
    trained_artifact_hash: trainedArtifactHash,
    evidence_ref: evidenceRef,
    revision_key: run.revision_key,
    dataset_hash: datasetHash,
    rollback_artifact_ref: rollbackArtifactRef,
    status: 'evaluation_pending',
    runtime_target: 'itmounts_local',
    runtime_preference: 'runpod_serverless_primary_deepinfra_fallback',
    artifact_kind: 'lora_adapter',
    intended_use: {
      profile: 'cos-local-distillation-artifact-v1',
      owner: 'itmounts',
      campaignId: run.campaign_id,
      batchKey: run.batch_key,
      canonicalBaseModel: run.student_model_id,
      adapterModel: trainedArtifactId,
      teacherModel: run.teacher_model_id || null,
      trafficAuthorized: false,
      nextGate: 'independent_evaluation',
    },
    authority_expanded: false,
    updated_at: now,
  }, { onConflict: 'candidate_id,trained_artifact_hash' })
  if (local.error) throw local.error

  const retired = await db.from('cos_university_distillation_curriculum_batches')
    .update({ status: 'retired', updated_at: now })
    .eq('batch_key', run.batch_key)
    .eq('status', 'prepared')
  if (retired.error) throw retired.error

  await recordAssurance({
    candidateId, subjectId: run.subject_id, claim,
    evidence: {
      campaignId: run.campaign_id, batchKey: run.batch_key, jobId, evidenceRef,
      baseModel, datasetHash, trainingManifestHash, holdoutManifestHash,
      revisionKey: run.revision_key, trainedArtifactId, artifactHash: trainedArtifactHash,
      rollbackArtifactRef, trainingMode: 'distillation', trafficAuthorized: false,
    },
    verifier: 'training_executor',
  })
  await completeCampaignIfDone(run.campaign_id)
  return { ok: true as const, campaignId: run.campaign_id, batchKey: run.batch_key, nextStage: 'independent_evaluation' as const, artifactId: trainedArtifactId }
}
