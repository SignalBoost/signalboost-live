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
    maxItems: 224,
    rotationSeed: clean(input.rotationSeed, 500)
      || clean(process.env.COS_WORKING_DISTILLATION_ROTATION_SEED, 500)
      || 'working-cos-production-cycle-v1',
  }, db)
  if (!bundle.eligible || bundle.subjectCount !== 8 || bundle.itemCount > 224) {
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
  if (!registered.registered) {
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
