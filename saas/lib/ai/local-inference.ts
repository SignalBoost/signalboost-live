import { randomUUID } from 'node:crypto'
import { recordLocalInferenceUsage, type LocalInferenceUsageContext } from './localInferenceUsage.ts'

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
  /** Billing/routing attribution only. Never changes grading, authorization, or model output. */
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
  /** Actual compute provider. Keeps managed graduate endpoints from inheriting LOCAL_AI provider labels. */
  provider?: string
  /** Model/runtime ownership is separate from compute provider. */
  routeOwner?: 'itmounts' | 'external'
  graduateCandidateId?: string
  graduateArtifactId?: string
  graduateArtifactHash?: string
  fallbackFromOwned?: boolean
}

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

function directTextTransformation(args: LocalModelCallArgs): boolean {
  return String(args.usageContext?.feature || '').trim().toLowerCase() === 'direct_text_transformation'
}

function interactiveUserResponse(args: LocalModelCallArgs): boolean {
  const feature = String(args.usageContext?.feature || '').trim().toLowerCase()
  return feature === 'cos_interactive_answer' || feature === 'direct_text_transformation'
}

function interactiveReasoningEffort(args: LocalModelCallArgs): 'none' | 'low' | 'medium' | 'high' {
  if (directTextTransformation(args)) return 'none'
  const value = process.env.COS_INTERACTIVE_REASONING_EFFORT?.trim().toLowerCase()
  if (value === 'none' || value === 'low' || value === 'medium' || value === 'high') return value
  return 'low'
}

function interactiveModelTimeoutMs(args: LocalModelCallArgs, configTimeoutMs: number): number {
  const variable = directTextTransformation(args) ? 'COS_DIRECT_TEXT_TIMEOUT_MS' : 'COS_INTERACTIVE_MODEL_TIMEOUT_MS'
  const fallback = directTextTransformation(args) ? 12000 : 20000
  const configured = Number(process.env[variable] || String(fallback))
  const bounded = Number.isFinite(configured) ? Math.max(3000, Math.min(60000, configured)) : fallback
  return Math.min(configTimeoutMs, bounded)
}

function modelForRequest(args: LocalModelCallArgs, config: LocalInferenceConfig, provider: string): string {
  if (!directTextTransformation(args) || provider !== 'deepinfra') return config.model
  return (process.env.COS_DIRECT_TEXT_MODEL || 'zai-org/GLM-5.3-Flash').trim() || config.model
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

function shouldPersistUsage(provider: string, config: LocalInferenceConfig): boolean {
  // The durable table exists to measure managed-provider dependency and iTMounts graduate adoption.
  // Do not add a second network call to ordinary anonymous localhost/test inference.
  return provider === 'deepinfra'
    || provider === 'runpod'
    || config.routeOwner === 'itmounts'
    || Boolean(config.graduateCandidateId || config.graduateArtifactId || config.graduateArtifactHash)
}

function nonNegativeNumber(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function protectedIndependentEvaluation(args: LocalModelCallArgs): boolean {
  const feature = String(args.usageContext?.feature || '').toLowerCase()
  const purpose = String(args.usageContext?.purpose || '').toLowerCase()
  const system = String(args.systemPrompt || '').toLowerCase()
  return feature.includes('independent_exam')
    || feature.includes('controlled_comparison')
    || feature.includes('behavioral_robustness')
    || purpose.includes('independent_assessment')
    || purpose.includes('independent_evaluation')
    || /host-controlled cos university .*exam|independent .*exam|graduation capstone/.test(system)
}

function eligibleForRunpodPrimary(args: LocalModelCallArgs, config: LocalInferenceConfig): boolean {
  if (process.env.RUNPOD_PRIMARY_ENABLED?.trim().toLowerCase() === 'false') return false
  // Direct user-supplied text transformations are latency-sensitive interactive work. They must
  // use the configured managed open-model transport directly rather than spending the browser
  // response budget on an owned RunPod attempt that may return an empty/truncated completion.
  const feature = String(args.usageContext?.feature || '').trim().toLowerCase()
  if (interactiveUserResponse(args)) return false
  if (providerFor(config) === 'runpod') return false
  if (config.fallbackFromOwned === true) return false
  if (protectedIndependentEvaluation(args)) return false
  return true
}

async function callConfiguredModel(args: LocalModelCallArgs, config: LocalInferenceConfig): Promise<string | null> {
  const startedAt = Date.now()
  const requestId = randomUUID()
  const provider = providerFor(config)
  const model = modelForRequest(args, config, provider)
  const routeOwner = routeOwnerFor(config)
  const usageContext: LocalInferenceUsageContext = args.usageContext || { feature: 'unattributed_local_inference' }
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
  const timeoutMs = interactiveUserResponse(args) ? interactiveModelTimeoutMs(args, config.timeoutMs) : config.timeoutMs
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    inferenceStartedAt = Date.now()
    // LOCAL_AI_REASONING_EFFORT is a property of the current DeepInfra deployment. Generic graduate
    // and RunPod transports may reject that vendor-specific field, so do not leak it outside DeepInfra.
    const reasoningEffort = provider === 'deepinfra'
      ? (interactiveUserResponse(args) ? interactiveReasoningEffort(args) : configuredReasoningEffort())
      : undefined
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
        model,
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
          model,
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
      at: new Date().toISOString(), requestId, provider, model,
      feature: usageContext.feature, routeOwner,
      graduateCandidateId: config.graduateCandidateId || null,
      graduateArtifactId: config.graduateArtifactId || null,
      fallbackFromOwned: config.fallbackFromOwned === true,
      latencyMs, startupLatencyMs: 0, inferenceLatencyMs,
      success, httpStatus, error: errorText, finishReason, requestedMaxTokens,
      promptTokens, completionTokens, totalTokens, cachedPromptTokens, providerEstimatedCostUsd,
    })
    if (shouldPersistUsage(provider, config)) {
      await recordLocalInferenceUsage({
        requestId, provider, model, context: usageContext,
        routeOwner,
        graduateCandidateId: config.graduateCandidateId || null,
        graduateArtifactId: config.graduateArtifactId || null,
        graduateArtifactHash: config.graduateArtifactHash || null,
        fallbackFromOwned: config.fallbackFromOwned === true,
        promptTokens, completionTokens, totalTokens, cachedPromptTokens, providerEstimatedCostUsd,
        success, httpStatus, latencyMs, finishReason,
      }).catch(error => {
        console.warn('[provider-inference-usage-write-failed]', error instanceof Error ? error.message : String(error))
      })
    }
  }

  if (finishReason === 'length') throw new Error(LOCAL_MODEL_OUTPUT_TRUNCATED)
  return text
}

/**
 * Platform text inference policy: active graduate routing (when callers provide it) remains above
 * this seam; otherwise ordinary iTMounts text inference prefers the verified RunPod primary and uses
 * the configured LOCAL_AI/DeepInfra transport only as a bounded fallback. Independent University
 * evaluation is intentionally excluded so the learner cannot silently change its evaluator runtime.
 */
export async function callLocalModel(args: LocalModelCallArgs, config = localInferenceConfigFromEnv()): Promise<string | null> {
  if (!eligibleForRunpodPrimary(args, config)) return callConfiguredModel(args, config)

  let ownedAttempted = false
  try {
    const primary = await import('./cos/runpodPrimaryInference.ts')
    if (primary.runpodPrimaryEnabled()) {
      ownedAttempted = true
      const runpodConfig = await primary.resolveReadyRunpodPrimaryConfig('reasoner')
      if (runpodConfig) {
        const text = await callConfiguredModel(args, runpodConfig)
        if (text?.trim()) return text
      }
    }
  } catch (error) {
    console.warn('[runpod-primary-routing] primary unavailable; DeepInfra fallback remains bounded', JSON.stringify({
      feature: args.usageContext?.feature || 'unattributed_local_inference',
      reason: error instanceof Error ? error.message : String(error),
    }))
  }

  return callConfiguredModel(args, ownedAttempted ? { ...config, fallbackFromOwned: true } : config)
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
