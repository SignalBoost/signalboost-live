// saas/lib/cos/aiPort.ts
// Injected model-access seam for COS generators. Text requests enter the shared COS gateway so
// existing Portables gain durable reuse and single-flight protection without owning provider logic.
import { callLocalModel, localInferenceConfigFromEnv } from '@/lib/ai/local-inference'
import { callProviderModel, type ModelProvider } from '@/lib/ai/providerRouter'
import { callCosText } from '@/lib/cos/textGateway'
import { requireBuilderCodingModel } from '@/lib/ai/cos/platformIdentityContext'

export interface CosAiPort {
  generate(input: { prompt: string; systemPrompt?: string; maxTokens?: number; modelPreference?: ModelProvider }): Promise<string>
}

export type ExternalTeacherProvider = Exclude<ModelProvider, 'local'>

/**
 * Execution path: no default, no substitution. An unset DEEPINFRA_BUILDER_MODEL throws
 * `builder_model_not_configured` rather than quietly sending a guessed model to the provider.
 */
export function builderCodingModelFromEnv(): string {
  return requireBuilderCodingModel()
}

function requireText(result: string | null, provider: string): string {
  if (!result) throw new Error(`${provider} AI provider returned no text`)
  return result
}

export function createPlatformAiPort(): CosAiPort {
  return {
    generate: async (input) => requireText(await callCosText({ ...input, taskId: 'cos-portable-text' }), 'platform'),
  }
}

/**
 * Coding-specialist port for Builder and Platform Engineer.
 *
 * Keep coding work on the approved local/DeepInfra inference boundary, but select the coding model
 * independently from the general COS reasoner. This intentionally bypasses shared answer caching and
 * external-provider fallback: Builder must reason from the current workspace/repository evidence and
 * prove its result with tools rather than reuse a prior prose answer. The local inference layer still
 * records the exact selected model in its telemetry.
 */
export function createBuilderCodingAiPort(): CosAiPort {
  return {
    generate: async (input) => {
      const config = localInferenceConfigFromEnv()
      return requireText(await callLocalModel({
        prompt: input.prompt,
        systemPrompt: input.systemPrompt,
        maxTokens: input.maxTokens,
        // Source code is legitimately repetitive. The prose reasoner's repetition penalties
        // accumulate over a generated file and push the sampler off valid syntax, so coding
        // calls generate unpenalised.
        frequencyPenalty: 0,
        presencePenalty: 0,
        // The control object must be JSON. Provider-enforced JSON mode removes the class of
        // failures where source quoting or escaping breaks the surrounding envelope.
        jsonObject: true,
      }, {
        ...config,
        model: builderCodingModelFromEnv(),
      }), 'builder coding')
    },
  }
}

export function createLocalApplianceAiPort(): CosAiPort {
  return {
    generate: async (input) => requireText(await callProviderModel({ ...input, modelPreference: 'local' }), 'local appliance'),
  }
}

/** SignalBoost-host adapter for optional frontier teacher/evaluator work. */
export function createExternalTeacherAiPort(provider: ExternalTeacherProvider): CosAiPort {
  return {
    generate: async (input) => requireText(
      await callProviderModel({ ...input, modelPreference: provider }),
      `external teacher ${provider}`,
    ),
  }
}

export type CosImageResult = { ok: boolean; b64?: string; url?: string; error?: string }

export interface CosImagePort {
  generate(input: { prompt: string; size?: string }): Promise<CosImageResult>
}

export function createPlatformImagePort(): CosImagePort {
  return {
    async generate({ prompt, size = '1024x1024' }): Promise<CosImageResult> {
      // Visual creation uses only the approved COS managed runtime. It must never select an
      // ambient OpenAI key or any other external-provider fallback.
      const key = process.env.LOCAL_AI_API_KEY?.trim()
      const baseUrl = (process.env.LOCAL_AI_BASE_URL || '').replace(/\/$/, '')
      if (!key || !/^https:\/\/api\.deepinfra\.com\/v1\/openai$/i.test(baseUrl)) {
        return { ok: false, error: 'Approved visual runtime is not configured.' }
      }

      try {
        const response = await fetch('https://api.deepinfra.com/v1/openai/images/generations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({ model: 'black-forest-labs/FLUX-2-klein-4b', prompt, size, n: 1 }),
        })
        const raw = await response.text()
        let data: { data?: Array<{ b64_json?: string; url?: string }>; error?: { message?: string } | string; detail?: string | { message?: string }; message?: string } = {}
        try { data = JSON.parse(raw) } catch { /* provider returned a non-JSON error */ }
        if (!response.ok) {
          const detail = typeof data.error === 'string'
            ? data.error
            : data.error?.message || (typeof data.detail === 'string' ? data.detail : data.detail?.message) || data.message || raw.slice(0, 240)
          console.warn('[concierge-visual-runtime-failure]', JSON.stringify({ status: response.status, detail: detail || 'no_provider_error_detail' }))
          return { ok: false, error: detail || `Approved visual runtime failed (HTTP ${response.status}).` }
        }
        const first = data.data?.[0]
        return first?.b64_json ? { ok: true, b64: first.b64_json, url: first.url } : { ok: false, error: 'Creative image provider returned no image.' }
      } catch (e: any) {
        return { ok: false, error: e?.message || 'Creative image generation failed.' }
      }
    },
  }
}
// saas/lib/ai/local-inference.ts

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
}

/**
 * Thrown when the provider reports finish_reason 'length'. The partial content is never returned:
 * a half-written control object or source file must not be mistaken for a finished answer.
 */
export const LOCAL_MODEL_OUTPUT_TRUNCATED = 'local_model_output_truncated'
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
  /** Provider stop reason. 'length' means the answer was cut off by max_tokens, not finished. */
  finishReason: string | null
  requestedMaxTokens: number
  completionTokens: number | null
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

export async function callLocalModel(args: LocalModelCallArgs, config = localInferenceConfigFromEnv()): Promise<string | null> {
  const startedAt = Date.now()
  let inferenceStartedAt: number | null = null
  let httpStatus: number | null = null
  let errorText: string | null = null
  let finishReason: string | null = null
  let completionTokens: number | null = null
  let text: string | null = null
  const requestedMaxTokens = args.maxTokens ?? 2048
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs)
  try {
    inferenceStartedAt = Date.now()
    const reasoningEffort = configuredReasoningEffort()
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
        ...(args.jsonObject ? { response_format: { type: 'json_object' } } : {}),
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
        usage?: { completion_tokens?: number }
      }
      const rawFinishReason = data.choices?.[0]?.finish_reason
      finishReason = typeof rawFinishReason === 'string' ? rawFinishReason : null
      completionTokens = typeof data.usage?.completion_tokens === 'number' ? data.usage.completion_tokens : null
      const content = data.choices?.[0]?.message?.content
      // A provider that stops on max_tokens returns HTTP 200 with a half-finished answer. Without
      // this a truncated result is indistinguishable from one the model chose to end.
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
    emitLocalInferenceTelemetry({
      at: new Date().toISOString(),
      model: config.model,
      latencyMs,
      startupLatencyMs: 0,
      inferenceLatencyMs,
      success: errorText === null && httpStatus !== null && httpStatus >= 200 && httpStatus < 300,
      httpStatus,
      error: errorText,
      finishReason,
      requestedMaxTokens,
      completionTokens,
    })
  }

  // Raised after telemetry so the caller can retry with a larger budget instead of parsing a
  // fragment. Partial output is discarded even when it happens to parse.
  if (finishReason === 'length') throw new Error(LOCAL_MODEL_OUTPUT_TRUNCATED)
  return text
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
// saas/lib/builder/tool-loop.ts
import type { BuilderAiPort, BuilderFailureClass, BuilderFile, BuilderLoopResult, BuilderRunResult, BuilderRunnerPort, BuilderToolId, BuilderToolTrace, BuilderWorkspacePort } from './contracts.ts'
import { evaluateRegressionGate, isRepairObjective } from './regression-gate.ts'
import { formatVerifiedLessonsForPrompt } from './verified-lessons.ts'
import { discoverBuilderProjectContext, formatBuilderProjectContext, normalizeBuilderSandboxCommand } from './project-context.ts'
import { deriveRepairPhase, formatRepairPhase } from './repair-phase.ts'
import { builderTaskContract, builderTaskProgress } from './task-contract.ts'

type ToolAction = { type: 'tool'; toolId: BuilderToolId; input: Record<string, unknown> }
type Action = ToolAction | { type: 'answer'; answer: string }
const tools: readonly BuilderToolId[] = Object.freeze(['list_files', 'read_file', 'write_file', 'edit_file', 'run'])
const MAX_WRITES_PER_TURN = 6
const MAX_RUNS_PER_TURN = 5
const MAX_GATE_NUDGES = 3
const MAX_REPEAT_RECOVERY_ATTEMPTS = 4
const MAX_MODEL_ROUND_ATTEMPTS = 2
const MAX_INVALID_CONTROL_RECOVERY_ATTEMPTS = 1
const MODEL_CONTROL_MAX_TOKENS = 2_400
const MODEL_REPAIR_CONTROL_MAX_TOKENS = 4_096
const MODEL_CONTROL_RECOVERY_MAX_TOKENS = 4_096
/** Message raised by the model port when the provider reported an incomplete generation. */
const MODEL_OUTPUT_TRUNCATED = 'local_model_output_truncated'
const isOutputTruncation = (error: unknown): boolean =>
  error instanceof Error && error.message === MODEL_OUTPUT_TRUNCATED
const text = (value: unknown) => typeof value === 'string' ? value : ''
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

function compactJsonValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return value.length > 8_000 ? `${value.slice(0, 8_000)}...[truncated]` : value
  if (depth >= 6) return '[depth-bounded]'
  if (Array.isArray(value)) return value.slice(-24).map(item => compactJsonValue(item, depth + 1))
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).slice(0, 48).map(([key, item]) => [key, compactJsonValue(item, depth + 1)]),
    )
  }
  return value
}

const safeJson = (value: unknown, maximum = 18_000) => {
  try {
    const compact = compactJsonValue(value)
    let encoded = JSON.stringify(compact) ?? 'null'
    if (encoded.length <= maximum) return encoded
    if (Array.isArray(compact)) {
      const tail = [...compact]
      while (tail.length > 1 && encoded.length > maximum) {
        tail.shift()
        encoded = JSON.stringify(tail)
      }
      if (encoded.length <= maximum) return encoded
    }
    return JSON.stringify({ truncated: true, excerpt: encoded.slice(0, Math.max(0, maximum - 64)) })
  } catch {
    return '"[unserializable]"'
  }
}

async function within<T>(work: Promise<T>, timeoutMs?: number): Promise<T> {
  if (!timeoutMs || !Number.isFinite(timeoutMs) || timeoutMs <= 0) return work
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('builder_model_round_timeout')), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function generateWithRetry(ai: BuilderAiPort, input: Parameters<BuilderAiPort['generate']>[0], timeoutMs?: number): Promise<string | null> {
  let lastError: unknown
  let request = input
  for (let modelAttempt = 1; modelAttempt <= MAX_MODEL_ROUND_ATTEMPTS; modelAttempt += 1) {
    try {
      return await within(ai.generate(request), timeoutMs)
    } catch (error) {
      lastError = error
      if (modelAttempt === MAX_MODEL_ROUND_ATTEMPTS) throw error
      if (error instanceof Error && error.message === 'builder_model_output_limit') {
        request = { ...request, maxTokens: Math.min(8_192, request.maxTokens * 2) }
      } else if (!(error instanceof Error && error.message === 'builder_model_round_timeout')) throw error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('builder_model_call_failed')
}

function toolPath(input: Record<string, unknown>): string {
  return text(input.path) || text(input.filePath) || text(input.filename) || text(input.file) || text(input.name)
}

function toolContent(input: Record<string, unknown>): string {
  return text(input.content) || text(input.contents) || text(input.code) || text(input.text)
}

function hasToolContent(input: Record<string, unknown>): boolean {
  return ['content', 'contents', 'code', 'text'].some(key => typeof input[key] === 'string')
}

function validToolInput(toolId: BuilderToolId, input: Record<string, unknown>): boolean {
  if (toolId === 'list_files') return true
  if (toolId === 'read_file') return Boolean(toolPath(input))
  if (toolId === 'write_file') return Boolean(toolPath(input)) && hasToolContent(input)
  if (toolId === 'edit_file') {
    return Boolean(toolPath(input))
      && typeof input.search === 'string'
      && input.search.length > 0
      && typeof input.replace === 'string'
  }
  return toolId === 'run' && typeof input.command === 'string' && input.command.trim().length > 0
}

function jsonObjectCandidates(value: string | null): readonly string[] {
  const raw = String(value || '').trim()
  const fenced = raw.replace(/^\`\`\`(?:json)?\s*/i, '').replace(/\s*\`\`\`$/, '')
  const candidates = [fenced]
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false

  for (let index = 0; index < fenced.length; index += 1) {
    const character = fenced[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === '"') {
        inString = false
      }
      continue
    }
    if (character === '"') {
      inString = true
      continue
    }
    if (character === '{') {
      if (depth === 0) start = index
      depth += 1
      continue
    }
    if (character === '}' && depth > 0) {
      depth -= 1
      if (depth === 0 && start >= 0) {
        candidates.push(fenced.slice(start, index + 1))
        start = -1
      }
    }
  }

  return Object.freeze([...new Set(candidates.filter(Boolean))])
}

function normalizedToolInput(value: Record<string, unknown>): Record<string, unknown> | null {
  const candidate = value.input ?? value.tool_input ?? value.toolInput ?? value.arguments ?? value.tool_arguments ?? value.toolArguments ?? value.args ?? value.parameters ?? value.payload ?? value.data
  if (isRecord(candidate)) return candidate
  if (typeof candidate === 'string') {
    try {
      const decoded = JSON.parse(candidate)
      return isRecord(decoded) ? decoded : null
    } catch {
      return null
    }
  }
  // Some OpenAI-compatible local servers flatten function arguments beside the action name.
  // Keep only non-control fields, then apply the same per-tool validation below.
  const controlKeys = new Set(['type', 'action', 'toolId', 'tool_id', 'tool', 'toolName', 'tool_name', 'name', 'function', 'function_call', 'tool_call', 'tool_calls'])
  const flat = Object.fromEntries(Object.entries(value).filter(([key]) => !controlKeys.has(key)))
  return Object.keys(flat).length > 0 ? flat : {}
}

function controlRecord(value: Record<string, unknown>): Record<string, unknown> {
  if (isRecord(value.function)) return value.function
  if (isRecord(value.function_call)) return value.function_call
  if (isRecord(value.tool_call)) return isRecord(value.tool_call.function) ? value.tool_call.function : value.tool_call
  if (Array.isArray(value.tool_calls) && isRecord(value.tool_calls[0])) {
    const first = value.tool_calls[0]
    return isRecord(first.function) ? first.function : first
  }
  return value
}

function parse(value: string | null, allowedTools: readonly BuilderToolId[] = tools): Action | null {
  for (const candidate of jsonObjectCandidates(value)) {
    try {
      const decoded = JSON.parse(candidate)
      const parsed = Array.isArray(decoded) && decoded.length === 1 ? decoded[0] : decoded
      if (!isRecord(parsed)) continue
      const control = controlRecord(parsed)
      if (control.type === 'answer' || control.action === 'answer') {
        const answer = text(control.answer) || text(control.content) || text(control.message) || text(control.final) || text(control.final_answer)
        if (answer.trim()) return { type: 'answer', answer }
      }
      const toolId = text(control.toolId) || text(control.tool_id) || text(control.tool) || text(control.toolName) || text(control.tool_name) || text(control.name) || (control.type === 'tool' ? text(control.action) : '') || text(control.action)
      const input = normalizedToolInput(control)
      if (!toolId || !input) continue
      if (!allowedTools.includes(toolId as BuilderToolId) || !validToolInput(toolId as BuilderToolId, input)) continue
      return { type: 'tool', toolId: toolId as BuilderToolId, input }
    } catch {}
  }
  return null
}
