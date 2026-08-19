// saas/lib/ai/cos/reasonerProbe.ts
//
// WHY THIS EXISTS. callLocalModel() returns `string | null`. Every distinct failure — a 404 because
// LOCAL_AI_MODEL names a model the pod does not have, a 401 because the key is wrong, a connection
// refused, an abort at LOCAL_AI_TIMEOUT_MS, or a genuinely empty completion — collapses into the same
// `null`, and by the time it reaches the user it reads "Independent COS inference did not return an
// answer." That single sentence is why the last several hours were spent guessing: the pod shows
// RUNNING, port 11434 shows Ready, and the product still says nothing came back.
//
// This probe asks the reasoner the three questions in order and reports each answer separately:
//   1. Is the endpoint reachable at all, and what HTTP status does it give?
//   2. Does it actually have the model LOCAL_AI_MODEL names? (checkLocalInferenceHealth only checks
//      that /models responded 200 — it never compares the list to the configured name, so a model
//      rename or a pod rebuild that lost the pull reads as perfectly healthy.)
//   3. Does a real one-line completion come back non-empty, and how long does it take?
//
// It is read-only: one GET and one tiny generation. It never writes, never learns, and never touches
// the corpus. Secrets are never echoed — the key is only ever sent as a header.

import { localInferenceConfigFromEnv, type LocalInferenceConfig } from '@/lib/ai/local-inference'

/** Bounded so the probe always answers inside a 60s serverless invocation. */
const MODEL_LIST_TIMEOUT_MS = 10_000
const COMPLETION_TIMEOUT_MS = 45_000
const BODY_EXCERPT = 600

export type ReasonerProbeVerdict =
  | 'ok'
  | 'config_error'
  | 'endpoint_unreachable'
  | 'auth_rejected'
  | 'model_not_found'
  | 'completion_failed'
  | 'empty_completion'

export interface ReasonerProbeResult {
  verdict: ReasonerProbeVerdict
  /** One sentence naming the cause, written to be actionable without reading code. */
  summary: string
  /** What to change, when the probe can tell. Empty when everything passed. */
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
    /** Raw response body excerpt on failure. This is the text that was being thrown away. */
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

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Model ids as the endpoint reports them. Ollama's OpenAI-compatible surface returns
 * { data: [{ id: 'qwen2.5:32b' }] }; vLLM and llama.cpp use the same shape.
 */
function modelIdsFrom(payload: unknown): string[] {
  const data = (payload as { data?: unknown })?.data
  if (!Array.isArray(data)) return []
  return data
    .map((entry) => (entry as { id?: unknown })?.id)
    .filter((id): id is string => typeof id === 'string')
}

/**
 * Exact match first, then a case-insensitive match, then a tag-insensitive one: 'qwen2.5:32b' vs
 * 'qwen2.5:32b-instruct-q4_K_M' is the mismatch this is most likely to catch, and reporting it as
 * "not found, but these look close" is more useful than a bare false.
 */
function matchModel(configured: string, available: string[]): { available: boolean; near: string[] } {
  if (available.length === 0) return { available: false, near: [] }
  if (available.includes(configured)) return { available: true, near: [] }
  const lower = configured.toLowerCase()
  const caseInsensitive = available.find((id) => id.toLowerCase() === lower)
  if (caseInsensitive) return { available: true, near: [caseInsensitive] }
  const base = lower.split(':')[0]
  const near = available.filter((id) => id.toLowerCase().startsWith(base))
  return { available: false, near }
}

export async function probeReasoner(): Promise<ReasonerProbeResult> {
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
    result.summary = `The local reasoner is not configured usably: ${error instanceof Error ? error.message : String(error)}`
    result.remedy = [
      'Check LOCAL_AI_BASE_URL, LOCAL_AI_MODEL and LOCAL_AI_API_KEY in Vercel.',
      'A remote endpoint additionally requires its exact host in LOCAL_AI_ALLOWED_HOSTS, https, and an API key.',
    ]
    return result
  }

  result.config = {
    baseUrl: config.baseUrl,
    model: config.model,
    apiKeyPresent: Boolean(config.apiKey),
    timeoutMs: config.timeoutMs,
  }

  // 1 and 2 — reachability and whether the configured model actually exists there.
  try {
    const response = await fetchWithTimeout(`${config.baseUrl}/models`, { headers: authHeaders(config.apiKey) }, MODEL_LIST_TIMEOUT_MS)
    result.modelList.httpStatus = response.status
    result.modelList.reachable = true
    const raw = await response.text()
    if (!response.ok) {
      result.modelList.error = excerpt(`HTTP ${response.status}: ${raw}`)
      result.verdict = response.status === 401 || response.status === 403 ? 'auth_rejected' : 'endpoint_unreachable'
      result.summary =
        result.verdict === 'auth_rejected'
          ? `The reasoner endpoint rejected our credentials (HTTP ${response.status}).`
          : `The reasoner endpoint answered HTTP ${response.status} when asked for its model list.`
      result.remedy =
        result.verdict === 'auth_rejected'
          ? ['Check LOCAL_AI_API_KEY matches what the pod expects.']
          : ['Check LOCAL_AI_BASE_URL points at the pod proxy URL including the /v1 suffix.']
      return result
    }
    const models = modelIdsFrom(JSON.parse(raw) as unknown)
    result.modelList.availableModels = models
    const match = matchModel(config.model, models)
    result.modelList.configuredModelAvailable = match.available
    if (!match.available) {
      result.verdict = 'model_not_found'
      result.summary = `The endpoint is reachable, but it does not serve "${config.model}". It reports: ${models.length > 0 ? models.join(', ') : 'no models at all'}.`
      result.remedy = [
        match.near.length > 0
          ? `Set LOCAL_AI_MODEL to one of the names it actually has: ${match.near.join(', ')}.`
          : 'Pull the model on the pod, or set LOCAL_AI_MODEL to a name from the list above.',
        'This failure class is invisible to /api/admin/cos-reasoner/health, which only checks that the model list responded.',
      ]
      return result
    }
  } catch (error) {
    result.modelList.error = error instanceof Error ? error.message : String(error)
    result.verdict = 'endpoint_unreachable'
    result.summary = `The reasoner endpoint could not be reached at all: ${result.modelList.error}`
    result.remedy = [
      'Confirm the pod is running and its HTTP service port is exposed.',
      'Confirm LOCAL_AI_BASE_URL is the current pod proxy URL — a rebuilt pod gets a new host.',
    ]
    return result
  }

  // 3 — a real completion. This is the step nothing else in the codebase performs.
  const startedAt = Date.now()
  result.completion.attempted = true
  try {
    const response = await fetchWithTimeout(
      `${config.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(config.apiKey) },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 16,
          temperature: 0,
          messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
        }),
      },
      COMPLETION_TIMEOUT_MS,
    )
    result.completion.latencyMs = Date.now() - startedAt
    result.completion.httpStatus = response.status
    const raw = await response.text()
    if (!response.ok) {
      result.completion.bodyExcerpt = excerpt(raw)
      result.verdict = 'completion_failed'
      result.summary = `The model list is fine, but a real completion failed with HTTP ${response.status}. The endpoint said: ${excerpt(raw)}`
      result.remedy = ['This body is the text callLocalModel() discards; it names the real cause.']
      return result
    }
    const payload = JSON.parse(raw) as { choices?: Array<{ message?: { content?: string } }> }
    const text = payload.choices?.[0]?.message?.content
    if (typeof text !== 'string' || text.trim().length === 0) {
      result.completion.bodyExcerpt = excerpt(raw)
      result.verdict = 'empty_completion'
      result.summary = `The endpoint answered HTTP 200 in ${result.completion.latencyMs}ms but returned no text. This is the exact condition the product reports as "did not return an answer".`
      result.remedy = [
        'Check the pod logs for an out-of-memory or model-load failure during generation.',
        'A model that loads but cannot generate returns exactly this shape.',
      ]
      return result
    }
    result.completion.text = excerpt(text)
    result.summary = `The reasoner answered in ${result.completion.latencyMs}ms with "${result.completion.text}". Configuration, model and generation are all working right now.`
    if (result.completion.latencyMs !== null && result.completion.latencyMs > 20_000) {
      result.remedy.push(
        `A 16-token reply took ${Math.round(result.completion.latencyMs / 1000)}s. Real answers are far longer, so LOCAL_AI_TIMEOUT_MS (${config.timeoutMs}ms) may be aborting them mid-generation — an abort also surfaces as "did not return an answer".`,
      )
    }
    return result
  } catch (error) {
    result.completion.latencyMs = Date.now() - startedAt
    result.completion.error = error instanceof Error ? error.message : String(error)
    const aborted = /abort/i.test(result.completion.error)
    result.verdict = 'completion_failed'
    result.summary = aborted
      ? `The completion was still running after ${COMPLETION_TIMEOUT_MS}ms and was aborted. Even a 16-token reply is not coming back in time.`
      : `The completion request failed: ${result.completion.error}`
    result.remedy = aborted
      ? ['The pod is reachable but not generating — check GPU allocation and pod logs for a stuck model load.']
      : ['Check the pod logs at the moment of this probe.']
    return result
  }
}
