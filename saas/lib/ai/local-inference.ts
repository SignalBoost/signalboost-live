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

function runpodStartTimeoutMs(): number {
  // Keep cold-start waiting bounded so a Vercel 300s function still has enough time for actual
  // inference, persistence, and an honest response.
  const configured = Number(process.env.RUNPOD_START_TIMEOUT_MS || '90000')
  return Number.isFinite(configured) ? Math.max(5_000, Math.min(90_000, configured)) : 90_000
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
 * immediately stops the Pod before propagating the error.
 */
export async function ensureLocalInferenceRuntimeReady(config = localInferenceConfigFromEnv()): Promise<void> {
  if (!runpodLifecycleEnabled()) return

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
    const wake = await ensureRunpodReasonerStarted()
    try {
      const timeoutMs = runpodStartTimeoutMs()
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        const health = await checkLocalInferenceHealth(config)
        if (health.ok) return
        await new Promise(resolve => setTimeout(resolve, 3000))
      }
      throw new Error(`Reasoner unavailable (cold start): RunPod did not become healthy within ${timeoutMs}ms`)
    } catch (error) {
      if (wake.computeStartedByRequest) {
        try {
          const stopped = await stopRunpodReasoner()
          console.warn('[cos-runpod-cold-start-failsafe]', JSON.stringify({
            at: new Date().toISOString(),
            resumeRequested: wake.resumeRequested,
            startupContractRepaired: wake.startupContractRepaired,
            computeStartedByRequest: wake.computeStartedByRequest,
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
