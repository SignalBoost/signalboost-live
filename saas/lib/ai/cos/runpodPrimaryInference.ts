import {
  callLocalModel,
  checkLocalInferenceHealth,
  type LocalInferenceConfig,
  type LocalModelCallArgs,
} from '../local-inference.ts'
import { configuredRunpodPodId, runpodControlConfigured, runpodPrimaryBaseUrl } from './runpodConfig.ts'
import { ensureRunpodReasonerStarted } from './runpodLifecycle.ts'
import { resolveRunpodPrimaryPodId } from './runpodPodResolver.ts'
import { runpodGatewayKey } from '../../hub/runpodTelemetry.ts'

export type RunpodPrimaryWorkload = 'reasoner' | 'builder'
export type RunpodPrimaryAttempt = Readonly<{
  text: string | null
  attempted: boolean
  ready: boolean
  reason: string
  model: string | null
}>

const DEFAULT_REASONER_MODEL = 'qwen3:30b'
const READY_TTL_MS = 60_000
const MAX_READY_WAIT_MS = 120_000
const HEALTH_INTERVAL_MS = 2_000

let readyUntil = 0
let readyModel = ''
let readyPodId = ''
let readinessPromise: Promise<boolean> | null = null

export function runpodPrimaryEnabled(): boolean {
  if (process.env.RUNPOD_PRIMARY_ENABLED?.trim().toLowerCase() === 'false') return false
  return runpodControlConfigured()
}

export function runpodPrimaryModel(workload: RunpodPrimaryWorkload): string {
  const explicit = workload === 'builder'
    ? process.env.RUNPOD_PRIMARY_BUILDER_MODEL?.trim()
    : process.env.RUNPOD_PRIMARY_MODEL?.trim()
  return explicit || process.env.RUNPOD_PRIMARY_MODEL?.trim() || DEFAULT_REASONER_MODEL
}

export function runpodPrimaryConfig(workload: RunpodPrimaryWorkload, podId = configuredRunpodPodId()): LocalInferenceConfig {
  const baseUrl = runpodPrimaryBaseUrl(podId)
  if (!podId || !baseUrl) throw new Error('runpod_primary_pod_not_configured')
  const timeoutMsRaw = Number(process.env.RUNPOD_PRIMARY_TIMEOUT_MS || process.env.LOCAL_AI_TIMEOUT_MS || '120000')
  const timeoutMs = Number.isFinite(timeoutMsRaw) ? Math.max(5_000, Math.min(300_000, Math.round(timeoutMsRaw))) : 120_000
  return {
    baseUrl,
    model: runpodPrimaryModel(workload),
    apiKey: runpodGatewayKey(podId),
    timeoutMs,
    provider: 'runpod',
    routeOwner: 'itmounts',
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function proveReady(workload: RunpodPrimaryWorkload, podId: string): Promise<boolean> {
  const config = runpodPrimaryConfig(workload, podId)
  if (readyPodId === podId && readyModel === config.model && readyUntil > Date.now()) return true
  if (readinessPromise) return readinessPromise

  readinessPromise = (async () => {
    await ensureRunpodReasonerStarted({
      reasonerModel: config.model,
      embeddingModel: process.env.RUNPOD_PRIMARY_EMBEDDING_MODEL?.trim() || 'nomic-embed-text',
    })

    const deadline = Date.now() + Math.min(MAX_READY_WAIT_MS, Math.max(10_000, config.timeoutMs))
    while (Date.now() < deadline) {
      const health = await checkLocalInferenceHealth(config)
      if (health.ok && health.model === config.model) {
        readyPodId = podId
        readyModel = config.model
        readyUntil = Date.now() + READY_TTL_MS
        return true
      }
      await sleep(HEALTH_INTERVAL_MS)
    }
    return false
  })()

  try {
    return await readinessPromise
  } finally {
    readinessPromise = null
  }
}

/**
 * Resolve and prove the iTMounts RunPod primary serving configuration without dispatching inference.
 * A stale configured pod id may be recovered only through the authenticated canonical-pod resolver.
 */
export async function resolveReadyRunpodPrimaryConfig(
  workload: RunpodPrimaryWorkload,
): Promise<LocalInferenceConfig | null> {
  if (!runpodPrimaryEnabled()) return null
  try {
    const podId = await resolveRunpodPrimaryPodId()
    const ready = await proveReady(workload, podId)
    return ready ? runpodPrimaryConfig(workload, podId) : null
  } catch (error) {
    console.warn('[runpod-primary-resolution]', JSON.stringify({
      workload,
      ready: false,
      reason: error instanceof Error ? error.message : String(error),
    }))
    return null
  }
}

/**
 * Try iTMounts-controlled RunPod first. Failure is explicit and non-terminal: callers decide whether
 * the existing DeepInfra runtime is an acceptable bounded fallback for that workload.
 */
export async function tryRunpodPrimaryInference(
  args: LocalModelCallArgs,
  workload: RunpodPrimaryWorkload,
): Promise<RunpodPrimaryAttempt> {
  if (!runpodPrimaryEnabled()) {
    return { text: null, attempted: false, ready: false, reason: 'runpod_primary_not_configured', model: null }
  }

  const model = runpodPrimaryModel(workload)
  try {
    const config = await resolveReadyRunpodPrimaryConfig(workload)
    if (!config) {
      return { text: null, attempted: true, ready: false, reason: 'runpod_primary_not_ready', model }
    }
    const text = await callLocalModel(args, config)
    return {
      text: text?.trim() ? text : null,
      attempted: true,
      ready: true,
      reason: text?.trim() ? 'runpod_primary_success' : 'runpod_primary_empty_response',
      model: config.model,
    }
  } catch (error) {
    return {
      text: null,
      attempted: true,
      ready: false,
      reason: error instanceof Error ? error.message : 'runpod_primary_failed',
      model,
    }
  }
}
