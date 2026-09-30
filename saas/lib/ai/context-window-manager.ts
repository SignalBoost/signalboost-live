// Central, model-aware context-window governance for every iTMounts text-model call.
//
// The provider owns the physical model window. iTMounts owns what is allowed into it:
// system prompt + conversation/tool history + requested completion + safety reserve.
// This module is deterministic and provider-neutral; callers may override a model's window
// with deployment configuration when the serving runtime differs from the model default.

export type ContextMessage = Readonly<{
  role: 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_call_id?: string
  tool_calls?: readonly unknown[]
}>

export type ContextWindowPlan<T extends ContextMessage = ContextMessage> = Readonly<{
  contextWindowTokens: number
  estimatedPromptTokens: number
  maxOutputTokens: number
  messages: readonly T[]
  compacted: boolean
  droppedMessages: number
  truncatedCharacters: number
}>

export const DEFAULT_CONTEXT_WINDOW_TOKENS = 32_768
export const RUNPOD_CONTEXT_WINDOW_TOKENS = 8_192
export const DEFAULT_CONTEXT_SAFETY_TOKENS = 256
export const ESTIMATED_CHARACTERS_PER_TOKEN = 3

function boundedInteger(value: unknown, min: number, max: number): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : null
}

function modelEnvKey(model: string): string {
  return `LOCAL_AI_CONTEXT_WINDOW_${model.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_TOKENS`
}

export function resolveContextWindowTokens(input: {
  model: string
  provider?: string | null
  explicitTokens?: number | null
  env?: NodeJS.ProcessEnv
}): number {
  const env = input.env ?? process.env
  const explicit = boundedInteger(input.explicitTokens, 1_024, 4_194_304)
  if (explicit) return explicit

  const perModel = boundedInteger(env[modelEnvKey(input.model)], 1_024, 4_194_304)
  if (perModel) return perModel

  const global = boundedInteger(env.LOCAL_AI_CONTEXT_WINDOW_TOKENS, 1_024, 4_194_304)
  if (global) return global

  return String(input.provider || '').toLowerCase() === 'runpod'
    ? RUNPOD_CONTEXT_WINDOW_TOKENS
    : DEFAULT_CONTEXT_WINDOW_TOKENS
}

export function estimateContextTokens(value: unknown): number {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '')
  return Math.max(1, Math.ceil(text.length / ESTIMATED_CHARACTERS_PER_TOKEN))
}

/**
 * Qwen-family token estimate (2026-09-29). The flat 3-characters-per-token estimate above overstates English
 * prose by ~60% for the Qwen tokenizer (measured 4.8-5.1 characters per token on the COS answer prompt) and
 * understates digits, identifiers, JSON and non-Latin text (Qwen spends one token per digit). On the RunPod
 * reasoner that overstatement refused a ~9K-token chat prompt as if it were ~15K. This estimate counts every
 * character of a digit-bearing word as a token, two tokens per non-ASCII character, and 3.6 characters per
 * token for the remaining ASCII. Checked against the Qwen3 tokenizer on English prompts, code, JSON, UUID/hex,
 * digit runs, Spanish, Polish, Russian and Chinese: never below the real count.
 */
export function estimateQwenContextTokens(value: unknown): number {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '')
  let numeric = 0
  const rest = text.replace(/[A-Za-z0-9]*\d[A-Za-z0-9]*/g, match => { numeric += match.length + 1; return '' })
  let nonAscii = 0
  let other = 0
  for (const character of rest) {
    if (character.charCodeAt(0) < 128) other += 1
    else nonAscii += 1
  }
  return Math.max(1, numeric + nonAscii * 2 + Math.ceil(other / 3.6))
}

export type ContextTokenEstimator = (value: unknown) => number

function messageTokens(message: ContextMessage, estimate: ContextTokenEstimator = estimateContextTokens): number {
  // Include structural overhead for role/tool-call framing, not only visible text.
  return estimate(message) + 12
}

function truncateMiddle(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  if (maxChars <= 80) return text.slice(0, Math.max(0, maxChars))
  const marker = '\n…[context compacted]…\n'
  const remaining = Math.max(0, maxChars - marker.length)
  const head = Math.ceil(remaining * 0.35)
  const tail = Math.max(0, remaining - head)
  return `${text.slice(0, head)}${marker}${text.slice(text.length - tail)}`
}

function trimMessage<T extends ContextMessage>(message: T, targetTokens: number, estimate: ContextTokenEstimator = estimateContextTokens): { message: T; chars: number } {
  const content = typeof message.content === 'string' ? message.content : ''
  if (!content) return { message, chars: 0 }
  // Characters per estimated token for THIS content, so a non-default estimator trims to its own budget.
  const charactersPerToken = estimate === estimateContextTokens
    ? ESTIMATED_CHARACTERS_PER_TOKEN
    : Math.max(0.25, content.length / Math.max(1, estimate(content)))
  const targetChars = Math.max(0, Math.floor(targetTokens * charactersPerToken))
  const trimmed = truncateMiddle(content, targetChars)
  if (trimmed === content) return { message, chars: 0 }
  return {
    message: Object.freeze({ ...message, content: trimmed }) as T,
    chars: content.length - trimmed.length,
  }
}

/**
 * Fit a request into a physical model context window.
 *
 * Policy:
 * - reserve requested completion tokens plus a safety margin;
 * - retain the newest conversation turns preferentially;
 * - never split tool-call objects;
 * - when the newest/current message alone is too large, retain its beginning + newest tail;
 * - lower max_output_tokens only after prompt compaction, never below the configured minimum.
 */
export function planContextWindow<T extends ContextMessage>(input: {
  model: string
  provider?: string | null
  contextWindowTokens?: number | null
  systemPrompt?: string | null
  messages: readonly T[]
  requestedOutputTokens: number
  minimumOutputTokens?: number
  safetyTokens?: number
  env?: NodeJS.ProcessEnv
  /** Token estimator for this model family. Defaults to the flat character estimate. */
  estimateTokens?: ContextTokenEstimator
}): ContextWindowPlan<T> {
  const estimate = input.estimateTokens ?? estimateContextTokens
  const contextWindowTokens = resolveContextWindowTokens({
    model: input.model,
    provider: input.provider,
    explicitTokens: input.contextWindowTokens,
    env: input.env,
  })
  const safetyTokens = boundedInteger(input.safetyTokens, 0, 16_384) ?? DEFAULT_CONTEXT_SAFETY_TOKENS
  const requestedOutputTokens = boundedInteger(input.requestedOutputTokens, 1, contextWindowTokens) ?? 2_048
  const minimumOutputTokens = Math.min(
    requestedOutputTokens,
    boundedInteger(input.minimumOutputTokens, 1, contextWindowTokens) ?? Math.min(256, requestedOutputTokens),
  )
  const systemTokens = estimate(input.systemPrompt || '') + 16
  const maxPromptForRequested = Math.max(1, contextWindowTokens - requestedOutputTokens - safetyTokens)

  let messages = [...input.messages]
  let estimatedPromptTokens = systemTokens + messages.reduce((sum, message) => sum + messageTokens(message, estimate), 0)
  let droppedMessages = 0
  let truncatedCharacters = 0

  // Drop oldest coherent conversation groups first. An assistant tool-call and its following
  // tool results are one atomic group so compaction never creates an invalid orphan tool message.
  while (estimatedPromptTokens > maxPromptForRequested && messages.length > 1) {
    let removeCount = 1
    const first = messages[0]
    if (first.role === 'assistant' && first.tool_calls?.length) {
      while (removeCount < messages.length && messages[removeCount].role === 'tool') removeCount += 1
    }
    // Never remove every message: preserve the newest turn even when the oldest group spans the list.
    removeCount = Math.min(removeCount, messages.length - 1)
    const removed = messages.splice(0, removeCount)
    estimatedPromptTokens -= removed.reduce((sum, message) => sum + messageTokens(message, estimate), 0)
    droppedMessages += removed.length
  }

  // If the newest turn itself is too large, compact it deterministically.
  if (estimatedPromptTokens > maxPromptForRequested && messages.length === 1) {
    const overhead = systemTokens + 12
    const availableForMessage = Math.max(1, maxPromptForRequested - overhead)
    const trimmed = trimMessage(messages[0], availableForMessage, estimate)
    messages[0] = trimmed.message
    truncatedCharacters += trimmed.chars
    estimatedPromptTokens = systemTokens + messageTokens(messages[0], estimate)
  }

  const availableOutput = Math.max(0, contextWindowTokens - estimatedPromptTokens - safetyTokens)
  const maxOutputTokens = Math.min(requestedOutputTokens, availableOutput)

  if (maxOutputTokens < minimumOutputTokens) {
    throw new Error(
      `context_window_budget_insufficient:model=${input.model}:window=${contextWindowTokens}:prompt=${estimatedPromptTokens}:availableOutput=${availableOutput}:minimumOutput=${minimumOutputTokens}`,
    )
  }

  return Object.freeze({
    contextWindowTokens,
    estimatedPromptTokens,
    maxOutputTokens,
    messages: Object.freeze(messages),
    compacted: droppedMessages > 0 || truncatedCharacters > 0 || maxOutputTokens < requestedOutputTokens,
    droppedMessages,
    truncatedCharacters,
  })
}
