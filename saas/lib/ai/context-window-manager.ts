// saas/lib/ai/context-window-manager.ts
//
// Universal model-context boundary for iTMounts.
//
// Upstream layers (conversation recall, enterprise memory, Builder workspace context,
// retrieval/evidence, University evaluators) may compact their own domain data first.
// This module is the final model-aware guard before inference: it resolves the active
// model's context window, reserves output/safety headroom, deterministically compacts
// only untrusted/request context when needed, preserves tool protocol structure, and
// fails closed when trusted system/tool contracts themselves cannot fit.
//
// Context never grants authority. Truncation/compaction cannot widen a HarnessRun,
// capability, approval, spend ceiling, environment, or Referee/Guardian decision.

export type ContextWindowMessage = Readonly<{
  role: string
  content?: string | null
  tool_call_id?: string
  tool_calls?: readonly unknown[]
  [key: string]: unknown
}>

export type ContextWindowResolution = Readonly<{
  contextWindowTokens: number
  source: 'explicit' | 'model_override' | 'provider_env' | 'global_env' | 'builtin_model' | 'conservative_default'
}>

export type ContextWindowPlan = Readonly<{
  model: string
  provider: string
  contextWindowTokens: number
  contextWindowSource: ContextWindowResolution['source']
  estimatedCharsPerToken: number
  safetyTokens: number
  systemTokens: number
  toolDefinitionTokens: number
  estimatedInputTokensBefore: number
  estimatedInputTokensAfter: number
  requestedOutputTokens: number
  maxOutputTokens: number
  compacted: boolean
  droppedMessageCount: number
  compactedMessageCount: number
  prompt: string
  messages?: readonly ContextWindowMessage[]
}>

export class ContextWindowBudgetError extends Error {
  readonly code = 'context_window_budget_insufficient'
  constructor(message: string) {
    super(message)
    this.name = 'ContextWindowBudgetError'
  }
}

const DEFAULT_CHARS_PER_TOKEN = 3
const DEFAULT_UNKNOWN_CONTEXT_TOKENS = 8192
const MIN_CONTEXT_TOKENS = 1024
const MAX_CONTEXT_TOKENS = 4_194_304
const OMITTED = '\n\n[... context omitted by iTMounts context-window manager ...]\n\n'

function positiveInt(value: unknown): number | null {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.floor(n)
}

function clampContextWindow(value: number): number {
  return Math.max(MIN_CONTEXT_TOKENS, Math.min(MAX_CONTEXT_TOKENS, Math.floor(value)))
}

function normalizedProvider(provider: unknown): string {
  return String(provider || 'unknown').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-') || 'unknown'
}

function normalizedModel(model: unknown): string {
  return String(model || '').trim()
}

type ContextWindowEnv = Record<string, string | undefined>

function envInteger(env: ContextWindowEnv, name: string): number | null {
  return positiveInt(env[name])
}

function parsedOverrides(env: ContextWindowEnv): Record<string, number> {
  const raw = env.ITMOUNTS_MODEL_CONTEXT_WINDOWS_JSON?.trim()
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, number> = {}
    for (const [key, value] of Object.entries(parsed || {})) {
      const n = positiveInt(value)
      if (key.trim() && n) out[key.trim().toLowerCase()] = clampContextWindow(n)
    }
    return out
  } catch {
    return {}
  }
}

function builtinModelWindow(model: string): number | null {
  // Conservative floors, intentionally below many providers' advertised maxima.
  // Exact deployment values should be supplied through explicit config or
  // ITMOUNTS_MODEL_CONTEXT_WINDOWS_JSON when a served artifact is known.
  const value = model.toLowerCase()
  if (/deepseek.*(?:v3|v4)/i.test(value)) return 65_536
  if (/glm-(?:4|5)|zai-org\/glm/i.test(value)) return 65_536
  if (/qwen3|qwen2\.5|qwen2-5/i.test(value)) return 32_768
  if (/llama-?3\.[123]|llama-?3-(?:1|2|3)/i.test(value)) return 65_536
  if (/gpt-(?:4o|4\.1|5)/i.test(value)) return 131_072
  if (/claude-(?:sonnet|opus|haiku)-4/i.test(value)) return 200_000
  if (/gemini-(?:2\.5|3)/i.test(value)) return 131_072
  if (/grok-(?:3|4)/i.test(value)) return 131_072
  if (/mixtral|mistral/i.test(value)) return 32_768
  return null
}

export function resolveModelContextWindowTokens(input: {
  model: string
  provider?: string
  explicitContextWindowTokens?: number | null
  env?: ContextWindowEnv
}): ContextWindowResolution {
  const env = input.env || process.env
  const explicit = positiveInt(input.explicitContextWindowTokens)
  if (explicit) return { contextWindowTokens: clampContextWindow(explicit), source: 'explicit' }

  const provider = normalizedProvider(input.provider)
  const model = normalizedModel(input.model)
  const overrides = parsedOverrides(env)
  const overrideKeys = [
    `${provider}:${model}`,
    model,
    `${provider}:*`,
    '*',
  ].map(value => value.toLowerCase())
  for (const key of overrideKeys) {
    const value = positiveInt(overrides[key])
    if (value) return { contextWindowTokens: clampContextWindow(value), source: 'model_override' }
  }

  const providerEnv = provider.replace(/[^a-z0-9]+/gi, '_').toUpperCase()
  const providerValue = envInteger(env, `ITMOUNTS_${providerEnv}_CONTEXT_WINDOW_TOKENS`)
    ?? (provider === 'runpod' ? envInteger(env, 'RUNPOD_PRIMARY_CONTEXT_WINDOW_TOKENS') : null)
  if (providerValue) return { contextWindowTokens: clampContextWindow(providerValue), source: 'provider_env' }

  const globalValue = envInteger(env, 'LOCAL_AI_CONTEXT_WINDOW_TOKENS')
    ?? envInteger(env, 'ITMOUNTS_CONTEXT_WINDOW_TOKENS')
  if (globalValue) return { contextWindowTokens: clampContextWindow(globalValue), source: 'global_env' }

  const builtin = builtinModelWindow(model)
  if (builtin) return { contextWindowTokens: builtin, source: 'builtin_model' }

  return { contextWindowTokens: DEFAULT_UNKNOWN_CONTEXT_TOKENS, source: 'conservative_default' }
}

export function estimateContextTokens(text: unknown, charsPerToken = DEFAULT_CHARS_PER_TOKEN): number {
  const ratio = Number.isFinite(charsPerToken) && charsPerToken > 0 ? charsPerToken : DEFAULT_CHARS_PER_TOKEN
  return Math.ceil(String(text ?? '').length / ratio)
}

function jsonTokenEstimate(value: unknown, charsPerToken: number): number {
  try {
    return estimateContextTokens(JSON.stringify(value), charsPerToken)
  } catch {
    return estimateContextTokens(String(value ?? ''), charsPerToken)
  }
}

export function contextWindowOutputBudget(input: {
  contextWindowTokens: number
  systemPrompt?: string
  prompt?: string
  requestedOutputTokens: number
  minOutputTokens?: number
  estimatedCharsPerToken?: number
  fixedOverheadTokens?: number
}): Readonly<{ maxOutputTokens: number; estimatedPromptTokens: number }> {
  const contextWindowTokens = clampContextWindow(input.contextWindowTokens)
  const charsPerToken = positiveInt(input.estimatedCharsPerToken) ?? DEFAULT_CHARS_PER_TOKEN
  const requested = positiveInt(input.requestedOutputTokens) ?? 1
  const minimum = Math.min(requested, positiveInt(input.minOutputTokens) ?? 1)
  const overhead = Math.max(0, Math.floor(Number(input.fixedOverheadTokens) || 0))
  const estimatedPromptTokens = estimateContextTokens(
    `${String(input.systemPrompt ?? '')}${String(input.prompt ?? '')}`,
    charsPerToken,
  ) + overhead
  const available = contextWindowTokens - estimatedPromptTokens
  const maxOutputTokens = Math.min(requested, available)
  if (maxOutputTokens < minimum) {
    throw new ContextWindowBudgetError(
      `context_window_budget_insufficient:window=${contextWindowTokens}:estimatedPromptTokens=${estimatedPromptTokens}:minimumOutputTokens=${minimum}`,
    )
  }
  return { maxOutputTokens, estimatedPromptTokens }
}

function compactText(text: string, maxTokens: number, charsPerToken: number): string {
  const source = String(text ?? '')
  const maxChars = Math.max(0, Math.floor(maxTokens * charsPerToken))
  if (source.length <= maxChars) return source
  if (maxChars <= OMITTED.length + 16) return source.slice(Math.max(0, source.length - maxChars))
  const payload = maxChars - OMITTED.length
  const head = Math.max(8, Math.floor(payload * 0.6))
  const tail = Math.max(8, payload - head)
  return `${source.slice(0, head)}${OMITTED}${source.slice(-tail)}`
}

function messageTokens(message: ContextWindowMessage, charsPerToken: number): number {
  return jsonTokenEstimate(message, charsPerToken) + 6
}

function groupMessages(messages: readonly ContextWindowMessage[]): ContextWindowMessage[][] {
  const groups: ContextWindowMessage[][] = []
  for (let index = 0; index < messages.length;) {
    const current = messages[index]
    if (current?.role === 'assistant' && Array.isArray(current.tool_calls) && current.tool_calls.length) {
      const group = [current]
      index += 1
      while (index < messages.length && messages[index]?.role === 'tool') {
        group.push(messages[index])
        index += 1
      }
      groups.push(group)
      continue
    }
    groups.push([current])
    index += 1
  }
  return groups
}

function groupTokens(group: readonly ContextWindowMessage[], charsPerToken: number): number {
  return group.reduce((sum, message) => sum + messageTokens(message, charsPerToken), 0)
}

function compactSingleMessage(
  message: ContextWindowMessage,
  maxTokens: number,
  charsPerToken: number,
): ContextWindowMessage | null {
  const content = typeof message.content === 'string' ? message.content : ''
  const empty = { ...message, content: content ? '' : message.content }
  const fixed = messageTokens(empty, charsPerToken)
  if (fixed >= maxTokens) return null
  const compacted = compactText(content, Math.max(1, maxTokens - fixed), charsPerToken)
  return Object.freeze({ ...message, content: compacted })
}

function compactToolGroup(
  group: readonly ContextWindowMessage[],
  maxTokens: number,
  charsPerToken: number,
): ContextWindowMessage[] | null {
  let result = group.map(message => {
    if (typeof message.content !== 'string') return { ...message }
    return { ...message, content: message.content ? '[context omitted]' : '' }
  })
  let used = groupTokens(result, charsPerToken)
  if (used > maxTokens) {
    result = group.map(message => typeof message.content === 'string' ? { ...message, content: '' } : { ...message })
    used = groupTokens(result, charsPerToken)
  }
  if (used > maxTokens) return null

  let remaining = maxTokens - used
  for (let index = group.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const original = group[index]
    if (typeof original.content !== 'string' || !original.content) continue
    const current = result[index]
    const currentCost = messageTokens(current, charsPerToken)
    const full = { ...current, content: original.content }
    const fullCost = messageTokens(full, charsPerToken)
    const delta = fullCost - currentCost
    if (delta <= remaining) {
      result[index] = full
      remaining -= delta
      continue
    }
    const expanded = compactText(original.content, Math.max(1, remaining), charsPerToken)
    const candidate = { ...current, content: expanded }
    const candidateCost = messageTokens(candidate, charsPerToken)
    if (candidateCost <= currentCost + remaining) {
      result[index] = candidate
      remaining -= Math.max(0, candidateCost - currentCost)
    }
  }
  return result
}

function compactMessages(
  messages: readonly ContextWindowMessage[],
  maxTokens: number,
  charsPerToken: number,
): Readonly<{ messages: readonly ContextWindowMessage[]; dropped: number; compacted: number; tokens: number }> {
  const before = messages.reduce((sum, message) => sum + messageTokens(message, charsPerToken), 0)
  if (before <= maxTokens) return { messages, dropped: 0, compacted: 0, tokens: before }

  const groups = groupMessages(messages)
  const retained: ContextWindowMessage[][] = []
  let remaining = maxTokens
  let compacted = 0

  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index]
    const fullCost = groupTokens(group, charsPerToken)
    if (fullCost <= remaining) {
      retained.unshift(group)
      remaining -= fullCost
      continue
    }

    if (!retained.length) {
      const compactedGroup = group.length === 1
        ? (() => {
            const message = compactSingleMessage(group[0], remaining, charsPerToken)
            return message ? [message] : null
          })()
        : compactToolGroup(group, remaining, charsPerToken)
      if (!compactedGroup) {
        throw new ContextWindowBudgetError('context_window_budget_insufficient:newest_message_group_cannot_fit')
      }
      retained.unshift(compactedGroup)
      compacted += group.length
      remaining -= groupTokens(compactedGroup, charsPerToken)
    }
    break
  }

  let flattened = retained.flat()
  while (flattened.length && flattened[0]?.role === 'tool') flattened = flattened.slice(1)
  if (!flattened.length && messages.length) {
    throw new ContextWindowBudgetError('context_window_budget_insufficient:no_valid_message_suffix')
  }
  const tokens = flattened.reduce((sum, message) => sum + messageTokens(message, charsPerToken), 0)
  return {
    messages: Object.freeze(flattened.map(message => Object.freeze({ ...message }))),
    dropped: Math.max(0, messages.length - flattened.length),
    compacted,
    tokens,
  }
}

export function planContextWindowRequest(input: {
  model: string
  provider?: string
  explicitContextWindowTokens?: number | null
  systemPrompt?: string
  prompt?: string
  messages?: readonly ContextWindowMessage[]
  tools?: readonly unknown[]
  requestedOutputTokens: number
  minOutputTokens?: number
  estimatedCharsPerToken?: number
  safetyTokens?: number
  env?: ContextWindowEnv
}): ContextWindowPlan {
  const model = normalizedModel(input.model)
  const provider = normalizedProvider(input.provider)
  const resolution = resolveModelContextWindowTokens({
    model,
    provider,
    explicitContextWindowTokens: input.explicitContextWindowTokens,
    env: input.env,
  })
  const charsPerToken = positiveInt(input.estimatedCharsPerToken) ?? DEFAULT_CHARS_PER_TOKEN
  const contextWindowTokens = resolution.contextWindowTokens
  const requestedOutputTokens = positiveInt(input.requestedOutputTokens) ?? 1
  const minOutputTokens = Math.min(requestedOutputTokens, positiveInt(input.minOutputTokens) ?? Math.min(256, requestedOutputTokens))
  const safetyTokens = Math.min(
    Math.max(64, positiveInt(input.safetyTokens) ?? Math.max(128, Math.floor(contextWindowTokens * 0.03))),
    Math.max(64, Math.floor(contextWindowTokens * 0.1)),
  )
  const systemTokens = estimateContextTokens(input.systemPrompt ?? '', charsPerToken) + 8
  const toolDefinitionTokens = input.tools?.length ? jsonTokenEstimate(input.tools, charsPerToken) + 16 : 0
  const fixedTokens = safetyTokens + systemTokens + toolDefinitionTokens

  const usingMessages = Boolean(input.messages?.length)
  const inputBefore = usingMessages
    ? input.messages!.reduce((sum, message) => sum + messageTokens(message, charsPerToken), 0)
    : estimateContextTokens(input.prompt ?? '', charsPerToken) + 8
  const minimumInputTokens = inputBefore > 0 ? Math.min(96, inputBefore) : 0

  const roomAfterFixed = contextWindowTokens - fixedTokens
  if (roomAfterFixed < minOutputTokens + minimumInputTokens) {
    throw new ContextWindowBudgetError(
      `context_window_budget_insufficient:window=${contextWindowTokens}:fixedTokens=${fixedTokens}:minimumOutputTokens=${minOutputTokens}:minimumInputTokens=${minimumInputTokens}`,
    )
  }

  const maxOutputPreservingInput = Math.max(minOutputTokens, roomAfterFixed - minimumInputTokens)
  const maxOutputTokens = Math.min(requestedOutputTokens, maxOutputPreservingInput)
  const inputBudget = Math.max(0, contextWindowTokens - fixedTokens - maxOutputTokens)

  let prompt = String(input.prompt ?? '')
  let messages: readonly ContextWindowMessage[] | undefined = input.messages
  let droppedMessageCount = 0
  let compactedMessageCount = 0
  let inputAfter = inputBefore

  if (usingMessages) {
    const planned = compactMessages(input.messages!, inputBudget, charsPerToken)
    messages = planned.messages
    droppedMessageCount = planned.dropped
    compactedMessageCount = planned.compacted
    inputAfter = planned.tokens
  } else if (inputBefore > inputBudget) {
    prompt = compactText(prompt, Math.max(1, inputBudget - 8), charsPerToken)
    inputAfter = estimateContextTokens(prompt, charsPerToken) + 8
  }

  if (inputAfter > inputBudget) {
    throw new ContextWindowBudgetError(
      `context_window_budget_insufficient:inputAfter=${inputAfter}:inputBudget=${inputBudget}`,
    )
  }

  return Object.freeze({
    model,
    provider,
    contextWindowTokens,
    contextWindowSource: resolution.source,
    estimatedCharsPerToken: charsPerToken,
    safetyTokens,
    systemTokens,
    toolDefinitionTokens,
    estimatedInputTokensBefore: inputBefore,
    estimatedInputTokensAfter: inputAfter,
    requestedOutputTokens,
    maxOutputTokens,
    compacted: inputAfter < inputBefore || droppedMessageCount > 0 || compactedMessageCount > 0 || maxOutputTokens < requestedOutputTokens,
    droppedMessageCount,
    compactedMessageCount,
    prompt,
    messages,
  })
}

export function emitContextWindowTelemetry(plan: ContextWindowPlan, feature?: string): void {
  console.info('[context-window-manager]', JSON.stringify({
    at: new Date().toISOString(),
    feature: String(feature || 'unattributed_local_inference'),
    model: plan.model,
    provider: plan.provider,
    contextWindowTokens: plan.contextWindowTokens,
    contextWindowSource: plan.contextWindowSource,
    estimatedInputTokensBefore: plan.estimatedInputTokensBefore,
    estimatedInputTokensAfter: plan.estimatedInputTokensAfter,
    requestedOutputTokens: plan.requestedOutputTokens,
    maxOutputTokens: plan.maxOutputTokens,
    safetyTokens: plan.safetyTokens,
    compacted: plan.compacted,
    droppedMessageCount: plan.droppedMessageCount,
    compactedMessageCount: plan.compactedMessageCount,
  }))
}
