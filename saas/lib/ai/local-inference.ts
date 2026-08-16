import { AsyncLocalStorage } from 'node:async_hooks'
import { ensureRunpodReasonerStarted, runpodLifecycleEnabled, stopRunpodReasoner } from '@/lib/ai/cos/runpodLifecycle'
import type { RunpodWakePermission } from '@/lib/ai/cos/runpodWakePermission'

export interface LocalModelCallArgs { prompt: string; systemPrompt?: string; maxTokens?: number; temperature?: number }
export interface LocalInferenceConfig { baseUrl: string; model: string; apiKey?: string; timeoutMs: number }

export interface LocalInferenceTelemetry {
  at: string
  model: string
  latencyMs: number
  startupLatencyMs: number
  inferenceLatencyMs: number
  success: boolean
  httpStatus: number | null
  error: string | null
  runpodLifecycleEnabled: boolean
}

const runpodWakeContext = new AsyncLocalStorage<RunpodWakePermission>()

export function withRunpodWakePermission<T>(permission: RunpodWakePermission, operation: () => Promise<T>): Promise<T> {
  return runpodWakeContext.run(permission, operation)
}

export function currentRunpodWakePermission(): RunpodWakePermission | null {
  return runpodWakeContext.getStore() ?? null
}

export function runpodWakePermitted(): boolean {
  return currentRunpodWakePermission()?.allowed === true
}

function emitLocalInferenceTelemetry(event: LocalInferenceTelemetry): void {
  console.info('[cos-local-inference-telemetry]', JSON.stringify(event))
}

function normalizeHost(value: string): string { return value.trim().toLowerCase().replace(/^\[|\]$/g, '') }
function configuredRemoteHosts(): Set<string> { return new Set((process.env.LOCAL_AI_ALLOWED_HOSTS || '').split(',').map(normalizeHost).filter(Boolean)) }
function isLoopbackOrInternalHost(hostname: string): boolean { const host = normalizeHost(hostname); return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === 'ai-brain' }
function normalizeBaseUrl(value: string): string {
  const url = new URL(value); const host = normalizeHost(url.hostname); const internal = isLoopbackOrInternalHost(host); const explicitlyAllowed = configuredRemoteHosts().has(host)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Local AI endpoint must use http or https')
  if (!internal && !explicitlyAllowed) throw new Error(`Local AI endpoint host is not allowed: ${url.hostname}. Add the exact host to LOCAL_AI_ALLOWED_HOSTS.`)
  if (!internal && url.protocol !== 'https:') throw new Error('Remote local-AI endpoints must use https')
  if (!internal && !process.env.LOCAL_AI_API_KEY?.trim()) throw new Error('LOCAL_AI_API_KEY is required for a remote local-AI endpoint')
  if (url.username || url.password) throw new Error('Local AI endpoint credentials must not be embedded in LOCAL_AI_BASE_URL')
  return url.toString().replace(/\/$/, '')
}
function authHeaders(apiKey?: string): Record<string, string> { return apiKey ? { Authorization: `Bearer ${apiKey}`, 'x-api-key': apiKey } : {} }
export function localInferenceConfigFromEnv(): LocalInferenceConfig {
  const baseUrl = normalizeBaseUrl(process.env.LOCAL_AI_BASE_URL || 'http://ai-brain:8000/v1'); const model = (process.env.LOCAL_AI_MODEL || '').trim()
  if (!model) throw new Error('LOCAL_AI_MODEL is required when local inference is enabled')
  const timeoutMs = Number(process.env.LOCAL_AI_TIMEOUT_MS || '120000')
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 600000) throw new Error('LOCAL_AI_TIMEOUT_MS must be between 1000 and 600000')
  return { baseUrl, model, apiKey: process.env.LOCAL_AI_API_KEY?.trim() || undefined, timeoutMs }
}

let runtimeReadyPromise: Promise<void> | null = null

const COS_PRIMARY_FUNCTION_BUDGET_MS = 300_000
const COS_POST_INFERENCE_RESERVE_MS = 60_000
const MAX_RUNPOD_READINESS_BUDGET_MS = 120_000
const MIN_RUNPOD_READINESS_SLICE_MS = 5_000

function runpodStartTimeoutMs(): number {
  const configured = Number(process.env.RUNPOD_START_TIMEOUT_MS || '90000')
  return Number.isFinite(configured) ? Math.max(5_000, Math.min(90_000, configured)) : 90_000
}

function runpodTotalReadinessBudgetMs(config: LocalInferenceConfig): number {
  // /api/cos-primary and its browser ingress run with maxDuration=300s. Reserve the configured
  // model-call timeout plus a fixed tail for retrieval, persistence, telemetry and serialization.
  // The cold-start gate may use only what remains, never a fresh 60s retry on top of the first wait.
  const available = COS_PRIMARY_FUNCTION_BUDGET_MS - config.timeoutMs - COS_POST_INFERENCE_RESERVE_MS
  return Math.max(0, Math.min(MAX_RUNPOD_READINESS_BUDGET_MS, available))
}

function remainingReadinessBudgetMs(startedAt: number, totalBudgetMs: number): number {
  return Math.max(0, totalBudgetMs - (Date.now() - startedAt))
}

async function waitForLocalInferenceHealth(config: LocalInferenceConfig, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (true) {
    const remainingMs = deadline - Date.now()
    if (remainingMs < 1_000) return false
    const health = await checkLocalInferenceHealth({ ...config, timeoutMs: Math.min(config.timeoutMs, remainingMs) })
    if (health.ok) return true
    const sleepMs = Math.min(3_000, Math.max(0, deadline - Date.now()))
    if (sleepMs <= 0) return false
    await new Promise(resolve => setTimeout(resolve, sleepMs))
  }
}

/**
 * Shared readiness gate for every consumer of the secured RunPod runtime.
 *
 * CRITICAL COST BOUNDARY: a stopped/unhealthy RunPod may be resumed ONLY inside a request-scoped
 * permission created from a fresh same-origin user interaction. Background jobs, cron handlers,
 * delayed server-to-server calls, stale browser replays and tests have no permission by default and
 * therefore fail fast instead of allocating GPU compute. If the model is already healthy, callers
 * may continue to use it without changing lifecycle state.
 *
 * Cost fail-safe: if an authorized interactive gate started compute and readiness never succeeds, it
 * immediately stops the Pod before propagating the error. A cold start that returns to EXITED may be
 * resumed one additional time under the same already-validated request permission, but both attempts
 * share one end-to-end readiness budget so model inference and downstream response work remain reserved.
 */
export async function ensureLocalInferenceRuntimeReady(config = localInferenceConfigFromEnv()): Promise<void> {
  if (!runpodLifecycleEnabled()) return

  const readinessStartedAt = Date.now()
  const current = await checkLocalInferenceHealth(config)
  if (current.ok) return

  const permission = currentRunpodWakePermission()
  if (!permission?.allowed) {
    console.info('[cos-runpod-wake-blocked]', JSON.stringify({
      at: new Date().toISOString(),
      reason: permission?.reason ?? 'no_request_scoped_wake_permission',
      source: permission?.source ?? 'background_or_untrusted',
      interactionId: permission?.interactionId ?? null,
      healthError: current.error ?? null,
    }))
    throw new Error('Reasoner is stopped or unhealthy and this request is not allowed to wake RunPod')
  }

  if (runtimeReadyPromise) return runtimeReadyPromise

  runtimeReadyPromise = (async () => {
    const totalReadinessBudgetMs = runpodTotalReadinessBudgetMs(config)
    let firstWake: Awaited<ReturnType<typeof ensureRunpodReasonerStarted>> | null = null
    let retryWake: Awaited<ReturnType<typeof ensureRunpodReasonerStarted>> | null = null
    try {
      if (remainingReadinessBudgetMs(readinessStartedAt, totalReadinessBudgetMs) < MIN_RUNPOD_READINESS_SLICE_MS) {
        throw new Error(`Reasoner unavailable (cold start): no safe RunPod readiness budget remains after reserving ${config.timeoutMs}ms for inference and ${COS_POST_INFERENCE_RESERVE_MS}ms for downstream work`)
      }

      firstWake = await ensureRunpodReasonerStarted()
      const firstWaitMs = Math.min(runpodStartTimeoutMs(), remainingReadinessBudgetMs(readinessStartedAt, totalReadinessBudgetMs))
      if (firstWaitMs < MIN_RUNPOD_READINESS_SLICE_MS) {
        throw new Error('Reasoner unavailable (cold start): RunPod lifecycle setup exhausted the safe readiness budget')
      }
      if (await waitForLocalInferenceHealth(config, firstWaitMs)) return

      // Production acceptance observed RunPod acknowledge podResume, fall back to EXITED, and then
      // recover on a second resume. Retry exactly once only when this request owned the first compute
      // allocation. The retry receives only the readiness time still available after the first attempt.
      if (firstWake.computeStartedByRequest) {
        const beforeRetryMs = remainingReadinessBudgetMs(readinessStartedAt, totalReadinessBudgetMs)
        if (beforeRetryMs >= MIN_RUNPOD_READINESS_SLICE_MS) {
          retryWake = await ensureRunpodReasonerStarted()
          if (retryWake.computeStartedByRequest) {
            const retryTimeoutMs = Math.min(60_000, remainingReadinessBudgetMs(readinessStartedAt, totalReadinessBudgetMs))
            if (retryTimeoutMs < MIN_RUNPOD_READINESS_SLICE_MS) {
              throw new Error('Reasoner unavailable (cold start): retry lifecycle setup exhausted the safe readiness budget')
            }
            console.warn('[cos-runpod-cold-start-retry]', JSON.stringify({
              at: new Date().toISOString(),
              firstResumeRequested: firstWake.resumeRequested,
              firstStartupContractRepaired: firstWake.startupContractRepaired,
              retryResumeRequested: retryWake.resumeRequested,
              retryStartupContractRepaired: retryWake.startupContractRepaired,
              previousStatus: retryWake.previousStatus,
              desiredStatus: retryWake.desiredStatus,
              totalReadinessBudgetMs,
              readinessElapsedMs: Date.now() - readinessStartedAt,
              retryTimeoutMs,
            }))
            if (await waitForLocalInferenceHealth(config, retryTimeoutMs)) return
            throw new Error(`Reasoner unavailable (cold start): RunPod did not become healthy within the ${totalReadinessBudgetMs}ms total readiness budget`)
          }
        }
      }

      throw new Error(`Reasoner unavailable (cold start): RunPod did not become healthy within the ${totalReadinessBudgetMs}ms total readiness budget`)
    } catch (error) {
      const computeStartedByRequest = firstWake?.computeStartedByRequest === true || retryWake?.computeStartedByRequest === true
      if (computeStartedByRequest) {
        try {
          const stopped = await stopRunpodReasoner()
          console.warn('[cos-runpod-cold-start-failsafe]', JSON.stringify({
            at: new Date().toISOString(),
            resumeRequested: firstWake?.resumeRequested ?? false,
            startupContractRepaired: firstWake?.startupContractRepaired ?? false,
            retryResumeRequested: retryWake?.resumeRequested ?? false,
            retryStartupContractRepaired: retryWake?.startupContractRepaired ?? false,
            computeStartedByRequest,
            totalReadinessBudgetMs,
            readinessElapsedMs: Date.now() - readinessStartedAt,
            stopAttempted: stopped.attempted,
            stopped: stopped.stopped,
            previousStatus: stopped.previousStatus ?? null,
            desiredStatus: stopped.desiredStatus ?? null,
            reason: error instanceof Error ? error.message : String(error),
          }))
        } catch (stopError) {
          console.error('[cos-runpod-cold-start-failsafe] stop failed', stopError instanceof Error ? stopError.message : String(stopError))
        }
      }
      throw error
    }
  })()

  try {
    await runtimeReadyPromise
  } finally {
    runtimeReadyPromise = null
  }
}

export async function callLocalModel(args: LocalModelCallArgs, config = localInferenceConfigFromEnv()): Promise<string | null> {
  const startedAt = Date.now()
  let startupLatencyMs = 0
  let inferenceStartedAt: number | null = null
  let httpStatus: number | null = null
  let errorText: string | null = null
  let timeout: ReturnType<typeof setTimeout> | null = null
  const controller = new AbortController()
  try {
    const startupStartedAt = Date.now()
    try {
      await ensureLocalInferenceRuntimeReady(config)
    } finally {
      startupLatencyMs = Date.now() - startupStartedAt
    }
    // Start the inference timeout only after the pod is healthy. A cold start therefore cannot
    // consume the actual model-call timeout before the request begins.
    timeout = setTimeout(() => controller.abort(), config.timeoutMs)
    inferenceStartedAt = Date.now()
    const response = await fetch(`${config.baseUrl}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders(config.apiKey) }, signal: controller.signal, body: JSON.stringify({ model: config.model, max_tokens: args.maxTokens ?? 2048, temperature: args.temperature ?? 0.2, messages: [{ role: 'system', content: args.systemPrompt ?? 'You are a helpful AI assistant. Return valid JSON when explicitly requested.' }, { role: 'user', content: args.prompt }] }) })
    httpStatus = response.status
    if (!response.ok) {
      errorText = `HTTP ${response.status}: ${await response.text()}`
      console.error('localInference: HTTP error', response.status, errorText)
      return null
    }
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> }; const text = data.choices?.[0]?.message?.content
    if (typeof text !== 'string' || text.length === 0) errorText = 'Local inference returned an empty response'
    return typeof text === 'string' && text.length > 0 ? text : null
  } catch (error) {
    errorText = error instanceof Error ? error.message : String(error)
    console.error('localInference: request failed', error)
    return null
  } finally {
    if (timeout) clearTimeout(timeout)
    const latencyMs = Date.now() - startedAt
    const inferenceLatencyMs = inferenceStartedAt === null ? 0 : Math.max(0, Date.now() - inferenceStartedAt)
    emitLocalInferenceTelemetry({
      at: new Date().toISOString(),
      model: config.model,
      latencyMs,
      startupLatencyMs,
      inferenceLatencyMs,
      success: errorText === null && httpStatus !== null && httpStatus >= 200 && httpStatus < 300,
      httpStatus,
      error: errorText,
      runpodLifecycleEnabled: runpodLifecycleEnabled(),
    })
  }
}

export async function checkLocalInferenceHealth(config = localInferenceConfigFromEnv()): Promise<{ ok: boolean; model: string; error?: string }> {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), Math.min(config.timeoutMs, 5000))
  try {
    const response = await fetch(`${config.baseUrl}/models`, { headers: authHeaders(config.apiKey), signal: controller.signal })
    if (!response.ok) return { ok: false, model: config.model, error: `HTTP ${response.status}` }
    const data = await response.json() as { data?: Array<{ id?: string }> }
    const available = data.data?.some(item => item.id === config.model) ?? false
    return available ? { ok: true, model: config.model } : { ok: false, model: config.model, error: 'Configured model is not served by the local endpoint' }
  } catch (error) {
    return { ok: false, model: config.model, error: error instanceof Error ? error.message : 'Local inference health check failed' }
  } finally { clearTimeout(timeout) }
}
