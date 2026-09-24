import { createHash } from 'node:crypto'
import { cosServiceDb } from '../../cos-core/storage/service-db.ts'
import { configuredRunpodPodId } from './runpodConfig.ts'
import { runpodPrimaryConfig, runpodPrimaryModel } from './runpodPrimaryInference.ts'
import {
  queryWorkingCosRuntimeIdentity,
  workingCosRuntimeBindingFromEnv,
} from './cosWorkingRuntimeBinding.ts'
import { selectWorkingCosBalancedBundleFromVault } from './cosWorkingDistillationBundle.ts'
import { registerWorkingCosDistillationCandidate } from './cosWorkingDistillationCandidateRegistry.ts'
import { readWorkingCosDatasetMaterialization } from './cosWorkingDistillationDataset.ts'
import {
  buildHuggingFaceJobSpec,
  findHuggingFaceJobByName,
  huggingFaceJobsConfigFromEnv,
  installHuggingFaceTrainingExecutorEnv,
  resolveHuggingFaceHardwareRate,
  resolveHuggingFaceModelMetadata,
  resolveHuggingFaceNamespace,
  submitHuggingFaceJob,
} from './cosUniversityHuggingFaceJobs.ts'
import {
  COS_UNIVERSITY_TRAINING_EXECUTOR_PROFILE,
  requireExplicitTrainingDispatchConfirmation,
  trainingExecutorConfigFromEnv,
} from './cosUniversityTrainingExecutor.ts'
import {
  buildFineTuneEvidenceInput,
  buildFineTunePartitionRevision,
  fineTuneRevisionKey,
  readFineTuneEvidence,
  recordFineTuneHostApproval,
  type FineTuneRevision,
} from './cosUniversityFineTuneEvidence.ts'
import { decideControlledFineTune } from './cosUniversityLearningAssurance.ts'

export const COS_WORKING_DISTILLATION_DISPATCH_PROFILE = 'cos-working-distillation-dispatch-v1' as const
export const COS_WORKING_DISTILLATION_TRAINING_MODE = 'working_cos_supervised_distillation' as const

const HEX64 = /^[a-f0-9]{64}$/i
const HEX40 = /^[a-f0-9]{40}$/i
const HARD_MAX_HOURLY_COST_USD = 1
const HARD_MAX_PREPARATION_COST_USD = 0.25
const HARD_MAX_TRAINING_COST_USD = 2.5
const MIN_TRAINING_SECONDS = 900

function clean(value: unknown, max = 4000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function boundedUsd(value: unknown, fallback: number, hardMax: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(hardMax, parsed)
}

function manifestHash(items: readonly string[]): string {
  return hash({ items: [...items].sort() })
}

async function currentWorkingCosContext(fetchImpl: typeof fetch = fetch) {
  const podId = configuredRunpodPodId()
  if (!podId) throw new Error('working_cos_runtime_pod_missing')
  const config = runpodPrimaryConfig('reasoner', podId)
  const identity = await queryWorkingCosRuntimeIdentity(config, fetchImpl)
  const binding = workingCosRuntimeBindingFromEnv(identity, podId, runpodPrimaryModel('reasoner'))
  if (!binding.eligible
    || !binding.bindingKey
    || !binding.observedRuntimeDigest
    || !binding.observedRuntimeModel
    || !binding.configuredRuntimeModel
    || !binding.trainableBaseModelId
    || !binding.trainableBaseModelRevision
    || !binding.baselineIdentity
    || !binding.rollbackArtifactRef) {
    throw new Error(`working_cos_runtime_binding_blocked:${binding.blockers.join(',')}`)
  }
  return Object.freeze({ podId, config, identity, binding })
}

async function ensureCurrentCandidate(input: {
  rotationSeed?: string
  fetchImpl?: typeof fetch
  db?: any
}) {
  const db = input.db || cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const context = await currentWorkingCosContext(input.fetchImpl)
  const bundle = await selectWorkingCosBalancedBundleFromVault({
    minSubjects: 8,
    maxSubjects: 8,
    maxItems: 160,
    rotationSeed: clean(input.rotationSeed, 500)
      || clean(process.env.COS_WORKING_DISTILLATION_ROTATION_SEED, 500)
      || 'working-cos-production-cycle-v1',
  }, db)
  if (!bundle.eligible || bundle.subjectCount !== 8 || bundle.itemCount > 160) {
    throw new Error(`working_cos_bundle_blocked:${bundle.blockers.join(',')}`)
  }

  const registered = await registerWorkingCosDistillationCandidate({
    enabled: true,
    bundle,
    targetBaseModel: context.binding.observedRuntimeModel,
    configuredRuntimeModel: context.binding.configuredRuntimeModel,
    baselineIdentity: context.binding.baselineIdentity,
    rollbackArtifactRef: context.binding.rollbackArtifactRef,
  }, db)
  if (registered.registered === false) {
    throw new Error(`working_cos_candidate_registration_blocked:${registered.blockers.join(',')}`)
  }
  if (!registered.candidateId) throw new Error('working_cos_candidate_registration_identity_missing')

  const { candidate, materialization } = await readWorkingCosDatasetMaterialization({
    candidateId: registered.candidateId,
    baseModelId: context.binding.trainableBaseModelId,
    baseModelRevision: context.binding.trainableBaseModelRevision,
  }, db)
  if (clean(candidate.target_base_model, 240) !== context.binding.observedRuntimeModel
    || clean(candidate.configured_runtime_model, 240) !== context.binding.configuredRuntimeModel
    || clean(candidate.baseline_identity, 500) !== context.binding.baselineIdentity
    || clean(candidate.rollback_artifact_ref, 2000) !== context.binding.rollbackArtifactRef) {
    throw new Error('working_cos_candidate_runtime_binding_drift')
  }

  return Object.freeze({ db, context, bundle, registered, candidate, materialization })
}

function dispatchEnabled(env: NodeJS.ProcessEnv = process.env) {
  installHuggingFaceTrainingExecutorEnv(env)
  const executor = trainingExecutorConfigFromEnv(env)
  const hf = huggingFaceJobsConfigFromEnv(env)
  if (!executor || !hf) throw new Error('working_cos_training_provider_not_configured')
  if (!executor.dispatchEnabled) throw new Error('training_executor_dispatch_disabled')
  if (env.COS_WORKING_DISTILLATION_DISPATCH_ENABLED !== 'true') {
    throw new Error('working_cos_dispatch_disabled')
  }
  return { executor, hf }
}

async function verifyTrainableBase(input: {
  modelId: string
  revision: string
  token: string
  fetchImpl?: typeof fetch
}) {
  const metadata = await resolveHuggingFaceModelMetadata({
    modelId: input.modelId,
    token: input.token,
    fetchImpl: input.fetchImpl,
  })
  if (metadata.revision !== input.revision) throw new Error('working_cos_trainable_base_revision_drift')
  if (metadata.license !== 'apache-2.0') throw new Error(`working_cos_trainable_base_license_blocked:${metadata.license}`)
  return metadata
}

async function recordJobEvent(db: any, input: {
  candidateId: string
  operation: 'prepare_dataset' | 'train'
  eventType: 'dispatch_intent' | 'provider_accepted' | 'provider_failed' | 'callback_recorded'
  idempotencyKey: string
  jobId?: string | null
  jobUrl?: string | null
  runtimeBindingKey: string
  runtimeDigest: string
  baseModelId: string
  baseModelRevision: string
  datasetHash: string
  trainingManifestHash: string
  holdoutManifestHash: string
  providerFlavor?: string | null
  hourlyCostUsd?: number | null
  maxEstimatedCostUsd?: number | null
  evidence?: Record<string, unknown>
}) {
  const eventKey = hash([
    COS_WORKING_DISTILLATION_DISPATCH_PROFILE,
    input.candidateId,
    input.operation,
    input.eventType,
    input.idempotencyKey,
    input.jobId || '',
    input.evidence || {},
  ])
  const result = await db.from('cos_working_distillation_job_events').upsert({
    event_key: eventKey,
    candidate_id: input.candidateId,
    operation: input.operation,
    event_type: input.eventType,
    idempotency_key: input.idempotencyKey,
    job_id: clean(input.jobId, 240) || null,
    job_url: clean(input.jobUrl, 2000) || null,
    runtime_binding_key: input.runtimeBindingKey,
    runtime_digest: input.runtimeDigest,
    base_model_id: input.baseModelId,
    base_model_revision: input.baseModelRevision,
    dataset_hash: input.datasetHash,
    training_manifest_hash: input.trainingManifestHash,
    holdout_manifest_hash: input.holdoutManifestHash,
    provider: 'huggingface',
    provider_flavor: clean(input.providerFlavor, 80) || null,
    hourly_cost_usd: Number.isFinite(Number(input.hourlyCostUsd)) ? Number(input.hourlyCostUsd) : null,
    max_estimated_cost_usd: Number.isFinite(Number(input.maxEstimatedCostUsd)) ? Number(input.maxEstimatedCostUsd) : null,
    evidence: input.evidence || {},
    authority_expanded: false,
    production_traffic_authorized: false,
    university_graduation_claimed: false,
  }, { onConflict: 'event_key', ignoreDuplicates: true })
  if (result.error) throw result.error
  return eventKey
}

async function submitBoundedJob(input: {
  db: any
  operation: 'prepare_dataset' | 'train'
  candidateId: string
  idempotencyKey: string
  runtimeBindingKey: string
  runtimeDigest: string
  baseModelId: string
  baseModelRevision: string
  datasetHash: string
  trainingManifestHash: string
  holdoutManifestHash: string
  flavor: string
  timeoutSeconds: number
  hourlyCostUsd: number
  maxEstimatedCostUsd: number
  spec: ReturnType<typeof buildHuggingFaceJobSpec>
  token: string
  fetchImpl?: typeof fetch
}) {
  await recordJobEvent(input.db, {
    ...input,
    eventType: 'dispatch_intent',
    evidence: {
      jobName: input.spec.labels.name,
      timeoutSeconds: input.timeoutSeconds,
      providerInvocationStarted: false,
    },
  })
  try {
    const namespace = await resolveHuggingFaceNamespace({ token: input.token, fetchImpl: input.fetchImpl })
    const existing = await findHuggingFaceJobByName({
      namespace,
      token: input.token,
      name: input.spec.labels.name,
      fetchImpl: input.fetchImpl,
    })
    const accepted = existing
      ? { jobId: existing.jobId, jobUrl: existing.jobUrl, adopted: true }
      : { ...(await submitHuggingFaceJob({ namespace, token: input.token, spec: input.spec, fetchImpl: input.fetchImpl })), adopted: false }
    await recordJobEvent(input.db, {
      ...input,
      eventType: 'provider_accepted',
      jobId: accepted.jobId,
      jobUrl: accepted.jobUrl,
      evidence: {
        jobName: input.spec.labels.name,
        timeoutSeconds: input.timeoutSeconds,
        providerInvocationStarted: true,
        adoptedExistingProviderJob: accepted.adopted,
      },
    })
    return Object.freeze(accepted)
  } catch (error) {
    const message = error instanceof Error ? clean(error.message, 400) : clean(error, 400)
    await recordJobEvent(input.db, {
      ...input,
      eventType: 'provider_failed',
      evidence: { error: message, providerInvocationStarted: true },
    }).catch(() => null)
    throw error
  }
}

export async function workingCosDispatchReadiness(input: {
  rotationSeed?: string
  fetchImpl?: typeof fetch
  db?: any
} = {}) {
  const db = input.db || cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const context = await currentWorkingCosContext(input.fetchImpl)
  const bundle = await selectWorkingCosBalancedBundleFromVault({
    minSubjects: 8,
    maxSubjects: 8,
    maxItems: 160,
    rotationSeed: clean(input.rotationSeed, 500)
      || clean(process.env.COS_WORKING_DISTILLATION_ROTATION_SEED, 500)
      || 'working-cos-production-cycle-v1',
  }, db)
  const installed = installHuggingFaceTrainingExecutorEnv()
  const executor = trainingExecutorConfigFromEnv()
  const hf = huggingFaceJobsConfigFromEnv()
  return Object.freeze({
    bundleReady: bundle.eligible,
    bundleKey: bundle.bundleKey,
    itemCount: bundle.itemCount,
    subjectCount: bundle.subjectCount,
    subjects: bundle.subjectIds,
    runtimeBindingReady: context.binding.eligible,
    runtimeModel: context.binding.observedRuntimeModel,
    runtimeDigest: context.binding.observedRuntimeDigest,
    trainableBaseModelId: context.binding.trainableBaseModelId,
    trainableBaseModelRevision: context.binding.trainableBaseModelRevision,
    providerInstalled: installed.installed,
    providerConfigured: Boolean(hf && executor),
    globalDispatchEnabled: executor?.dispatchEnabled === true,
    workingCosDispatchEnabled: process.env.COS_WORKING_DISTILLATION_DISPATCH_ENABLED === 'true',
    trainingFlavorConfigured: Boolean(clean(process.env.COS_WORKING_DISTILLATION_HF_TRAINING_FLAVOR, 80)),
    automaticTrainingAuthorized: false as const,
    automaticActivationAuthorized: false as const,
    productionTrafficAuthorized: false as const,
    nextGate: bundle.eligible && context.binding.eligible
      ? 'explicit_owner_confirmed_dataset_preparation'
      : 'bundle_or_runtime_binding',
  })
}

export async function dispatchWorkingCosDatasetPreparation(input: {
  confirmDispatch: unknown
  rotationSeed?: string
  fetchImpl?: typeof fetch
  db?: any
}) {
  requireExplicitTrainingDispatchConfirmation(input.confirmDispatch)
  const provider = dispatchEnabled()
  const context = await ensureCurrentCandidate(input)
  await verifyTrainableBase({
    modelId: context.context.binding.trainableBaseModelId!,
    revision: context.context.binding.trainableBaseModelRevision!,
    token: provider.hf.token,
    fetchImpl: input.fetchImpl,
  })

  const idempotencyKey = hash([
    COS_WORKING_DISTILLATION_DISPATCH_PROFILE,
    'prepare_dataset',
    context.registered.candidateId,
    context.materialization.datasetHash,
    context.context.binding.bindingKey,
  ])
  const maxCostUsd = boundedUsd(
    process.env.COS_WORKING_DISTILLATION_MAX_PREPARATION_COST_USD,
    HARD_MAX_PREPARATION_COST_USD,
    HARD_MAX_PREPARATION_COST_USD,
  )
  const hardware = await resolveHuggingFaceHardwareRate({
    flavor: provider.hf.preparationFlavor,
    token: provider.hf.token,
    fetchImpl: input.fetchImpl,
  })
  if (hardware.hourlyCostUsd <= 0 || hardware.hourlyCostUsd > HARD_MAX_HOURLY_COST_USD) {
    throw new Error('working_cos_preparation_hourly_cost_cap_exceeded')
  }
  const budgetSeconds = Math.floor(maxCostUsd * 3600 / hardware.hourlyCostUsd)
  const timeoutSeconds = Math.min(provider.hf.preparationTimeoutSeconds, budgetSeconds)
  if (timeoutSeconds < 300) throw new Error('working_cos_preparation_budget_too_small')
  const estimatedCostUsd = Number((hardware.hourlyCostUsd * timeoutSeconds / 3600).toFixed(6))

  const callbackUrl = new URL('/api/internal/cos/university-training-executor/evidence', provider.executor.url).toString()
  const envelope = {
    profile: COS_UNIVERSITY_TRAINING_EXECUTOR_PROFILE,
    operation: 'prepare_dataset',
    candidateId: context.registered.candidateId,
    subjectId: 'Working COS Generalist',
    baseModel: context.context.binding.trainableBaseModelId,
    baseModelRevision: context.context.binding.trainableBaseModelRevision,
    datasetHash: context.materialization.datasetHash,
    expectedTrainingManifestHash: context.materialization.trainingManifestHash,
    expectedHoldoutManifestHash: context.materialization.holdoutManifestHash,
    candidate: {
      source: `itmounts://working-cos/bundle/${context.materialization.bundleKey}`,
      workingCosRows: context.materialization.rows,
    },
    workingCos: {
      profile: COS_WORKING_DISTILLATION_DISPATCH_PROFILE,
      runtimeBindingKey: context.context.binding.bindingKey,
      runtimeDigest: context.context.binding.observedRuntimeDigest,
      bundleKey: context.materialization.bundleKey,
      portableManifestHash: context.materialization.portableManifestHash,
      trainingMode: COS_WORKING_DISTILLATION_TRAINING_MODE,
    },
    callbackPath: '/api/internal/cos/university-training-executor/evidence',
    authorityExpanded: false,
  }
  const spec = buildHuggingFaceJobSpec({
    envelope,
    callbackUrl,
    idempotencyKey,
    callbackSecret: provider.executor.secret,
    config: Object.freeze({ ...provider.hf, preparationTimeoutSeconds: timeoutSeconds }),
  })
  const accepted = await submitBoundedJob({
    db: context.db,
    operation: 'prepare_dataset',
    candidateId: context.registered.candidateId!,
    idempotencyKey,
    runtimeBindingKey: context.context.binding.bindingKey!,
    runtimeDigest: context.context.binding.observedRuntimeDigest!,
    baseModelId: context.context.binding.trainableBaseModelId!,
    baseModelRevision: context.context.binding.trainableBaseModelRevision!,
    datasetHash: context.materialization.datasetHash,
    trainingManifestHash: context.materialization.trainingManifestHash,
    holdoutManifestHash: context.materialization.holdoutManifestHash,
    flavor: hardware.flavor,
    timeoutSeconds,
    hourlyCostUsd: hardware.hourlyCostUsd,
    maxEstimatedCostUsd: estimatedCostUsd,
    spec,
    token: provider.hf.token,
    fetchImpl: input.fetchImpl,
  })
  return Object.freeze({
    accepted: true as const,
    operation: 'prepare_dataset' as const,
    candidateId: context.registered.candidateId,
    datasetHash: context.materialization.datasetHash,
    trainingManifestHash: context.materialization.trainingManifestHash,
    holdoutManifestHash: context.materialization.holdoutManifestHash,
    baseModelId: context.context.binding.trainableBaseModelId,
    baseModelRevision: context.context.binding.trainableBaseModelRevision,
    jobId: accepted.jobId,
    jobUrl: accepted.jobUrl,
    adoptedExistingProviderJob: accepted.adopted,
    maxEstimatedCostUsd: estimatedCostUsd,
    automaticTrainingAuthorized: false as const,
    productionTrafficAuthorized: false as const,
  })
}

async function readPartition(input: {
  db: any
  candidateId: string
  baseModelId: string
  baseModelRevision: string
  datasetHash: string
  trainingManifestHash: string
  holdoutManifestHash: string
}) {
  const rows = await input.db.from('cos_university_learning_assurance_events')
    .select('evidence,verifier,observed_at,expires_at')
    .eq('event_type', 'fine_tune')
    .eq('candidate_id', input.candidateId)
    .eq('verifier', 'training_executor')
    .order('observed_at', { ascending: false })
    .limit(100)
  if (rows.error) throw rows.error
  for (const row of rows.data || []) {
    const evidence: any = row.evidence
    if (evidence?.profile !== 'cos_university_fine_tune_evidence_v1'
      || evidence?.claim !== 'partition_manifests_registered'
      || clean(evidence?.baseModel, 300) !== input.baseModelId
      || clean(evidence?.baseModelRevision, 40).toLowerCase() !== input.baseModelRevision
      || clean(evidence?.datasetHash, 64).toLowerCase() !== input.datasetHash
      || clean(evidence?.trainingManifestHash, 64).toLowerCase() !== input.trainingManifestHash
      || clean(evidence?.holdoutManifestHash, 64).toLowerCase() !== input.holdoutManifestHash
      || (row.expires_at && Date.parse(String(row.expires_at)) <= Date.now())) continue
    const revision: FineTuneRevision = {
      baseModel: input.baseModelId,
      baseModelRevision: input.baseModelRevision,
      datasetHash: input.datasetHash,
      trainingManifestHash: input.trainingManifestHash,
      holdoutManifestHash: input.holdoutManifestHash,
    }
    if (clean(evidence?.revisionKey, 64).toLowerCase() !== fineTuneRevisionKey(revision)) continue
    const trainingDataRef = clean(evidence?.trainingDataRef, 2000)
    const holdoutDataRef = clean(evidence?.holdoutDataRef, 2000)
    if (trainingDataRef && holdoutDataRef) return Object.freeze({ revision, trainingDataRef, holdoutDataRef })
  }
  throw new Error('working_cos_partition_materialization_missing')
}

export async function dispatchWorkingCosTraining(input: {
  confirmDispatch: unknown
  rotationSeed?: string
  fetchImpl?: typeof fetch
  db?: any
}) {
  requireExplicitTrainingDispatchConfirmation(input.confirmDispatch)
  const provider = dispatchEnabled()
  const context = await ensureCurrentCandidate(input)
  await verifyTrainableBase({
    modelId: context.context.binding.trainableBaseModelId!,
    revision: context.context.binding.trainableBaseModelRevision!,
    token: provider.hf.token,
    fetchImpl: input.fetchImpl,
  })
  const partition = await readPartition({
    db: context.db,
    candidateId: context.registered.candidateId!,
    baseModelId: context.context.binding.trainableBaseModelId!,
    baseModelRevision: context.context.binding.trainableBaseModelRevision!,
    datasetHash: context.materialization.datasetHash,
    trainingManifestHash: context.materialization.trainingManifestHash,
    holdoutManifestHash: context.materialization.holdoutManifestHash,
  })

  const approvalRef = `working-cos:${context.context.binding.bindingKey}:${context.materialization.datasetHash}`
  for (const claim of ['dataset_approved', 'training_approved'] as const) {
    const approval = await recordFineTuneHostApproval({
      candidateId: context.registered.candidateId!,
      subjectId: 'Working COS Generalist',
      claim,
      evidenceRef: `${approvalRef}:${claim}`,
      revision: partition.revision,
    })
    if (!approval.ok) throw new Error(`working_cos_${claim}_failed:${approval.problems.join(',')}`)
  }
  const recorded = await readFineTuneEvidence(context.registered.candidateId!, partition.revision)
  const controlled = decideControlledFineTune(buildFineTuneEvidenceInput(partition.revision, recorded))
  if (!controlled.eligibleForTraining) {
    throw new Error(`working_cos_controlled_training_gate_blocked:${controlled.blockers.join(',')}`)
  }

  const flavor = clean(process.env.COS_WORKING_DISTILLATION_HF_TRAINING_FLAVOR, 80)
  if (!flavor) throw new Error('working_cos_training_flavor_not_configured')
  const hourlyCap = boundedUsd(
    process.env.COS_WORKING_DISTILLATION_MAX_HOURLY_COST_USD,
    HARD_MAX_HOURLY_COST_USD,
    HARD_MAX_HOURLY_COST_USD,
  )
  const maxCostUsd = boundedUsd(
    process.env.COS_WORKING_DISTILLATION_MAX_TRAINING_COST_USD,
    HARD_MAX_TRAINING_COST_USD,
    HARD_MAX_TRAINING_COST_USD,
  )
  const hardware = await resolveHuggingFaceHardwareRate({ flavor, token: provider.hf.token, fetchImpl: input.fetchImpl })
  if (hardware.hourlyCostUsd <= 0 || hardware.hourlyCostUsd > hourlyCap) {
    throw new Error('working_cos_training_hourly_cost_cap_exceeded')
  }
  const budgetSeconds = Math.floor(maxCostUsd * 3600 / hardware.hourlyCostUsd)
  const timeoutSeconds = Math.min(provider.hf.trainingTimeoutSeconds, budgetSeconds)
  if (timeoutSeconds < MIN_TRAINING_SECONDS) throw new Error('working_cos_training_budget_too_small')
  const estimatedCostUsd = Number((hardware.hourlyCostUsd * timeoutSeconds / 3600).toFixed(6))

  const revisionKey = fineTuneRevisionKey(partition.revision)
  const idempotencyKey = hash([
    COS_WORKING_DISTILLATION_DISPATCH_PROFILE,
    'train',
    COS_WORKING_DISTILLATION_TRAINING_MODE,
    context.registered.candidateId,
    revisionKey,
    context.context.binding.bindingKey,
  ])
  const callbackUrl = new URL('/api/internal/cos/university-training-executor/evidence', provider.executor.url).toString()
  const envelope = {
    profile: COS_UNIVERSITY_TRAINING_EXECUTOR_PROFILE,
    operation: 'train',
    trainingMode: COS_WORKING_DISTILLATION_TRAINING_MODE,
    candidateId: context.registered.candidateId,
    subjectId: 'Working COS Generalist',
    revision: partition.revision,
    revisionKey,
    trainingDataRef: partition.trainingDataRef,
    holdoutDataRef: partition.holdoutDataRef,
    workingCos: {
      profile: COS_WORKING_DISTILLATION_DISPATCH_PROFILE,
      runtimeBindingKey: context.context.binding.bindingKey,
      runtimeDigest: context.context.binding.observedRuntimeDigest,
      bundleKey: context.materialization.bundleKey,
      portableManifestHash: context.materialization.portableManifestHash,
    },
    callbackPath: '/api/internal/cos/university-training-executor/evidence',
    authorityExpanded: false,
  }
  const spec = buildHuggingFaceJobSpec({
    envelope,
    callbackUrl,
    idempotencyKey,
    callbackSecret: provider.executor.secret,
    config: Object.freeze({
      ...provider.hf,
      trainingFlavor: flavor,
      trainingTimeoutSeconds: timeoutSeconds,
      maxHourlyCostUsd: hourlyCap,
    }),
  })
  const accepted = await submitBoundedJob({
    db: context.db,
    operation: 'train',
    candidateId: context.registered.candidateId!,
    idempotencyKey,
    runtimeBindingKey: context.context.binding.bindingKey!,
    runtimeDigest: context.context.binding.observedRuntimeDigest!,
    baseModelId: context.context.binding.trainableBaseModelId!,
    baseModelRevision: context.context.binding.trainableBaseModelRevision!,
    datasetHash: context.materialization.datasetHash,
    trainingManifestHash: context.materialization.trainingManifestHash,
    holdoutManifestHash: context.materialization.holdoutManifestHash,
    flavor: hardware.flavor,
    timeoutSeconds,
    hourlyCostUsd: hardware.hourlyCostUsd,
    maxEstimatedCostUsd: estimatedCostUsd,
    spec,
    token: provider.hf.token,
    fetchImpl: input.fetchImpl,
  })
  return Object.freeze({
    accepted: true as const,
    operation: 'train' as const,
    trainingMode: COS_WORKING_DISTILLATION_TRAINING_MODE,
    candidateId: context.registered.candidateId,
    revisionKey,
    baseModelId: context.context.binding.trainableBaseModelId,
    baseModelRevision: context.context.binding.trainableBaseModelRevision,
    jobId: accepted.jobId,
    jobUrl: accepted.jobUrl,
    adoptedExistingProviderJob: accepted.adopted,
    maxEstimatedCostUsd: estimatedCostUsd,
    automaticActivationAuthorized: false as const,
    productionTrafficAuthorized: false as const,
    universityGraduationClaimed: false as const,
  })
}

async function readRegisteredRuntimeRollback(db: any, candidateId: string) {
  const result = await db.from('cos_working_distillation_candidates')
    .select('rollback_artifact_ref,baseline_identity')
    .eq('candidate_id', candidateId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (result.error) throw result.error
  const rollbackArtifactRef = clean(result.data?.rollback_artifact_ref, 2000)
  const baselineIdentity = clean(result.data?.baseline_identity, 500)
  if (!rollbackArtifactRef || !baselineIdentity) throw new Error('working_cos_callback_runtime_rollback_missing')
  return Object.freeze({ rollbackArtifactRef, baselineIdentity })
}

async function readDispatchIntent(db: any, candidateId: string, idempotencyKey: string) {
  const result = await db.from('cos_working_distillation_job_events')
    .select('operation,candidate_id,idempotency_key,runtime_binding_key,runtime_digest,base_model_id,base_model_revision,dataset_hash,training_manifest_hash,holdout_manifest_hash,evidence,created_at')
    .eq('candidate_id', candidateId)
    .eq('idempotency_key', idempotencyKey)
    .eq('event_type', 'dispatch_intent')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (result.error) throw result.error
  if (!result.data) throw new Error('working_cos_callback_dispatch_intent_missing')
  return result.data as any
}

async function recordFineTuneExecutorEvent(db: any, input: {
  candidateId: string
  claim: 'partition_manifests_registered' | 'trained_artifact_registered' | 'rollback_artifact_registered'
  evidence: Record<string, unknown>
}) {
  const evidence = {
    profile: 'cos_university_fine_tune_evidence_v1',
    claim: input.claim,
    candidateId: input.candidateId,
    ...input.evidence,
  }
  const evidenceHash = hash(evidence)
  const eventKey = hash(['cos_university_fine_tune_evidence_v1', input.candidateId, input.claim, evidenceHash])
  const result = await db.from('cos_university_learning_assurance_events').upsert({
    event_key: eventKey,
    event_type: 'fine_tune',
    subject_id: 'Working COS Generalist',
    candidate_id: input.candidateId,
    evidence_hash: evidenceHash,
    evidence,
    verifier: 'training_executor',
    observed_at: new Date().toISOString(),
  }, { onConflict: 'event_key', ignoreDuplicates: true })
  if (result.error) throw result.error
  return { eventKey, evidence }
}

export async function recordWorkingCosTrainingExecutorEvidence(
  input: Record<string, unknown>,
  binding: { idempotencyKey: string },
  dbOverride?: any,
) {
  const candidateId = clean(input.candidateId, 160)
  if (!/^working-cos:[a-f0-9]{32}$/i.test(candidateId)) throw new Error('working_cos_callback_candidate_invalid')
  const jobId = clean(input.jobId, 240)
  if (!jobId) throw new Error('working_cos_callback_job_id_missing')
  const idempotencyKey = clean(binding.idempotencyKey, 64).toLowerCase()
  if (!HEX64.test(idempotencyKey)) throw new Error('working_cos_callback_idempotency_invalid')
  const db = dbOverride || cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const intent = await readDispatchIntent(db, candidateId, idempotencyKey)
  const claim = clean(input.claim, 80)
  const evidenceRef = clean(input.evidenceRef, 2000)
  if (!evidenceRef) throw new Error('working_cos_callback_evidence_ref_missing')
  const baseModel = clean(input.baseModel, 300)
  const baseModelRevision = clean(input.baseModelRevision, 40).toLowerCase()
  const datasetHash = clean(input.datasetHash, 64).toLowerCase()
  if (baseModel !== clean(intent.base_model_id, 300)
    || baseModelRevision !== clean(intent.base_model_revision, 40).toLowerCase()
    || datasetHash !== clean(intent.dataset_hash, 64).toLowerCase()) {
    throw new Error('working_cos_callback_base_dataset_binding_mismatch')
  }

  if (claim === 'partition_manifests_registered') {
    if (intent.operation !== 'prepare_dataset') throw new Error('working_cos_callback_operation_mismatch')
    const trainingItemHashes = Array.isArray(input.trainingItemHashes)
      ? input.trainingItemHashes.map(value => clean(value, 64).toLowerCase())
      : []
    const holdoutItemHashes = Array.isArray(input.holdoutItemHashes)
      ? input.holdoutItemHashes.map(value => clean(value, 64).toLowerCase())
      : []
    if (!trainingItemHashes.length || !holdoutItemHashes.length
      || trainingItemHashes.some(value => !HEX64.test(value))
      || holdoutItemHashes.some(value => !HEX64.test(value))
      || manifestHash(trainingItemHashes) !== clean(intent.training_manifest_hash, 64).toLowerCase()
      || manifestHash(holdoutItemHashes) !== clean(intent.holdout_manifest_hash, 64).toLowerCase()) {
      throw new Error('working_cos_callback_partition_manifest_mismatch')
    }
    const revision = buildFineTunePartitionRevision({
      baseModel,
      baseModelRevision,
      datasetHash,
      trainingItemHashes,
      holdoutItemHashes,
    })
    if (!revision) throw new Error('working_cos_callback_partition_revision_invalid')
    const trainingDataRef = clean(input.trainingDataRef, 2000)
    const holdoutDataRef = clean(input.holdoutDataRef, 2000)
    if (!trainingDataRef || !holdoutDataRef) throw new Error('working_cos_callback_partition_refs_missing')
    const recorded = await recordFineTuneExecutorEvent(db, {
      candidateId,
      claim,
      evidence: {
        evidenceRef,
        dispatchJobId: jobId,
        dispatchIdempotencyKey: idempotencyKey,
        revisionKey: fineTuneRevisionKey(revision),
        baseModel,
        baseModelRevision,
        datasetHash,
        trainingManifestHash: revision.trainingManifestHash,
        holdoutManifestHash: revision.holdoutManifestHash,
        trainingItemHashes: [...new Set(trainingItemHashes)].sort(),
        holdoutItemHashes: [...new Set(holdoutItemHashes)].sort(),
        trainingDataRef,
        holdoutDataRef,
        workingCosRuntimeBindingKey: intent.runtime_binding_key,
        workingCosRuntimeDigest: intent.runtime_digest,
      },
    })
    await recordJobEvent(db, {
      candidateId,
      operation: 'prepare_dataset',
      eventType: 'callback_recorded',
      idempotencyKey,
      jobId,
      runtimeBindingKey: intent.runtime_binding_key,
      runtimeDigest: intent.runtime_digest,
      baseModelId: baseModel,
      baseModelRevision,
      datasetHash,
      trainingManifestHash: revision.trainingManifestHash,
      holdoutManifestHash: revision.holdoutManifestHash,
      evidence: { claim, fineTuneEventKey: recorded.eventKey },
    })
    return Object.freeze({ ok: true as const, candidateId, claim, revisionKey: fineTuneRevisionKey(revision) })
  }

  if (claim !== 'trained_artifact_registered' && claim !== 'rollback_artifact_registered') {
    throw new Error('working_cos_callback_claim_not_permitted')
  }
  if (intent.operation !== 'train') throw new Error('working_cos_callback_operation_mismatch')
  const trainingManifestHash = clean(input.trainingManifestHash, 64).toLowerCase()
  const holdoutManifestHash = clean(input.holdoutManifestHash, 64).toLowerCase()
  if (trainingManifestHash !== clean(intent.training_manifest_hash, 64).toLowerCase()
    || holdoutManifestHash !== clean(intent.holdout_manifest_hash, 64).toLowerCase()) {
    throw new Error('working_cos_callback_training_manifest_mismatch')
  }
  const revision: FineTuneRevision = {
    baseModel,
    baseModelRevision,
    datasetHash,
    trainingManifestHash,
    holdoutManifestHash,
  }
  const trainedArtifactId = clean(input.trainedArtifactId, 500)
  const artifactHash = clean(input.artifactHash, 64).toLowerCase()
  if (!trainedArtifactId || !HEX64.test(artifactHash)) throw new Error('working_cos_callback_artifact_invalid')
  const common = {
    evidenceRef,
    dispatchJobId: jobId,
    dispatchIdempotencyKey: idempotencyKey,
    revisionKey: fineTuneRevisionKey(revision),
    baseModel,
    baseModelRevision,
    datasetHash,
    trainingManifestHash,
    holdoutManifestHash,
    trainedArtifactId,
    artifactHash,
    trainingMode: COS_WORKING_DISTILLATION_TRAINING_MODE,
    workingCosTraining: {
      profile: COS_WORKING_DISTILLATION_DISPATCH_PROFILE,
      runtimeBindingKey: intent.runtime_binding_key,
      runtimeDigest: intent.runtime_digest,
      baseModelId: baseModel,
      baseModelRevision,
      trainingProfile: clean(input.trainingProfile, 160) || null,
      trainingRecipe: input.trainingRecipe && typeof input.trainingRecipe === 'object' ? input.trainingRecipe : null,
    },
    authorityExpanded: false,
  }

  if (claim === 'trained_artifact_registered') {
    const recorded = await recordFineTuneExecutorEvent(db, { candidateId, claim, evidence: common })
    await recordJobEvent(db, {
      candidateId,
      operation: 'train',
      eventType: 'callback_recorded',
      idempotencyKey,
      jobId,
      runtimeBindingKey: intent.runtime_binding_key,
      runtimeDigest: intent.runtime_digest,
      baseModelId: baseModel,
      baseModelRevision,
      datasetHash,
      trainingManifestHash,
      holdoutManifestHash,
      evidence: { claim, fineTuneEventKey: recorded.eventKey, trainedArtifactId, artifactHash },
    })
    return Object.freeze({ ok: true as const, candidateId, claim, trainedArtifactId, artifactHash })
  }

  const recordedEvidence = await readFineTuneEvidence(candidateId, revision)
  if (recordedEvidence.trainedArtifactId !== trainedArtifactId || recordedEvidence.trainedArtifactHash !== artifactHash) {
    throw new Error('working_cos_callback_rollback_artifact_binding_invalid')
  }
  const trainingRollbackArtifactRef = clean(input.rollbackArtifactRef, 2000)
  if (!trainingRollbackArtifactRef) throw new Error('working_cos_callback_rollback_ref_missing')
  const runtimeRollback = await readRegisteredRuntimeRollback(db, candidateId)
  const expectedTrainingRollback = `hf://models/${baseModel}`
  if (trainingRollbackArtifactRef !== expectedTrainingRollback) {
    throw new Error('working_cos_callback_training_rollback_binding_invalid')
  }
  const rollbackArtifactRef = runtimeRollback.rollbackArtifactRef
  const recorded = await recordFineTuneExecutorEvent(db, {
    candidateId,
    claim,
    evidence: {
      ...common,
      rollbackArtifactRef,
      trainingRollbackArtifactRef,
      workingCosBaselineIdentity: runtimeRollback.baselineIdentity,
    },
  })
  await recordJobEvent(db, {
    candidateId,
    operation: 'train',
    eventType: 'callback_recorded',
    idempotencyKey,
    jobId,
    runtimeBindingKey: intent.runtime_binding_key,
    runtimeDigest: intent.runtime_digest,
    baseModelId: baseModel,
    baseModelRevision,
    datasetHash,
    trainingManifestHash,
    holdoutManifestHash,
    evidence: {
      claim,
      fineTuneEventKey: recorded.eventKey,
      rollbackArtifactRef,
      trainingRollbackArtifactRef,
      workingCosBaselineIdentity: runtimeRollback.baselineIdentity,
    },
  })
  return Object.freeze({ ok: true as const, candidateId, claim, rollbackArtifactRef })
}
