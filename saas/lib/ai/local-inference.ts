import { ensureRunpodReasonerStarted, runpodLifecycleEnabled } from '@/lib/ai/cos/runpodLifecycle'

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

async function waitForInference(config: LocalInferenceConfig): Promise<void> {
  if (!runpodLifecycleEnabled()) return
  await ensureRunpodReasonerStarted()
  const timeoutMs = Number(process.env.RUNPOD_START_TIMEOUT_MS || '180000')
  const deadline = Date.now() + (Number.isFinite(timeoutMs) ? timeoutMs : 180000)
  while (Date.now() < deadline) {
    const health = await checkLocalInferenceHealth(config)
    if (health.ok) return
    await new Promise(resolve => setTimeout(resolve, 3000))
  }
  throw new Error('RunPod reasoner did not become healthy before startup timeout')
}

export async function callLocalModel(args: LocalModelCallArgs, config = localInferenceConfigFromEnv()): Promise<string | null> {
  const startedAt = Date.now()
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), config.timeoutMs)
  let startupLatencyMs = 0
  let inferenceStartedAt: number | null = null
  let httpStatus: number | null = null
  let errorText: string | null = null
  try {
    const startupStartedAt = Date.now()
    try {
      await waitForInference(config)
    } finally {
      startupLatencyMs = Date.now() - startupStartedAt
    }
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
    clearTimeout(timeout)
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
