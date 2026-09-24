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


export async function workingCosDispatchReadiness() {
  return { diagnosticStub: true, automaticTrainingAuthorized: false as const, productionTrafficAuthorized: false as const }
}
export async function dispatchWorkingCosDatasetPreparation(_input: { confirmDispatch: unknown; rotationSeed?: string }) {
  return { accepted: false as const, diagnosticStub: true, operation: 'prepare_dataset' as const }
}
export async function dispatchWorkingCosTraining(_input: { confirmDispatch: unknown; rotationSeed?: string }) {
  return { accepted: false as const, diagnosticStub: true, operation: 'train' as const }
}
export async function recordWorkingCosTrainingExecutorEvidence(
  _input: Record<string, unknown>,
  _binding: { idempotencyKey: string },
  _dbOverride?: any,
) {
  return { ok: true as const, diagnosticStub: true }
}
