import { createHash } from 'node:crypto'
import type { LocalInferenceConfig } from '../local-inference.ts'

export const COS_WORKING_RUNTIME_BINDING_PROFILE = 'cos-working-runtime-binding-v1' as const

const HEX64 = /^[a-f0-9]{64}$/i
const HEX40 = /^[a-f0-9]{40}$/i

function clean(value: unknown, max = 2000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export function normalizeOllamaDigest(value: unknown): string | null {
  const raw = clean(value, 96).toLowerCase().replace(/^sha256:/, '')
  return HEX64.test(raw) ? raw : null
}

export type WorkingCosRuntimeIdentity = Readonly<{
  ready: boolean
  model: string | null
  digest: string | null
  modifiedAt: string | null
  size: number | null
  family: string | null
  parameterSize: string | null
  quantizationLevel: string | null
}>

type FetchLike = typeof fetch

/**
 * Read the immutable Ollama model digest from the same authenticated RunPod gateway used for COS
 * inference. No model data is downloaded and no runtime mutation is performed.
 */
export async function queryWorkingCosRuntimeIdentity(
  config: LocalInferenceConfig,
  fetcher: FetchLike = fetch,
): Promise<WorkingCosRuntimeIdentity> {
  const origin = new URL(config.baseUrl).origin
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(3000, Math.min(12_000, config.timeoutMs)))
  try {
    const response = await fetcher(`${origin}/api/tags`, {
      headers: {
        accept: 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}`, 'x-api-key': config.apiKey } : {}),
      },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`working_cos_runtime_identity_http_${response.status}`)
    const body = await response.json() as {
      models?: Array<{
        name?: string
        model?: string
        digest?: string
        modified_at?: string
        size?: number
        details?: {
          family?: string
          parameter_size?: string
          quantization_level?: string
        }
      }>
    }
    const expected = clean(config.model, 240)
    const row = (body.models || []).find(item => clean(item.model || item.name, 240) === expected)
    if (!row) {
      return Object.freeze({
        ready: false,
        model: null,
        digest: null,
        modifiedAt: null,
        size: null,
        family: null,
        parameterSize: null,
        quantizationLevel: null,
      })
    }
    const digest = normalizeOllamaDigest(row.digest)
    return Object.freeze({
      ready: Boolean(digest),
      model: clean(row.model || row.name, 240) || null,
      digest,
      modifiedAt: clean(row.modified_at, 100) || null,
      size: Number.isFinite(Number(row.size)) ? Math.max(0, Number(row.size)) : null,
      family: clean(row.details?.family, 120) || null,
      parameterSize: clean(row.details?.parameter_size, 120) || null,
      quantizationLevel: clean(row.details?.quantization_level, 120) || null,
    })
  } finally {
    clearTimeout(timer)
  }
}

export type WorkingCosRuntimeBindingInput = Readonly<{
  runtimeReady: boolean
  podId: unknown
  configuredRuntimeModel: unknown
  observedRuntimeModel: unknown
  observedRuntimeDigest: unknown
  declaredRuntimeDigest: unknown
  trainableBaseModelId: unknown
  trainableBaseModelRevision: unknown
}>

export type WorkingCosRuntimeBindingBlocker =
  | 'runtime_not_ready'
  | 'pod_identity_missing'
  | 'configured_runtime_model_missing'
  | 'observed_runtime_model_missing'
  | 'runtime_model_mismatch'
  | 'observed_runtime_digest_invalid'
  | 'declared_runtime_digest_invalid'
  | 'runtime_digest_binding_mismatch'
  | 'trainable_base_model_missing'
  | 'trainable_base_revision_invalid'

/**
 * Prove that the live immutable runtime baseline is explicitly bound to one pinned trainable base.
 *
 * The digest declaration is deliberately separate from the observed digest: an operator/configuration
 * must state which exact Ollama artifact corresponds to the pinned training base. Observing a model
 * alias alone never creates that compatibility claim.
 */
export function buildWorkingCosRuntimeBinding(input: WorkingCosRuntimeBindingInput) {
  const blockers: WorkingCosRuntimeBindingBlocker[] = []
  const podId = clean(input.podId, 120)
  const configuredRuntimeModel = clean(input.configuredRuntimeModel, 240)
  const observedRuntimeModel = clean(input.observedRuntimeModel, 240)
  const observedRuntimeDigest = normalizeOllamaDigest(input.observedRuntimeDigest)
  const declaredRuntimeDigest = normalizeOllamaDigest(input.declaredRuntimeDigest)
  const trainableBaseModelId = clean(input.trainableBaseModelId, 300)
  const trainableBaseModelRevision = clean(input.trainableBaseModelRevision, 40).toLowerCase()

  if (input.runtimeReady !== true) blockers.push('runtime_not_ready')
  if (!podId) blockers.push('pod_identity_missing')
  if (!configuredRuntimeModel) blockers.push('configured_runtime_model_missing')
  if (!observedRuntimeModel) blockers.push('observed_runtime_model_missing')
  if (configuredRuntimeModel && observedRuntimeModel && configuredRuntimeModel !== observedRuntimeModel) {
    blockers.push('runtime_model_mismatch')
  }
  if (!observedRuntimeDigest) blockers.push('observed_runtime_digest_invalid')
  if (!declaredRuntimeDigest) blockers.push('declared_runtime_digest_invalid')
  if (observedRuntimeDigest && declaredRuntimeDigest && observedRuntimeDigest !== declaredRuntimeDigest) {
    blockers.push('runtime_digest_binding_mismatch')
  }
  if (!trainableBaseModelId) blockers.push('trainable_base_model_missing')
  if (!HEX40.test(trainableBaseModelRevision)) blockers.push('trainable_base_revision_invalid')

  const eligible = blockers.length === 0
  const baselineIdentity = eligible
    ? `runpod:${podId}:ollama:${observedRuntimeModel}@sha256:${observedRuntimeDigest}`
    : null
  const rollbackArtifactRef = eligible
    ? `itmounts://runpod-primary/${podId}/ollama/${encodeURIComponent(observedRuntimeModel)}@sha256:${observedRuntimeDigest}`
    : null
  const trainableBaseRef = eligible
    ? `hf://models/${trainableBaseModelId}@${trainableBaseModelRevision}`
    : null
  const bindingKey = eligible
    ? hash({
        profile: COS_WORKING_RUNTIME_BINDING_PROFILE,
        podId,
        configuredRuntimeModel,
        observedRuntimeModel,
        observedRuntimeDigest,
        trainableBaseModelId,
        trainableBaseModelRevision,
      })
    : null

  return Object.freeze({
    profile: COS_WORKING_RUNTIME_BINDING_PROFILE,
    eligible,
    blockers: Object.freeze(blockers),
    bindingKey,
    podId: podId || null,
    configuredRuntimeModel: configuredRuntimeModel || null,
    observedRuntimeModel: observedRuntimeModel || null,
    observedRuntimeDigest,
    trainableBaseModelId: trainableBaseModelId || null,
    trainableBaseModelRevision: HEX40.test(trainableBaseModelRevision) ? trainableBaseModelRevision : null,
    trainableBaseRef,
    baselineIdentity,
    rollbackArtifactRef,
    currentRuntimeMutationAuthorized: false as const,
    trainingDispatchAuthorized: false as const,
    productionTrafficAuthorized: false as const,
    nextGate: eligible ? 'balanced_bundle_partition_and_bounded_training_dispatch' as const : 'runtime_binding' as const,
  })
}

export function workingCosRuntimeBindingFromEnv(
  identity: WorkingCosRuntimeIdentity,
  podId: unknown,
  configuredRuntimeModel: unknown,
  env: NodeJS.ProcessEnv = process.env,
) {
  return buildWorkingCosRuntimeBinding({
    runtimeReady: identity.ready,
    podId,
    configuredRuntimeModel,
    observedRuntimeModel: identity.model,
    observedRuntimeDigest: identity.digest,
    declaredRuntimeDigest: env.COS_WORKING_DISTILLATION_RUNTIME_DIGEST,
    trainableBaseModelId: env.COS_WORKING_DISTILLATION_BASE_MODEL_ID,
    trainableBaseModelRevision: env.COS_WORKING_DISTILLATION_BASE_MODEL_REVISION,
  })
}
