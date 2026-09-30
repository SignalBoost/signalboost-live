import {
  callLocalModel,
  checkLocalInferenceHealth,
  LOCAL_MODEL_OUTPUT_TRUNCATED,
  type LocalInferenceConfig,
  type LocalModelCallArgs,
} from '../local-inference.ts'
import { configuredRunpodPodId, runpodControlConfigured, runpodPrimaryBaseUrl } from './runpodConfig.ts'
import { ensureRunpodReasonerStarted } from './runpodLifecycle.ts'
import { resolveRunpodPrimaryPodId } from './runpodPodResolver.ts'
import { acquireRunpodInferenceLease, releaseRunpodInferenceLease } from './runpodInferenceLease.ts'
import { runpodGatewayKey } from '../../hub/runpodTelemetry.ts'
import { cosServiceDb } from '../../cos-core/storage/supabase.ts'

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
    let lastHealthError = 'not_checked'
    while (Date.now() < deadline) {
      const health = await checkLocalInferenceHealth(config)
      if (health.ok && health.model === config.model) {
        readyPodId = podId
        readyModel = config.model
        readyUntil = Date.now() + READY_TTL_MS
        void writeSharedReadiness(podId, config.model)
        return true
      }
      lastHealthError = health.error || `model_mismatch:${health.model}`
      await sleep(HEALTH_INTERVAL_MS)
    }
    console.warn('[runpod-primary-readiness]', JSON.stringify({
      workload,
      podId,
      model: config.model,
      ready: false,
      reason: lastHealthError,
    }))
    return false
  })()

  try {
    return await readinessPromise
  } finally {
    readinessPromise = null
  }
}

// SHARED READINESS (2026-09-30). The readiness proof (pod lookup + wake check + /models health) cost live chat 1.6 s
// on every question because each serverless instance keeps its own 60 s cache. Any instance that proves readiness,
// or completes a chat answer on the pod, records it for all instances. Chat trusts a recent record and skips the proof.
const SHARED_READY_MISSION_ID = '__cos_runpod_primary_ready__'
const SHARED_READY_TTL_MS = 5 * 60_000

async function writeSharedReadiness(podId: string, model: string): Promise<void> {
  try {
    const db = cosServiceDb()
    if (!db) return
    const now = new Date().toISOString()
    await db.from('cos_autonomy_state').upsert({
      mission_id: SHARED_READY_MISSION_ID,
      state: { kind: 'runpod_primary_ready', podId, model, provenAt: now },
      updated_at: now,
    }, { onConflict: 'mission_id' })
  } catch (error) {
    console.warn('[runpod-primary-shared-readiness-write]', error instanceof Error ? error.message : String(error))
  }
}

export function sharedReadinessPodId(state: unknown, model: string, now: number): string | null {
  if (!state || typeof state !== 'object') return null
  const record = state as Record<string, unknown>
  const provenAt = typeof record.provenAt === 'string' ? Date.parse(record.provenAt) : Number.NaN
  if (!Number.isFinite(provenAt) || now - provenAt > SHARED_READY_TTL_MS || provenAt - now > 60_000) return null
  if (record.model !== model || typeof record.podId !== 'string' || !record.podId.trim()) return null
  return record.podId.trim()
}

async function readSharedReadiness(model: string): Promise<string | null> {
  try {
    const db = cosServiceDb()
    if (!db) return null
    const { data, error } = await db.from('cos_autonomy_state').select('state').eq('mission_id', SHARED_READY_MISSION_ID).maybeSingle()
    if (error) return null
    return sharedReadinessPodId(data?.state, model, Date.now())
  } catch {
    return null
  }
}

export async function noteRunpodPrimaryServed(workload: RunpodPrimaryWorkload): Promise<void> {
  const model = runpodPrimaryModel(workload)
  if (!readyPodId || readyModel !== model) return
  readyUntil = Date.now() + READY_TTL_MS
  await writeSharedReadiness(readyPodId, model)
}

export async function invalidateRunpodPrimaryReadiness(): Promise<void> {
  readyUntil = 0
  try {
    const db = cosServiceDb()
    if (!db) return
    await db.from('cos_autonomy_state').delete().eq('mission_id', SHARED_READY_MISSION_ID)
  } catch (error) {
    console.warn('[runpod-primary-shared-readiness-clear]', error instanceof Error ? error.message : String(error))
  }
}

export async function resolveRunpodPrimaryConfigForChat(
  workload: RunpodPrimaryWorkload,
): Promise<LocalInferenceConfig | null> {
  if (!runpodPrimaryEnabled()) return null
  const model = runpodPrimaryModel(workload)
  try {
    if (readyPodId && readyModel === model && readyUntil > Date.now()) return runpodPrimaryConfig(workload, readyPodId)
    const sharedPodId = await readSharedReadiness(model)
    if (sharedPodId) {
      readyPodId = sharedPodId
      readyModel = model
      readyUntil = Date.now() + READY_TTL_MS
      return runpodPrimaryConfig(workload, sharedPodId)
    }
    return resolveReadyRunpodPrimaryConfig(workload)
  } catch (error) {
    console.warn('[runpod-primary-chat-resolution]', error instanceof Error ? error.message : String(error))
    return resolveReadyRunpodPrimaryConfig(workload)
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
 * Try iTMounts-controlled RunPod first. The single physical reasoner is protected by a durable,
 * self-expiring cross-instance lease so parallel Builder/serverless work cannot create a queue that
 * pushes otherwise healthy requests past the inference timeout and into managed-provider fallback.
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

    const lease = await acquireRunpodInferenceLease(config.timeoutMs)
    if (!lease) {
      console.info('[runpod-primary-busy]', JSON.stringify({ workload, model: config.model }))
      return { text: null, attempted: true, ready: true, reason: 'runpod_primary_busy', model: config.model }
    }

    try {
      let text: string | null = null
      try {
        text = await callLocalModel(args, config)
      } catch (error) {
        const emptyThinkingTruncation = error instanceof Error
          && error.message === LOCAL_MODEL_OUTPUT_TRUNCATED
          && (error as Error & { emptyContent?: boolean }).emptyContent === true
        const maxTokens = Number(args.maxTokens)
        const retryEligible = emptyThinkingTruncation
          && args.disableThinking !== true
          && Number.isFinite(maxTokens)
          && maxTokens > 1024

        if (!retryEligible) throw error

        console.warn('[runpod-primary-thinking-retry]', JSON.stringify({
          workload,
          model: config.model,
          feature: args.usageContext?.feature || 'unattributed_local_inference',
          reason: 'empty_hidden_reasoning_exhausted_token_budget',
        }))
        text = await callLocalModel({ ...args, disableThinking: true }, config)
      }
      return {
        text: text?.trim() ? text : null,
        attempted: true,
        ready: true,
        reason: text?.trim() ? 'runpod_primary_success' : 'runpod_primary_empty_response',
        model: config.model,
      }
    } finally {
      await releaseRunpodInferenceLease(lease).catch(error => {
        console.warn('[runpod-primary-lease-release]', error instanceof Error ? error.message : String(error))
      })
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
