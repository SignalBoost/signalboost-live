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
export type RunpodPrimaryMode = 'off' | 'serverless' | 'pod'
export type RunpodPrimaryAttempt = Readonly<{
  text: string | null
  attempted: boolean
  ready: boolean
  reason: string
  model: string | null
  mode?: RunpodPrimaryMode
}>

const DEFAULT_SERVERLESS_MODEL = 'Qwen/Qwen3-4B'
const DEFAULT_POD_MODEL = 'qwen3:30b'
const READY_TTL_MS = 60_000
const MAX_READY_WAIT_MS = 120_000
const HEALTH_INTERVAL_MS = 2_000

let readyUntil = 0
let readyModel = ''
let readyPodId = ''
let readinessPromise: Promise<boolean> | null = null

function clean(value: unknown, limit = 4000): string {
  return String(value ?? '').trim().slice(0, limit)
}

function boundedInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback
}

export function runpodServerlessLlmConfigured(env: Record<string, string | undefined> = process.env): boolean {
  const endpointId = clean(env.RUNPOD_SERVERLESS_LLM_ENDPOINT_ID, 120)
  const key = clean(env.RUNPOD_SERVERLESS_LLM_API_KEY || env.RUNPOD_API_KEY, 4096)
  return /^[A-Za-z0-9_-]{3,120}$/.test(endpointId) && key.length >= 20
}

/**
 * Fixed Pods are never an implicit primary anymore: stopping an on-demand Pod releases its GPU and
 * restart depends on whatever capacity is available later. Serverless is the default RunPod primary
 * once configured. A fixed Pod is used only when RUNPOD_PRIMARY_MODE=pod is deliberately set.
 */
export function runpodPrimaryMode(env: Record<string, string | undefined> = process.env): RunpodPrimaryMode {
  if (clean(env.RUNPOD_PRIMARY_ENABLED, 20).toLowerCase() === 'false') return 'off'
  const explicit = clean(env.RUNPOD_PRIMARY_MODE, 40).toLowerCase()
  if (explicit === 'off') return 'off'
  if (explicit === 'serverless') return runpodServerlessLlmConfigured(env) ? 'serverless' : 'off'
  if (explicit === 'pod') return runpodControlConfigured() ? 'pod' : 'off'
  return runpodServerlessLlmConfigured(env) ? 'serverless' : 'off'
}

export function runpodPrimaryEnabled(): boolean {
  return runpodPrimaryMode() !== 'off'
}

export function runpodPrimaryModel(workload: RunpodPrimaryWorkload, mode = runpodPrimaryMode()): string {
  if (mode === 'serverless') {
    const explicit = workload === 'builder'
      ? clean(process.env.RUNPOD_SERVERLESS_BUILDER_MODEL, 240)
      : clean(process.env.RUNPOD_SERVERLESS_LLM_MODEL, 240)
    return explicit
      || clean(process.env.RUNPOD_SERVERLESS_LLM_MODEL, 240)
      || clean(process.env.RUNPOD_PRIMARY_MODEL, 240)
      || DEFAULT_SERVERLESS_MODEL
  }
  const explicit = workload === 'builder'
    ? clean(process.env.RUNPOD_PRIMARY_BUILDER_MODEL, 240)
    : clean(process.env.RUNPOD_PRIMARY_MODEL, 240)
  return explicit || clean(process.env.RUNPOD_PRIMARY_MODEL, 240) || DEFAULT_POD_MODEL
}

export function runpodServerlessPrimaryConfig(workload: RunpodPrimaryWorkload): LocalInferenceConfig {
  const endpointId = clean(process.env.RUNPOD_SERVERLESS_LLM_ENDPOINT_ID, 120)
  const apiKey = clean(process.env.RUNPOD_SERVERLESS_LLM_API_KEY || process.env.RUNPOD_API_KEY, 4096)
  if (!runpodServerlessLlmConfigured()) throw new Error('runpod_serverless_llm_not_configured')
  const timeoutMs = boundedInt(process.env.RUNPOD_SERVERLESS_LLM_TIMEOUT_MS || process.env.LOCAL_AI_TIMEOUT_MS, 120_000, 5_000, 300_000)
  return {
    baseUrl: `https://api.runpod.ai/v2/${endpointId}/openai/v1`,
    model: runpodPrimaryModel(workload, 'serverless'),
    apiKey,
    timeoutMs,
    provider: 'runpod',
    routeOwner: 'itmounts',
  }
}

export function runpodPodPrimaryConfig(workload: RunpodPrimaryWorkload, podId = configuredRunpodPodId()): LocalInferenceConfig {
  const baseUrl = runpodPrimaryBaseUrl(podId)
  if (!podId || !baseUrl) throw new Error('runpod_primary_pod_not_configured')
  const timeoutMs = boundedInt(process.env.RUNPOD_PRIMARY_TIMEOUT_MS || process.env.LOCAL_AI_TIMEOUT_MS, 120_000, 5_000, 300_000)
  return {
    baseUrl,
    model: runpodPrimaryModel(workload, 'pod'),
    apiKey: runpodGatewayKey(podId),
    timeoutMs,
    provider: 'runpod',
    routeOwner: 'itmounts',
  }
}

/** Backward-compatible alias for the explicit fixed-Pod configuration only. */
export function runpodPrimaryConfig(workload: RunpodPrimaryWorkload, podId = configuredRunpodPodId()): LocalInferenceConfig {
  return runpodPodPrimaryConfig(workload, podId)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function provePodReady(workload: RunpodPrimaryWorkload, podId: string): Promise<boolean> {
  const config = runpodPodPrimaryConfig(workload, podId)
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
 * Resolve iTMounts RunPod primary configuration without dispatching inference. Serverless has no Pod
 * wake step: the request itself is the worker-demand signal. The fixed-Pod path is preserved only for
 * an explicit RUNPOD_PRIMARY_MODE=pod escape hatch.
 */
export async function resolveReadyRunpodPrimaryConfig(
  workload: RunpodPrimaryWorkload,
): Promise<LocalInferenceConfig | null> {
  const mode = runpodPrimaryMode()
  if (mode === 'off') return null
  if (mode === 'serverless') return runpodServerlessPrimaryConfig(workload)
  try {
    const podId = await resolveRunpodPrimaryPodId()
    const ready = await provePodReady(workload, podId)
    return ready ? runpodPodPrimaryConfig(workload, podId) : null
  } catch (error) {
    console.warn('[runpod-primary-resolution]', JSON.stringify({
      workload,
      mode,
      ready: false,
      reason: error instanceof Error ? error.message : String(error),
    }))
    return null
  }
}

/**
 * Try iTMounts-controlled RunPod first. Serverless gets bounded cold-start retries because workers
 * scale to zero and GPU placement may need a moment. If all compatible RunPod capacity is unavailable,
 * callers retain DeepInfra as a bounded fallback instead of failing Concierge/Builder.
 */
export async function tryRunpodPrimaryInference(
  args: LocalModelCallArgs,
  workload: RunpodPrimaryWorkload,
): Promise<RunpodPrimaryAttempt> {
  const mode = runpodPrimaryMode()
  if (mode === 'off') {
    return { text: null, attempted: false, ready: false, reason: 'runpod_primary_not_configured', model: null, mode }
  }

  const model = runpodPrimaryModel(workload, mode)
  try {
    const config = await resolveReadyRunpodPrimaryConfig(workload)
    if (!config) {
      return { text: null, attempted: true, ready: false, reason: 'runpod_primary_not_ready', model, mode }
    }

    const retries = mode === 'serverless'
      ? boundedInt(process.env.RUNPOD_SERVERLESS_COLD_START_RETRIES, 2, 0, 5)
      : 0
    const retryDelayMs = boundedInt(process.env.RUNPOD_SERVERLESS_COLD_START_RETRY_MS, 1500, 250, 10_000)
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const text = await callLocalModel(args, config)
      if (text?.trim()) {
        return {
          text,
          attempted: true,
          ready: true,
          reason: attempt === 0 ? 'runpod_primary_success' : 'runpod_serverless_cold_start_recovered',
          model: config.model,
          mode,
        }
      }
      if (attempt < retries) await sleep(retryDelayMs)
    }

    return {
      text: null,
      attempted: true,
      ready: mode === 'serverless',
      reason: mode === 'serverless' ? 'runpod_serverless_unavailable_after_retries' : 'runpod_primary_empty_response',
      model: config.model,
      mode,
    }
  } catch (error) {
    return {
      text: null,
      attempted: true,
      ready: false,
      reason: error instanceof Error ? error.message : 'runpod_primary_failed',
      model,
      mode,
    }
  }
}
