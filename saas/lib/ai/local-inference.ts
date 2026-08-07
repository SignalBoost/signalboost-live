export interface LocalModelCallArgs {
  prompt: string
  systemPrompt?: string
  maxTokens?: number
  temperature?: number
}

export interface LocalInferenceConfig {
  baseUrl: string
  model: string
  apiKey?: string
  timeoutMs: number
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value)
  const allowedHosts = new Set(['127.0.0.1', 'localhost', '::1', 'ai-brain'])
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Local AI endpoint must use http or https')
  if (!allowedHosts.has(url.hostname)) throw new Error(`Local AI endpoint host is not allowed: ${url.hostname}`)
  return url.toString().replace(/\/$/, '')
}

export function localInferenceConfigFromEnv(): LocalInferenceConfig {
  const baseUrl = normalizeBaseUrl(process.env.LOCAL_AI_BASE_URL || 'http://ai-brain:8000/v1')
  const model = (process.env.LOCAL_AI_MODEL || '').trim()
  if (!model) throw new Error('LOCAL_AI_MODEL is required when local inference is enabled')
  const timeoutMs = Number(process.env.LOCAL_AI_TIMEOUT_MS || '120000')
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 600000) throw new Error('LOCAL_AI_TIMEOUT_MS must be between 1000 and 600000')
  return { baseUrl, model, apiKey: process.env.LOCAL_AI_API_KEY?.trim() || undefined, timeoutMs }
}

export async function callLocalModel(args: LocalModelCallArgs, config = localInferenceConfigFromEnv()): Promise<string | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs)
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        max_tokens: args.maxTokens ?? 2048,
        temperature: args.temperature ?? 0.2,
        messages: [
          { role: 'system', content: args.systemPrompt ?? 'You are a helpful AI assistant. Return valid JSON when explicitly requested.' },
          { role: 'user', content: args.prompt },
        ],
      }),
    })
    if (!response.ok) {
      console.error('localInference: HTTP error', response.status, await response.text())
      return null
    }
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
    const text = data.choices?.[0]?.message?.content
    return typeof text === 'string' && text.length > 0 ? text : null
  } catch (error) {
    console.error('localInference: request failed', error)
    return null
  } finally {
    clearTimeout(timeout)
  }
}

export async function checkLocalInferenceHealth(config = localInferenceConfigFromEnv()): Promise<{ ok: boolean; model: string; error?: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.min(config.timeoutMs, 5000))
  try {
    const response = await fetch(`${config.baseUrl}/models`, {
      headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : undefined,
      signal: controller.signal,
    })
    if (!response.ok) return { ok: false, model: config.model, error: `HTTP ${response.status}` }
    const data = await response.json() as { data?: Array<{ id?: string }> }
    const available = data.data?.some(item => item.id === config.model) ?? false
    return available ? { ok: true, model: config.model } : { ok: false, model: config.model, error: 'Configured model is not served by the local endpoint' }
  } catch (error) {
    return { ok: false, model: config.model, error: error instanceof Error ? error.message : 'Local inference health check failed' }
  } finally {
    clearTimeout(timeout)
  }
}
