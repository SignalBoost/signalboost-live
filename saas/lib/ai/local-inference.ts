import { randomUUID } from 'node:crypto'
import { recordLocalInferenceUsage, type LocalInferenceUsageContext } from './localInferenceUsage.ts'
import { resolvePlatformOwnedInferenceRoute } from './platformOwnedInference.ts'

export interface LocalModelCallArgs {
  prompt: string
  systemPrompt?: string
  maxTokens?: number
  temperature?: number
  /**
   * Repetition penalties are prose defaults. Code generation must be able to override them:
   * indentation, braces, `const`, and repeated identifiers are required tokens in source, and
   * penalising them steers the sampler away from valid code as a file grows.
   */
  frequencyPenalty?: number
  presencePenalty?: number
  /** Ask the provider to enforce a JSON object response. Required for control-object generation. */
  jsonObject?: boolean
  /** Routing + billing attribution. Never expands authority or academic evidence. */
  usageContext?: LocalInferenceUsageContext
}

/**
 * Thrown when the provider reports finish_reason 'length'. The partial content is never returned:
 * a half-written control object or source file must not be mistaken for a finished answer.
 */
export const LOCAL_MODEL_OUTPUT_TRUNCATED = 'local_model_output_truncated'
export interface LocalInferenceConfig {
  baseUrl: string
  model: string
  apiKey?: string
  timeoutMs: number
  /** Actual compute provider, separate from model ownership. */
  provider?: string
  /** `itmounts` means the selected model/runtime asset belongs to iTMounts. */
  routeOwner?: 'itmounts' | 'external'
  graduateCandidateId?: string
  graduateArtifactId?: string
  graduateArtifactHash?: string
}

export type LocalModelExecutionResult = Readonly<{
  text: string
  provider: string
  model: string
  routeOwner: 'itmounts' | 'external'
  graduateCandidateId: string | null
  graduateArtifactId: string | null
  graduateArtifactHash: string | null
  fallbackFromOwned: boolean
}>

export interface LocalInferenceTelemetry {
  at: string
  requestId: string
  provider: string
  model: string
  feature: string
  routeOwner: 'itmounts' | 'external'
  graduateCandidateId: string | null
  graduateArtifactId: string | null
  fallbackFromOwned: boolean
  latencyMs: number
  startupLatencyMs: number
  inferenceLatencyMs: number
  success: boolean
  httpStatus: number | null
  error: string | null
  /** Provider stop reason. 'length' means the answer was cut off by max_tokens, not finished. */
  finishReason: string | null
  requestedMaxTokens: number
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
  cachedPromptTokens: number | null
  providerEstimatedCostUsd: number | null
}

function emitLocalInferenceTelemetry(event: LocalInferenceTelemetry): void {
  console.info('[cos-local-inference-telemetry]', JSON.stringify(event))
}

function normalizeHost(value: string): string { return value.trim().toLowerCase().replace(/^\[|\]$/g, '') }
function configuredRemoteHosts(): Set<string> { return new Set((process.env.LOCAL_AI_ALLOWED_HOSTS || '').split(',').map(normalizeHost).filter(Boolean)) }
function isLoopbackOrInternalHost(hostname: string): boolean { const host = normalizeHost(hostname); return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === 'ai-brain' }
function normalizeBaseUrl(value: string): string {
  const url = new URL(value)
  const host = normalizeHost(url.hostname)
  const internal = isLoopbackOrInternalHost(host)
  const explicitlyAllowed = configuredRemoteHosts().has(host)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Local AI endpoint must use http or https')
  if (!internal && !explicitlyAllowed) throw new Error(`Local AI endpoint host is not allowed: ${url.hostname}. Add the exact host to LOCAL_AI_ALLOWED_HOSTS.`)
  if (!internal && url.protocol !== 'https:') throw new Error('Remote local-AI endpoints must use https')
  if (!internal && !process.env.LOCAL_AI_API_KEY?.trim()) throw new Error('LOCAL_AI_API_KEY is required for a remote local-AI endpoint')
  if (url.username || url.password) throw new Error('Local AI endpoint credentials must not be embedded in LOCAL_AI_BASE_URL')
  return url.toString().replace(/\/$/, '')
}
function authHeaders(apiKey?: string): Record<string, string> { return apiKey ? { Authorization: `Bearer ${apiKey}`, 'x-api-key': apiKey } : {} }

function configuredReasoningEffort(): 'none' | 'low' | 'medium' | 'high' | undefined {
  const value = process.env.LOCAL_AI_REASONING_EFFORT?.trim().toLowerCase()
  if (value === 'none' || value === 'low' || value === 'medium' || value === 'high') return value
  return undefined
}

/** Align a caller's explicit strict-JSON contract with the transport instead of relying on prose alone. */
function strictJsonObjectRequested(args: LocalModelCallArgs): boolean {
  if (args.jsonObject === true) return true
  return /\bReturn ONLY strict JSON\b/i.test(String(args.systemPrompt ?? ''))
}

export function localInferenceConfigFromEnv(): LocalInferenceConfig {
  const baseUrl = normalizeBaseUrl(process.env.LOCAL_AI_BASE_URL || 'http://ai-brain:8000/v1')
  const model = (process.env.LOCAL_AI_MODEL || '').trim()
  if (!model) throw new Error('LOCAL_AI_MODEL is required when local inference is enabled')
  const timeoutMs = Number(process.env.LOCAL_AI_TIMEOUT_MS || '120000')
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 600000) throw new Error('LOCAL_AI_TIMEOUT_MS must be between 1000 and 600000')
  return { baseUrl, model, apiKey: process.env.LOCAL_AI_API_KEY?.trim() || undefined, timeoutMs }
}

/** Managed/configured inference has no server-owned pod lifecycle to prepare. */
export async function ensureLocalInferenceRuntimeReady(_config = localInferenceConfigFromEnv()): Promise<void> {
  return
}

function providerFor(config: LocalInferenceConfig): string {
  const bound = String(config.provider || '').trim().toLowerCase()
  if (bound) return bound.replace(/[^a-z0-9._-]+/g, '-')
  try {
    const host = normalizeHost(new URL(config.baseUrl).hostname)
    if (host === 'api.deepinfra.com' || host.endsWith('.deepinfra.com')) return 'deepinfra'
    if (isLoopbackOrInternalHost(host)) return 'self_hosted'
    const explicit = process.env.LOCAL_AI_MANAGED_PROVIDER?.trim().toLowerCase()
    return explicit ? explicit.replace(/[^a-z0-9._-]+/g, '-') : host
  } catch {
    return 'unknown'
  }
}

function routeOwnerFor(config: LocalInferenceConfig): 'itmounts' | 'external' {
  if (config.routeOwner === 'itmounts') return 'itmounts'
  return providerFor(config) === 'self_hosted' ? 'itmounts' : 'external'
}

function nonNegativeNumber(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function inferredUsageContext(args: LocalModelCallArgs): LocalInferenceUsageContext {
  if (args.usageContext) return args.usageContext
  const system = String(args.systemPrompt || '')
  if (system.includes("SignalBoost's independent PRIMARY reasoning layer")
    || /chief of staff/i.test(system)) {
    return {
      feature: 'cos_reasoner',
      agentId: 'cos',
      purpose: 'chief_of_staff_reasoning',
      subjectId: 'reasoning_decision_science',
    }
  }
  return { feature: 'unattributed_local_inference' }
}

type AttemptResult = Readonly<{
  text: string | null
  finishReason: string | null
  provider: string
  model: string
  routeOwner: 'itmounts' | 'external'
  graduateCandidateId: string | null
  graduateArtifactId: string | null
  graduateArtifactHash: string | null
  fallbackFromOwned: boolean
}>

async function callModelAttempt(input: {
  args: LocalModelCallArgs
  config: LocalInferenceConfig
  fallbackFromOwned?: boolean
}): Promise<AttemptResult> {
  const { args, config } = input
  const startedAt = Date.now()
  const requestId = randomUUID()
  const provider = providerFor(config)
  const routeOwner = routeOwnerFor(config)
  const usageContext = inferredUsageContext(args)
  let inferenceStartedAt: number | null = null
  let httpStatus: number | null = null
  let errorText: string | null = null
  let finishReason: string | null = null
  let promptTokens: number | null = null
  let completionTokens: number | null = null
  let totalTokens: number | null = null
  let cachedPromptTokens: number | null = null
  let providerEstimatedCostUsd: number | null = null
  let text: string | null = null
  const requestedMaxTokens = args.maxTokens ?? 2048
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs)
  try {
    inferenceStartedAt = Date.now()
    // reasoning_effort is a DeepInfra-specific deployment setting in the current platform. Do not
    // leak it into arbitrary self-hosted/graduate OpenAI-compatible transports that may reject it.
    const reasoningEffort = provider === 'deepinfra' ? configuredReasoningEffort() : undefined
    const enforceJsonObject = strictJsonObjectRequested(args)
    const parsePenalty = (value: string | undefined, fallback: number): number => {
      const n = Number(value)
      return Number.isFinite(n) ? Math.max(0, Math.min(2, n)) : fallback
    }
    const frequencyPenalty = typeof args.frequencyPenalty === 'number' && Number.isFinite(args.frequencyPenalty)
      ? Math.max(0, Math.min(2, args.frequencyPenalty))
      : parsePenalty(process.env.COS_REASONER_FREQUENCY_PENALTY, 0.4)
    const presencePenalty = typeof args.presencePenalty === 'number' && Number.isFinite(args.presencePenalty)
      ? Math.max(0, Math.min(2, args.presencePenalty))
      : parsePenalty(process.env.COS_REASONER_PRESENCE_PENALTY, 0.3)
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(config.apiKey) },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        max_tokens: requestedMaxTokens,
        temperature: args.temperature ?? 0.2,
        frequency_penalty: frequencyPenalty,
        presence_penalty: presencePenalty,
        ...(enforceJsonObject ? { response_format: { type: 'json_object' } } : {}),
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
        messages: [
          { role: 'system', content: args.systemPrompt ?? 'You are a helpful AI assistant. Return valid JSON when explicitly requested.' },
          { role: 'user', content: args.prompt },
        ],
      }),
    })
    httpStatus = response.status
    if (!response.ok) {
      errorText = `HTTP ${response.status}: ${await response.text()}`
      console.error('localInference: HTTP error', response.status, errorText)
    } else {
      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>
        usage?: {
          prompt_tokens?: number
          completion_tokens?: number
          total_tokens?: number
          estimated_cost?: number
          prompt_tokens_details?: { cached_tokens?: number }
        }
      }
      const rawFinishReason = data.choices?.[0]?.finish_reason
      finishReason = typeof rawFinishReason === 'string' ? rawFinishReason : null
      promptTokens = nonNegativeNumber(data.usage?.prompt_tokens)
      completionTokens = nonNegativeNumber(data.usage?.completion_tokens)
      totalTokens = nonNegativeNumber(data.usage?.total_tokens)
      cachedPromptTokens = nonNegativeNumber(data.usage?.prompt_tokens_details?.cached_tokens)
      providerEstimatedCostUsd = nonNegativeNumber(data.usage?.estimated_cost)
      const content = data.choices?.[0]?.message?.content
      if (finishReason && finishReason !== 'stop') {
        console.warn('[cos-local-inference-incomplete]', {
          model: config.model,
          finishReason,
          requestedMaxTokens,
          completionTokens,
          contentLength: typeof content === 'string' ? content.length : 0,
        })
      }
      if (typeof content !== 'string' || content.length === 0) errorText = 'Local inference returned an empty response'
      text = typeof content === 'string' && content.length > 0 ? content : null
    }
  } catch (error) {
    errorText = error instanceof Error ? error.message : String(error)
    console.error('localInference: request failed', error)
    text = null
  } finally {
    clearTimeout(timeout)
    const latencyMs = Date.now() - startedAt
    const inferenceLatencyMs = inferenceStartedAt === null ? 0 : Math.max(0, Date.now() - inferenceStartedAt)
    const success = errorText === null && httpStatus !== null && httpStatus >= 200 && httpStatus < 300
    emitLocalInferenceTelemetry({
      at: new Date().toISOString(), requestId, provider, model: config.model,
      feature: usageContext.feature, routeOwner,
      graduateCandidateId: config.graduateCandidateId || null,
      graduateArtifactId: config.graduateArtifactId || null,
      fallbackFromOwned: input.fallbackFromOwned === true,
      latencyMs, startupLatencyMs: 0, inferenceLatencyMs,
      success, httpStatus, error: errorText, finishReason, requestedMaxTokens,
      promptTokens, completionTokens, totalTokens, cachedPromptTokens, providerEstimatedCostUsd,
    })
    await recordLocalInferenceUsage({
      requestId, provider, model: config.model, context: usageContext, routeOwner,
      graduateCandidateId: config.graduateCandidateId || null,
      graduateArtifactId: config.graduateArtifactId || null,
      graduateArtifactHash: config.graduateArtifactHash || null,
      fallbackFromOwned: input.fallbackFromOwned === true,
      promptTokens, completionTokens, totalTokens, cachedPromptTokens, providerEstimatedCostUsd,
      success, httpStatus, latencyMs, finishReason,
    }).catch(error => {
      console.warn('[provider-inference-usage-write-failed]', error instanceof Error ? error.message : String(error))
    })
  }
  return Object.freeze({
    text,
    finishReason,
    provider,
    model: config.model,
    routeOwner,
    graduateCandidateId: config.graduateCandidateId || null,
    graduateArtifactId: config.graduateArtifactId || null,
    graduateArtifactHash: config.graduateArtifactHash || null,
    fallbackFromOwned: input.fallbackFromOwned === true,
  })
}

function executionResult(attempt: AttemptResult): LocalModelExecutionResult | null {
  if (!attempt.text) return null
  return Object.freeze({
    text: attempt.text,
    provider: attempt.provider,
    model: attempt.model,
    routeOwner: attempt.routeOwner,
    graduateCandidateId: attempt.graduateCandidateId,
    graduateArtifactId: attempt.graduateArtifactId,
    graduateArtifactHash: attempt.graduateArtifactHash,
    fallbackFromOwned: attempt.fallbackFromOwned,
  })
}

/**
 * Platform-owned graduate models are preferred only after their registry row reaches `active` with
 * exact runtime health + activation evidence. The caller's pre-existing config remains a bounded
 * fallback so iTMounts can keep operating while a graduate runtime is unavailable. University
 * training/grading/evaluation contexts are excluded by the graduate selector and never self-grade.
 */
export async function callLocalModelDetailed(args: LocalModelCallArgs, config?: LocalInferenceConfig): Promise<LocalModelExecutionResult | null> {
  const baseConfig = config || localInferenceConfigFromEnv()
  const routingArgs: LocalModelCallArgs = args.usageContext ? args : { ...args, usageContext: inferredUsageContext(args) }
  const owned = await resolvePlatformOwnedInferenceRoute(routingArgs.usageContext).catch(error => {
    console.warn('[platform-owned-routing-resolution-failed]', error instanceof Error ? error.message : String(error))
    return null
  })

  if (owned) {
    const first = await callModelAttempt({ args: routingArgs, config: owned.config })
    if (first.finishReason === 'length') throw new Error(LOCAL_MODEL_OUTPUT_TRUNCATED)
    const ownedResult = executionResult(first)
    if (ownedResult) return ownedResult
    if (process.env.COS_GRADUATE_AI_ALLOW_BASE_FALLBACK === 'false') return null
    console.warn('[platform-owned-routing-fallback]', JSON.stringify({
      candidateId: owned.candidateId,
      artifactId: owned.artifactId,
      subjectId: owned.subjectId,
      graduateProvider: owned.runtimeProvider,
      fallbackProvider: providerFor(baseConfig),
    }))
    const fallback = await callModelAttempt({ args: routingArgs, config: baseConfig, fallbackFromOwned: true })
    if (fallback.finishReason === 'length') throw new Error(LOCAL_MODEL_OUTPUT_TRUNCATED)
    return executionResult(fallback)
  }

  const result = await callModelAttempt({ args: routingArgs, config: baseConfig })
  if (result.finishReason === 'length') throw new Error(LOCAL_MODEL_OUTPUT_TRUNCATED)
  return executionResult(result)
}

export async function callLocalModel(args: LocalModelCallArgs, config?: LocalInferenceConfig): Promise<string | null> {
  return (await callLocalModelDetailed(args, config))?.text ?? null
}

export async function checkLocalInferenceHealth(config = localInferenceConfigFromEnv()): Promise<{ ok: boolean; model: string; error?: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.min(config.timeoutMs, 5000))
  try {
    const response = await fetch(`${config.baseUrl}/models`, { headers: authHeaders(config.apiKey), signal: controller.signal })
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
