// saas/lib/ai/cos/graduateContextFit.ts
//
// Fit a COS worker request into a University graduate's physical context window.
//
// COS builds worker requests for the large managed reasoner (32k+ window): the full interactive system prompt,
// the ~9.7k-character general reasoning discipline, role guidance, and up to 4,200 requested output tokens.
// A mass-distilled graduate is served by vLLM with --max-model-len 8192. planContextWindow compacts conversation
// messages but never the system prompt, so the system prompt alone exceeded the graduate's window and every call
// failed locally before reaching RunPod: `context_window_budget_insufficient` in 4-6 ms
// (mass:481a6760, 66/66 live calls failed 2026-09-20..27, recorded 2026-09-27 19:29 ET).
//
// Policy (deterministic, graduate-only; the managed reasoner path is untouched):
// - cap requested output to a quarter of the window (verdicts and critiques are short);
// - reserve room for the user message first (the question and draft the graduate must judge);
// - if the system prompt still does not fit, keep its beginning and its end (role guidance and output contract
//   live at the end) and compact the middle with an explicit marker.

import { estimateContextTokens, resolveContextWindowTokens } from '../context-window-manager.ts'

export const GRADUATE_CONTEXT_SAFETY_TOKENS = 256
export const GRADUATE_SYSTEM_OVERHEAD_TOKENS = 16
export const GRADUATE_MESSAGE_OVERHEAD_TOKENS = 12
/** Share of the prompt budget the user message may claim before the system prompt is compacted. */
export const GRADUATE_MESSAGE_SHARE = 0.6
const MARKER = '\n…[COS instructions compacted to fit the graduate context window]…\n'

export type GraduateContextFit = Readonly<{
  systemPrompt: string | undefined
  maxTokens: number
  contextWindowTokens: number
  systemCompactedCharacters: number
}>

function keepHeadAndTail(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  if (maxChars <= MARKER.length + 80) return text.slice(text.length - Math.max(0, maxChars))
  const remaining = maxChars - MARKER.length
  const head = Math.floor(remaining * 0.4)
  const tail = remaining - head
  return `${text.slice(0, head)}${MARKER}${text.slice(text.length - tail)}`
}

export function fitGraduateCall(input: {
  model: string
  provider?: string | null
  contextWindowTokens?: number | null
  systemPrompt?: string
  prompt: string
  maxTokens?: number
}): GraduateContextFit {
  const window = resolveContextWindowTokens({
    model: input.model,
    provider: input.provider,
    // Pass undefined (not null) when unset: the resolver treats null as an explicit 0 and clamps it to 1,024.
    explicitTokens: input.contextWindowTokens ?? undefined,
  })
  const outputCeiling = Math.max(256, Math.floor(window / 4))
  const requested = Number(input.maxTokens)
  const maxTokens = Number.isFinite(requested) && requested > 0
    ? Math.max(1, Math.min(Math.floor(requested), outputCeiling))
    : Math.min(1024, outputCeiling)

  const promptBudget = Math.max(0, window - maxTokens - GRADUATE_CONTEXT_SAFETY_TOKENS)
  const messageTokens = estimateContextTokens(input.prompt) + GRADUATE_MESSAGE_OVERHEAD_TOKENS
  const messageReserve = Math.min(messageTokens, Math.floor(promptBudget * GRADUATE_MESSAGE_SHARE))
  const systemBudgetTokens = Math.max(0, promptBudget - messageReserve - GRADUATE_SYSTEM_OVERHEAD_TOKENS)

  const system = input.systemPrompt
  if (!system || estimateContextTokens(system) <= systemBudgetTokens) {
    return Object.freeze({ systemPrompt: system, maxTokens, contextWindowTokens: window, systemCompactedCharacters: 0 })
  }
  // estimateContextTokens uses ceil(chars / 3); stay one token under the budget.
  const maxChars = Math.max(0, (systemBudgetTokens - 1) * 3)
  const compacted = keepHeadAndTail(system, maxChars)
  return Object.freeze({
    systemPrompt: compacted,
    maxTokens,
    contextWindowTokens: window,
    systemCompactedCharacters: system.length - compacted.length,
  })
}
