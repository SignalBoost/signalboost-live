import { localInferenceConfigFromEnv, type LocalInferenceConfig } from '@/lib/ai/local-inference'
import { localInferenceTargetsRunpod } from '@/lib/ai/cos/runpodConfig'

const MODEL_LIST_TIMEOUT_MS = 10_000
const COMPLETION_TIMEOUT_MS = 45_000
const MIN_COMPLETION_TIMEOUT_MS = 5_000
const MAX_COMPLETION_TIMEOUT_MS = 120_000
const BODY_EXCERPT = 600

export type ReasonerProbeVerdict =
  | 'ok'
  | 'config_error'
  | 'endpoint_unreachable'
  | 'auth_rejected'
  | 'model_not_found'
  | 'completion_failed'
  | 'empty_completion'

export type ReasonerProbeOptions = {
  completionTimeoutMs?: number
}

export interface ReasonerProbeResult {
  verdict: ReasonerProbeVerdict
  summary: string
  remedy: string[]
  config: {
    baseUrl: string | null
    model: string | null
    apiKeyPresent: boolean
    timeoutMs: number | null
  }
  modelList: {
    reachable: boolean
    httpStatus: number | null
    availableModels: string[]
    configuredModelAvailable: boolean | null
    error: string | null
  }
  completion: {
    attempted: boolean
    httpStatus: number | null
    latencyMs: number | null
    text: string | null
    bodyExcerpt: string | null
    error: string | null
  }
}

function excerpt(value: string): string {
  const text = String(value).replace(/\s+/g, ' ').trim()
  return text.length > BODY_EXCERPT ? `${text.slice(0, BODY_EXCERPT)}…` : text
}

function authHeaders(apiKey?: string): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}`, 'x-api-key': apiKey } : {}
}

export function reasonerProbeCompletionTimeoutMs(requested?: number): number {
  const value = Number(requested)
  if (!Number.isFinite(value) || value <= 0) return COMPLETION_TIMEOUT_MS
  return Math.max(MIN_COMPLETION_TIMEOUT_MS, Math.min(MAX_COMPLETION_TIMEOUT_MS, Math.floor(value)))
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function modelIdsFrom(payload: unknown): string[] {
  const data = (payload as { data?: unknown })?.data
  if (!Array.isArray(data)) return []
  return data
    .map((entry) => (entry as { id?: unknown })?.id)
    .filter((id): id is string => typeof id === 'string')
}

function matchModel(configured: string, available: string[]): { available: boolean; near: string[] } {
  if (available.includes(configured)) return { available: true, near: [] }
  const lower = configured.toLowerCase()
  const caseInsensitive = available.find((id) => id.toLowerCase() === lower)
  if (caseInsensitive) return { available: true, near: [caseInsensitive] }
  const base = lower.split(':')[0]
  return { available: false, near: available.filter((id) => id.toLowerCase().startsWith(base)) }
}

async function completionResponse(config: LocalInferenceConfig, includeReasoningControl: boolean, timeoutMs: number): Promise<Response> {
  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: 256,
    temperature: 0,
    messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
  }
  if (includeReasoningControl) body.reasoning_effort = 'none'
  return fetchWithTimeout(
    `${config.baseUrl}/chat/completions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(config.apiKey) },
      body: JSON.stringify(body),
    },
    timeoutMs,
  )
}

export async function probeReasoner(options: ReasonerProbeOptions = {}): Promise<ReasonerProbeResult> {
  const completionTimeoutMs = reasonerProbeCompletionTimeoutMs(options.completionTimeoutMs)
  const result: ReasonerProbeResult = {
    verdict: 'ok',
    summary: '',
    remedy: [],
    config: { baseUrl: null, model: null, apiKeyPresent: false, timeoutMs: null },
    modelList: { reachable: false, httpStatus: null, availableModels: [], configuredModelAvailable: null, error: null },
    completion: { attempted: false, httpStatus: null, latencyMs: null, text: null, bodyExcerpt: null, error: null },
  }

  let config: LocalInferenceConfig
  try {
    config = localInferenceConfigFromEnv()
  } catch (error) {
    result.verdict = 'config_error'
    result.summary = `The configured reasoner is not usable: ${error instanceof Error ? error.message : String(error)}`
    result.remedy = ['Check LOCAL_AI_BASE_URL, LOCAL_AI_MODEL, LOCAL_AI_API_KEY and LOCAL_AI_ALLOWED_HOSTS.']
    return result
  }

  result.config = {
    baseUrl: config.baseUrl,
    model: config.model,
    apiKeyPresent: Boolean(config.apiKey),
    timeoutMs: config.timeoutMs,
  }

  const strictModelList = localInferenceTargetsRunpod(config.baseUrl)
  if (strictModelList) {
    try {
      const response = await fetchWithTimeout(`${config.baseUrl}/models`, { headers: authHeaders(config.apiKey) }, MODEL_LIST_TIMEOUT_MS)
      result.modelList.httpStatus = response.status
      result.modelList.reachable = true
      const raw = await response.text()
      if (!response.ok) {
        result.modelList.error = excerpt(`HTTP ${response.status}: ${raw}`)
        result.verdict = response.status === 401 || response.status === 403 ? 'auth_rejected' : 'endpoint_unreachable'
        result.summary = result.verdict === 'auth_rejected'
          ? `The RunPod reasoner rejected our credentials (HTTP ${response.status}).`
          : `The RunPod reasoner answered HTTP ${response.status} when asked for its model list.`
        return result
      }
      const models = modelIdsFrom(JSON.parse(raw) as unknown)
      result.modelList.availableModels = models
      const match = matchModel(config.model, models)
      result.modelList.configuredModelAvailable = match.available
      if (!match.available) {
        result.verdict = 'model_not_found'
        result.summary = `The RunPod endpoint is reachable but does not report "${config.model}".`
        result.remedy = [match.near.length ? `Use one of the reported matching models: ${match.near.join(', ')}.` : 'Pull the configured model or change LOCAL_AI_MODEL.']
        return result
      }
    } catch (error) {
      result.modelList.error = error instanceof Error ? error.message : String(error)
      result.verdict = 'endpoint_unreachable'
      result.summary = `The RunPod reasoner endpoint could not be reached: ${result.modelList.error}`
      return result
    }
  } else {
    result.modelList.error = 'Skipped for non-RunPod provider; chat completion is the authoritative health check.'
  }

  const startedAt = Date.now()
  result.completion.attempted = true
  try {
    let response = await completionResponse(config, !strictModelList, completionTimeoutMs)
    let raw = await response.text()

    // Some OpenAI-compatible providers reject reasoning_effort even though others require it to
    // prevent reasoning-only health replies. Retry once without it on a 400-class compatibility error.
    if (!strictModelList && response.status === 400) {
      response = await completionResponse(config, false, completionTimeoutMs)
      raw = await response.text()
    }

    result.completion.latencyMs = Date.now() - startedAt
    result.completion.httpStatus = response.status

    if (!response.ok) {
      result.completion.bodyExcerpt = excerpt(raw)
      if (response.status === 401 || response.status === 403) {
        result.verdict = 'auth_rejected'
        result.summary = `The reasoner rejected our credentials (HTTP ${response.status}).`
      } else if (response.status === 404 && /model/i.test(raw)) {
        result.verdict = 'model_not_found'
        result.summary = `The reasoner does not serve "${config.model}".`
      } else {
        result.verdict = 'completion_failed'
        result.summary = `A real completion failed with HTTP ${response.status}: ${excerpt(raw)}`
      }
      return result
    }

    const payload = JSON.parse(raw) as {
      choices?: Array<{ message?: { content?: string | null; reasoning_content?: unknown; reasoning?: unknown } }>
    }
    const text = payload.choices?.[0]?.message?.content
    if (typeof text !== 'string' || text.trim().length === 0) {
      result.completion.bodyExcerpt = excerpt(raw)
      result.verdict = 'empty_completion'
      result.summary = `The endpoint returned HTTP 200 in ${result.completion.latencyMs}ms but no final text.`
      result.remedy = ['Increase the health-probe output budget or disable reasoning for the probe on this provider.']
      return result
    }

    result.completion.text = excerpt(text)
    result.summary = `The reasoner answered in ${result.completion.latencyMs}ms with "${result.completion.text}".`
    return result
  } catch (error) {
    result.completion.latencyMs = Date.now() - startedAt
    result.completion.error = error instanceof Error ? error.message : String(error)
    result.verdict = 'completion_failed'
    result.summary = /abort/i.test(result.completion.error)
      ? `The completion exceeded ${completionTimeoutMs}ms and was aborted.`
      : `The completion request failed: ${result.completion.error}`
    return result
  }
}
