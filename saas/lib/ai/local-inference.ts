// saas/lib/ai/local-inference.ts
import { randomUUID } from 'node:crypto'
import { recordLocalInferenceUsage, type LocalInferenceUsageContext } from './localInferenceUsage.ts'
import { turnDeadlineRemainingMs } from './cos/cosTurnBudget.ts'
import { planContextWindow } from './context-window-manager.ts'
import { modelCapabilityProfileForId, requireModelCapability, type ModelTransportProtocol } from './modelCapabilityRegistry.ts'
import { tryAssignedPlatformModelTurn } from './modelRuntimeAssignment.ts'
import {
  currentHarnessExecutionContext,
  harnessDeadlineRemainingMs,
  reserveHarnessProviderCostUsd,
} from '../../platform-harness/runtime/execution-context.ts'

export type LocalModelToolDefinition = Readonly<{
  type: 'function'
  function: Readonly<{
    name: string
    description?: string
    parameters: Readonly<Record<string, unknown>>
  }>
}>

export type LocalModelToolCall = Readonly<{
  id: string
  type: 'function'
  function: Readonly<{ name: string; arguments: string }>
}>

export type LocalModelChatMessage = Readonly<{
  role: 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_call_id?: string
  tool_calls?: readonly LocalModelToolCall[]
}>

export type LocalModelToolChoice = 'auto' | 'none' | Readonly<{
  type: 'function'
  function: Readonly<{ name: string }>
}>

export type LocalModelTurnResult = Readonly<{
  content: string | null
  toolCalls: readonly LocalModelToolCall[]
  finishReason: string | null
  provider: string
  model: string
}>

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
  /** Force thinking-capable OpenAI-compatible providers to return a direct answer. */
  disableThinking?: boolean
  /** Caller-specific hard transport deadline. The lower of this value and config.timeoutMs wins. */
  timeoutMs?: number
  /** Disable configured-model fallback after an owned-primary failure for latency-critical calls. */
  allowConfiguredFallback?: boolean
  /** Return non-empty text on finish_reason=length so a caller with a dedicated salvage parser can recover it. */
  allowTruncatedText?: boolean
  /** Skip durable usage persistence when the caller must avoid a database dependency. */
  persistUsage?: boolean
  /**
   * Conservative upper bound reserved before a paid managed-provider call begins.
   * Required when DeepInfra executes inside a Harness host-ingress run with maxCostUsd.
   */
  maxEstimatedCostUsd?: number
  /** OpenAI-compatible function tools exposed to the model. Host policy still owns authorization. */
  tools?: readonly LocalModelToolDefinition[]
  /** Let the model choose zero or more tools, suppress tools, or force one exact function. */
  toolChoice?: LocalModelToolChoice
  /** Prior non-system messages for a multi-step model/tool loop. The host-owned system prompt is prepended. */
  messages?: readonly LocalModelChatMessage[]
}

/**
 * Thrown when the provider reports finish_reason 'length'. Partial content is discarded by default:
 * only callers that explicitly opt into truncated-text salvage may receive it for dedicated parsing.
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
  /** Physical serving-window override for this exact deployed model/runtime. */
  contextWindowTokens?: number
  /** Optional platform registry identity for the configured runtime model. */
  modelProfileKey?: string | null
  /** Canonical transport actually used by this inference seam. */
  transportProtocol?: ModelTransportProtocol | 'legacy_openai_compatible'
}

export interface LocalInferenceTelemetry {
  at: string
  requestId: string
  /** Canonical distributed correlation identity. Harness-bound work uses the HarnessRun id. */
  traceId: string
  harnessRunId: string | null
  parentHarnessRunId: string | null
  provider: string
  model: string
  modelProfileKey: string | null
  transportProtocol: ModelTransportProtocol | 'legacy_openai_compatible'
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

function interactiveAuthoring(args: LocalModelCallArgs): boolean {
  return String(args.usageContext?.feature || '').trim().toLowerCase() === 'cos_interactive_authoring'
}

function simpleKnowledgeResponse(args: LocalModelCallArgs): boolean {
  return String(args.usageContext?.feature || '').trim().toLowerCase() === 'cos_simple_knowledge'
}

function interactiveTravelPlan(args: LocalModelCallArgs): boolean {
  return String(args.usageContext?.feature || '').trim().toLowerCase() === 'cos_interactive_travel_plan'
}

function interactiveUserResponse(args: LocalModelCallArgs): boolean {
  const feature = String(args.usageContext?.feature || '').trim().toLowerCase()
  return feature === 'cos_interactive_answer'
    || feature === 'cos_interactive_authoring'
    || feature === 'direct_text_transformation'
    || feature === 'cos_simple_knowledge'
    || feature === 'cos_interactive_travel_plan'
}

function freshGroundedTask(args: LocalModelCallArgs): boolean {
  return String(args.usageContext?.feature || '').trim().toLowerCase() === 'cos_fresh_grounded_task'
}

const FRESH_GROUNDED_RUNPOD_ATTEMPT_MS = 16_000

function interactiveReasoningEffort(args: LocalModelCallArgs): 'none' | 'low' | 'medium' | 'high' {
  if (directTextTransformation(args) || interactiveAuthoring(args) || interactiveTravelPlan(args)) return 'none'
  const value = process.env.COS_INTERACTIVE_REASONING_EFFORT?.trim().toLowerCase()
  if (value === 'none' || value === 'low' || value === 'medium' || value === 'high') return value
  return 'low'
}

function runpodSmallBudgetThinkingOff(args: LocalModelCallArgs, provider: string): boolean {
  const maxTokens = Number(args.maxTokens)
  return provider === 'runpod' && Number.isFinite(maxTokens) && maxTokens > 0 && maxTokens <= 1024
}

function isEmptyThinkingTruncation(error: unknown): boolean {
  return error instanceof Error
    && error.message === LOCAL_MODEL_OUTPUT_TRUNCATED
    && (error as Error & { emptyContent?: boolean }).emptyContent === true
}

function interactiveModelTimeoutMs(args: LocalModelCallArgs, configTimeoutMs: number): number {
  const directEdit = directTextTransformation(args)
  const authoring = interactiveAuthoring(args)
  const simpleKnowledge = simpleKnowledgeResponse(args)
  const travelPlan = interactiveTravelPlan(args)
  const variable = directEdit
    ? 'COS_DIRECT_TEXT_TIMEOUT_MS'
    : authoring
      ? 'COS_INTERACTIVE_AUTHORING_TIMEOUT_MS'
      : simpleKnowledge
        ? 'COS_SIMPLE_KNOWLEDGE_TIMEOUT_MS'
        : travelPlan
          ? 'COS_INTERACTIVE_TRAVEL_TIMEOUT_MS'
          : 'COS_INTERACTIVE_MODEL_TIMEOUT_MS'
  const fallback = directEdit ? 12000 : authoring ? 20000 : simpleKnowledge ? 7000 : travelPlan ? 18000 : 20000
  const configured = Number(process.env[variable] || String(fallback))
  const bounded = Number.isFinite(configured) ? Math.max(3000, Math.min(60000, configured)) : fallback
  return Math.min(configTimeoutMs, bounded)
}

function modelForRequest(args: LocalModelCallArgs, config: LocalInferenceConfig, provider: string): string {
  if (provider !== 'deepinfra') return config.model
  if (directTextTransformation(args)) {
    return (process.env.COS_DIRECT_TEXT_MODEL || 'zai-org/GLM-5.3-Flash').trim() || config.model
  }
  // AUTHORING LANE USES THE CONFIGURED MODEL (2026-09-27). Production evidence (provider_inference_usage,
  // 02:13 and 02:14 ET): every cos_interactive_authoring call to zai-org/GLM-5.3-Flash ran the full 15001ms
  // with no HTTP status, so COS's main answer never arrived and each question fell through to the slow
  // RunPod rescue (~38s). The configured DeepInfra model answered the same turns' other calls in ~1.8s.
  // Writing questions keep their own lane (reasoning off, own timeout) but no longer switch models.
  if (simpleKnowledgeResponse(args)) {
    return (process.env.COS_SIMPLE_KNOWLEDGE_MODEL || 'deepseek-ai/DeepSeek-V4-Flash').trim() || config.model
  }
  // TRAVEL LANE USES THE CONFIGURED MODEL (2026-09-27). Production evidence (cos-latency-stage, Concierge Polish
  // itinerary 14:24 ET): primary:travel_planner took 26,515ms = both attempts running to their 16s + 10s limits,
  // after which Concierge sent the canned itinerary backstop. The retry model (GLM-5.3-Flash) had already been
  // verified to never reply within 15s on this account; the owner channel answered the same request well on the
  // configured model. Both travel attempts now use it (COS_INTERACTIVE_TRAVEL_MODEL / _RETRY_MODEL no longer apply).
  if (interactiveTravelPlan(args)) return config.model
  return config.model
}

/** Align a caller's explicit strict-JSON contract with the transport instead of relying on prose alone. */
function strictJsonObjectRequested(args: LocalModelCallArgs): boolean {
  if (args.jsonObject === true) return true
  return /\bReturn ONLY strict JSON\b/i.test(String(args.systemPrompt ?? ''))
}

export type ModelRuntimeBinding = Readonly<{
  model: string
  profileKey: string | null
  transportProtocol: ModelTransportProtocol | 'legacy_openai_compatible'
  registered: boolean
}>

export function resolveModelRuntimeBinding(
  model: string,
  options: { requireRegistered?: boolean } = {},
): ModelRuntimeBinding {
  const normalized = String(model || '').trim()
  if (!normalized) throw new Error('platform_runtime_model_required')
  const profile = modelCapabilityProfileForId(normalized)
  if (!profile) {
    if (options.requireRegistered === true) throw new Error(`platform_runtime_model_not_registered:${normalized}`)
    return Object.freeze({
      model: normalized,
      profileKey: null,
      transportProtocol: 'legacy_openai_compatible' as const,
      registered: false,
    })
  }
  requireModelCapability(profile, 'inference', 'chatCompletion')
  const transportProtocol = profile.transportProtocols.includes('openai_compatible')
    ? 'openai_compatible' as const
    : null
  if (!transportProtocol) {
    throw new Error(`platform_model_transport_not_supported_by_local_inference:${profile.key}`)
  }
  return Object.freeze({
    model: normalized,
    profileKey: profile.key,
    transportProtocol,
    registered: true,
  })
}
export function localInferenceConfigFromEnv(): LocalInferenceConfig {
  const baseUrl = normalizeBaseUrl(process.env.LOCAL_AI_BASE_URL || 'http://ai-brain:8000/v1')
  const model = (process.env.LOCAL_AI_MODEL || '').trim()
  if (!model) throw new Error('LOCAL_AI_MODEL is required when local inference is enabled')
  const binding = resolveModelRuntimeBinding(model, { requireRegistered: process.env.ITMOUNTS_MODEL_REGISTRY_REQUIRE_REGISTERED?.trim().toLowerCase() === 'true' })
  const timeoutMs = Number(process.env.LOCAL_AI_TIMEOUT_MS || '120000')
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 600000) throw new Error('LOCAL_AI_TIMEOUT_MS must be between 1000 and 600000')
  return { baseUrl, model, apiKey: process.env.LOCAL_AI_API_KEY?.trim() || undefined, timeoutMs, modelProfileKey: binding.profileKey, transportProtocol: binding.transportProtocol }
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

/**
 * A transport failure with no HTTP response (thrown before or during fetch) used to persist as
 * `success=false, http_status=null, finish_reason=null` — no reason at all. On 2026-09-27 the only active
 * graduate failed 66/66 live calls this way (some in 2-5 ms) and the cause existed only in a Vercel log line.
 * Persist a short, credential-free failure class in `finish_reason` so the owner can query it. Only the error
 * name, a bounded message prefix and the low-level cause code are kept: no headers, prompts, bodies or keys.
 */
export function transportFailureTag(error: unknown): string {
  const err = error instanceof Error ? error : new Error(String(error))
  const cause = (err as Error & { cause?: { code?: unknown; name?: unknown } }).cause
  const causeCode = cause && typeof cause === 'object'
    ? String(cause.code || cause.name || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 24)
    : ''
  const message = String(err.message || '')
    .replace(/bearer\s+\S+/gi, 'bearer ***')
    .replace(/(key|token|secret|password)=\S+/gi, '$1=***')
    .replace(/[^A-Za-z0-9 _.:/-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48)
  const name = String(err.name || 'Error').replace(/[^A-Za-z0-9_]/g, '').slice(0, 20)
  return ['error', name, message, causeCode].filter(Boolean).join(':').slice(0, 80)
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

async function callConfiguredModelTurn(args: LocalModelCallArgs, config: LocalInferenceConfig): Promise<LocalModelTurnResult | null> {
  const startedAt = Date.now()
  const requestId = randomUUID()
  const provider = providerFor(config)
  const model = modelForRequest(args, config, provider)
  const runtimeBinding = resolveModelRuntimeBinding(model, { requireRegistered: process.env.ITMOUNTS_MODEL_REGISTRY_REQUIRE_REGISTERED?.trim().toLowerCase() === 'true' })
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
  let fatalGovernanceError: Error | null = null
  let transportFailure: string | null = null
  let toolCalls: readonly LocalModelToolCall[] = Object.freeze([])
  const requestedMaxTokens = args.maxTokens ?? 2048
  const controller = new AbortController()
  const harnessContext = currentHarnessExecutionContext()
  const abortFromHarness = () => controller.abort()
  if (harnessContext?.signal.aborted) controller.abort()
  else harnessContext?.signal.addEventListener('abort', abortFromHarness, { once: true })

  const baseTimeoutMs = interactiveUserResponse(args) ? interactiveModelTimeoutMs(args, config.timeoutMs) : config.timeoutMs
  const callerTimeoutMs = Number(args.timeoutMs)
  const callerBoundTimeoutMs = Number.isFinite(callerTimeoutMs) && callerTimeoutMs > 0
    ? Math.max(250, Math.min(baseTimeoutMs, callerTimeoutMs))
    : baseTimeoutMs
  // COS's whole-turn budget and the outer Platform Harness are independent ceilings. A model call
  // receives the strictest remaining bound and the Harness AbortSignal, so RunPod/DeepInfra/fallback
  // transport cannot continue on a fresh provider clock after its owning HarnessRun expires.
  const remainingBounds = [turnDeadlineRemainingMs(), harnessDeadlineRemainingMs()]
    .filter((value): value is number => value !== null)
  const outerRemainingMs = remainingBounds.length ? Math.min(...remainingBounds) : null
  const timeoutMs = outerRemainingMs === null
    ? callerBoundTimeoutMs
    : Math.max(1, Math.min(callerBoundTimeoutMs, outerRemainingMs))
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    if (provider === 'deepinfra' && harnessContext?.providerCostLedger) {
      const reservation = Number(args.maxEstimatedCostUsd)
      if (!Number.isFinite(reservation) || reservation <= 0) {
        throw new Error('deepinfra_harness_cost_reservation_required')
      }
      reserveHarnessProviderCostUsd(reservation)
    }
    inferenceStartedAt = Date.now()
    // Independent University scoring needs a compact verdict rather than model scratch work.
    // Preserve the evaluator's one-call, strict-JSON contract even when the general reasoner is
    // configured for deeper reasoning or prose-oriented repetition penalties.
    const enforceJsonObject = strictJsonObjectRequested(args) && !(args.tools?.length)
    const independentEvaluation = protectedIndependentEvaluation(args)
    const thinkingOff = args.disableThinking === true || runpodSmallBudgetThinkingOff(args, provider)
    const reasoningEffort = thinkingOff
      ? 'none'
      : provider === 'deepinfra'
        ? (independentEvaluation ? 'none' : interactiveUserResponse(args) ? interactiveReasoningEffort(args) : configuredReasoningEffort())
        : undefined
    const parsePenalty = (value: string | undefined, fallback: number): number => {
      const n = Number(value)
      return Number.isFinite(n) ? Math.max(0, Math.min(2, n)) : fallback
    }
    const frequencyPenalty = independentEvaluation && enforceJsonObject
      ? 0
      : typeof args.frequencyPenalty === 'number' && Number.isFinite(args.frequencyPenalty)
        ? Math.max(0, Math.min(2, args.frequencyPenalty))
        : parsePenalty(process.env.COS_REASONER_FREQUENCY_PENALTY, 0.4)
    const presencePenalty = independentEvaluation && enforceJsonObject
      ? 0
      : typeof args.presencePenalty === 'number' && Number.isFinite(args.presencePenalty)
        ? Math.max(0, Math.min(2, args.presencePenalty))
        : parsePenalty(process.env.COS_REASONER_PRESENCE_PENALTY, 0.3)
    const baseSystemPrompt = args.systemPrompt ?? 'You are a helpful AI assistant. Return valid JSON when explicitly requested.'
    const qwenThinkingOff = thinkingOff && /qwen/i.test(model)
    const governedSystemPrompt = independentEvaluation && enforceJsonObject
      ? `${baseSystemPrompt} Output exactly the requested JSON schema. Do not add explanations, rationale, analysis, prose, repeated inputs, or extra keys.`
      : baseSystemPrompt
    const systemPrompt = qwenThinkingOff ? `${governedSystemPrompt} /no_think` : governedSystemPrompt
    const rawMessages: readonly LocalModelChatMessage[] = args.messages?.length
      ? args.messages
      : [{ role: 'user' as const, content: args.prompt }]
    const contextPlan = planContextWindow({
      model,
      provider,
      contextWindowTokens: config.contextWindowTokens,
      systemPrompt,
      messages: rawMessages,
      requestedOutputTokens: requestedMaxTokens,
      minimumOutputTokens: Math.min(256, requestedMaxTokens),
    })
    if (contextPlan.compacted) {
      console.info('[context-window-plan]', JSON.stringify({
        feature: usageContext.feature,
        provider,
        model,
        contextWindowTokens: contextPlan.contextWindowTokens,
        estimatedPromptTokens: contextPlan.estimatedPromptTokens,
        requestedMaxTokens,
        effectiveMaxTokens: contextPlan.maxOutputTokens,
        droppedMessages: contextPlan.droppedMessages,
        truncatedCharacters: contextPlan.truncatedCharacters,
      }))
    }
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(config.apiKey) },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        max_tokens: contextPlan.maxOutputTokens,
        temperature: args.temperature ?? 0.2,
        frequency_penalty: frequencyPenalty,
        presence_penalty: presencePenalty,
        ...(enforceJsonObject ? { response_format: { type: 'json_object' } } : {}),
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
        ...(qwenThinkingOff ? { think: false, chat_template_kwargs: { enable_thinking: false } } : {}),
        ...(args.tools?.length ? { tools: args.tools, tool_choice: args.toolChoice ?? 'auto' } : {}),
        messages: [
          { role: 'system', content: systemPrompt },
          ...contextPlan.messages,
        ],
      }),
    })
    httpStatus = response.status
    if (!response.ok) {
      errorText = `HTTP ${response.status}: ${await response.text()}`
      console.error('localInference: HTTP error', response.status, errorText)
    } else {
      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string | null; tool_calls?: Array<{ id?: string; type?: string; function?: { name?: string; arguments?: string } }> }; finish_reason?: string }>
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
      const message = data.choices?.[0]?.message
      const content = message?.content
      toolCalls = Object.freeze((message?.tool_calls ?? []).flatMap(call => {
        const id = String(call?.id || '').trim()
        const name = String(call?.function?.name || '').trim()
        const argumentsText = typeof call?.function?.arguments === 'string' ? call.function.arguments : ''
        return id && name
          ? [Object.freeze({ id, type: 'function' as const, function: Object.freeze({ name, arguments: argumentsText }) })]
          : []
      }))
      if (finishReason && finishReason !== 'stop' && finishReason !== 'tool_calls') {
        console.warn('[cos-local-inference-incomplete]', {
          model,
          finishReason,
          requestedMaxTokens,
          completionTokens,
          contentLength: typeof content === 'string' ? content.length : 0,
        })
      }
      if ((typeof content !== 'string' || content.length === 0) && toolCalls.length === 0) errorText = 'Local inference returned an empty response'
      text = typeof content === 'string' && content.length > 0 ? content : null
    }
  } catch (error) {
    errorText = error instanceof Error ? error.message : String(error)
    if (httpStatus === null) transportFailure = transportFailureTag(error)
    if (
      error instanceof Error
      && (
        error.message === 'deepinfra_harness_cost_reservation_required'
        || error.message.startsWith('harness_provider_cost_')
      )
    ) fatalGovernanceError = error
    console.error('localInference: request failed', error)
    text = null
  } finally {
    clearTimeout(timeout)
    harnessContext?.signal.removeEventListener('abort', abortFromHarness)
    const latencyMs = Date.now() - startedAt
    const inferenceLatencyMs = inferenceStartedAt === null ? 0 : Math.max(0, Date.now() - inferenceStartedAt)
    const success = errorText === null && httpStatus !== null && httpStatus >= 200 && httpStatus < 300
    const traceId = harnessContext?.manifest.runId || requestId
    emitLocalInferenceTelemetry({
      at: new Date().toISOString(), requestId,
      traceId,
      harnessRunId: harnessContext?.manifest.runId || null,
      parentHarnessRunId: harnessContext?.manifest.parent?.runId || null,
      provider, model,
      modelProfileKey: runtimeBinding.profileKey,
      transportProtocol: runtimeBinding.transportProtocol,
      feature: usageContext.feature, routeOwner,
      graduateCandidateId: config.graduateCandidateId || null,
      graduateArtifactId: config.graduateArtifactId || null,
      fallbackFromOwned: config.fallbackFromOwned === true,
      latencyMs, startupLatencyMs: 0, inferenceLatencyMs,
      success, httpStatus, error: errorText, finishReason, requestedMaxTokens,
      promptTokens, completionTokens, totalTokens, cachedPromptTokens, providerEstimatedCostUsd,
    })
    if (args.persistUsage !== false && !harnessContext?.signal.aborted && shouldPersistUsage(provider, config)) {
      await recordLocalInferenceUsage({
        requestId, provider, model, context: usageContext,
        routeOwner,
        graduateCandidateId: config.graduateCandidateId || null,
        graduateArtifactId: config.graduateArtifactId || null,
        graduateArtifactHash: config.graduateArtifactHash || null,
        fallbackFromOwned: config.fallbackFromOwned === true,
        promptTokens, completionTokens, totalTokens, cachedPromptTokens, providerEstimatedCostUsd,
        success, httpStatus, latencyMs, finishReason: finishReason ?? transportFailure,
      }).catch(error => {
        console.warn('[provider-inference-usage-write-failed]', error instanceof Error ? error.message : String(error))
      })
    }
  }

  if (fatalGovernanceError) throw fatalGovernanceError

  if (finishReason === 'length') {
    if (args.allowTruncatedText === true && text?.trim()) {
      console.warn('[cos-local-inference-truncated-released]', JSON.stringify({
        feature: args.usageContext?.feature || 'unattributed_local_inference',
        requestedMaxTokens,
        completionTokens,
        contentLength: text.length,
      }))
      return Object.freeze({ content: text, toolCalls, finishReason, provider, model })
    }
    const error = new Error(LOCAL_MODEL_OUTPUT_TRUNCATED) as Error & { emptyContent?: boolean }
    error.emptyContent = !text
    throw error
  }
  if (errorText !== null || (text === null && toolCalls.length === 0)) return null
  return Object.freeze({ content: text, toolCalls, finishReason, provider, model })
}

async function callConfiguredModel(args: LocalModelCallArgs, config: LocalInferenceConfig): Promise<string | null> {
  return (await callConfiguredModelTurn(args, config))?.content ?? null
}

/**
 * Platform text inference policy: active graduate routing (when callers provide it) remains above
 * this seam; otherwise ordinary iTMounts text inference prefers the verified RunPod primary and uses
 * the configured LOCAL_AI/DeepInfra transport only as a bounded fallback. Independent University
 * evaluation is intentionally excluded so the learner cannot silently change its evaluator runtime.
 */
export async function callLocalModelTurn(args: LocalModelCallArgs, config?: LocalInferenceConfig): Promise<LocalModelTurnResult | null> {
  const feature = String(args.usageContext?.feature || '').trim().toLowerCase()
  if (config === undefined && !protectedIndependentEvaluation(args) && !feature.startsWith('university_')) {
    const assigned = await tryAssignedPlatformModelTurn(args)
    if (assigned.attempted) return assigned.result
  }

  const effectiveConfig = config ?? localInferenceConfigFromEnv()
  if (!eligibleForRunpodPrimary(args, effectiveConfig)) return callConfiguredModelTurn(args, effectiveConfig)

  let ownedAttempted = false
  try {
    const primary = await import('./cos/runpodPrimaryInference.ts')
    if (primary.runpodPrimaryEnabled()) {
      ownedAttempted = true
      const runpodConfig = await primary.resolveReadyRunpodPrimaryConfig('reasoner')
      if (runpodConfig) {
        try {
          const runpodArgs = freshGroundedTask(args)
            ? {
                ...args,
                timeoutMs: Math.min(
                  FRESH_GROUNDED_RUNPOD_ATTEMPT_MS,
                  Number.isFinite(Number(args.timeoutMs)) && Number(args.timeoutMs) > 0
                    ? Number(args.timeoutMs)
                    : FRESH_GROUNDED_RUNPOD_ATTEMPT_MS,
                ),
              }
            : args
          const turn = await callConfiguredModelTurn(runpodArgs, runpodConfig)
          if (turn && (turn.content?.trim() || turn.toolCalls.length)) return turn
        } catch (error) {
          if (!isEmptyThinkingTruncation(error) || args.disableThinking === true || runpodSmallBudgetThinkingOff(args, 'runpod')) throw error
          console.warn('[runpod-primary-thinking-retry]', JSON.stringify({
            feature: args.usageContext?.feature || 'unattributed_local_inference',
            reason: 'empty_hidden_reasoning_exhausted_token_budget',
          }))
          const retryArgs = freshGroundedTask(args)
            ? { ...args, disableThinking: true, timeoutMs: FRESH_GROUNDED_RUNPOD_ATTEMPT_MS }
            : { ...args, disableThinking: true }
          const turn = await callConfiguredModelTurn(retryArgs, runpodConfig)
          if (turn && (turn.content?.trim() || turn.toolCalls.length)) return turn
        }
      }
    }
  } catch (error) {
    console.warn('[runpod-primary-routing] primary unavailable; DeepInfra fallback remains bounded', JSON.stringify({
      feature: args.usageContext?.feature || 'unattributed_local_inference',
      reason: error instanceof Error ? error.message : String(error),
    }))
  }

  if (args.allowConfiguredFallback === false && ownedAttempted) return null
  return callConfiguredModelTurn(args, ownedAttempted ? { ...effectiveConfig, fallbackFromOwned: true } : effectiveConfig)
}

export async function callLocalModel(args: LocalModelCallArgs, config?: LocalInferenceConfig): Promise<string | null> {
  return (await callLocalModelTurn(args, config))?.content ?? null
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
