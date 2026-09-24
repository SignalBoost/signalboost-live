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
  _input: Record<string, unknown>, _binding: { idempotencyKey: string }, _dbOverride?: any,
) { return { ok: true as const, diagnosticStub: true } }
