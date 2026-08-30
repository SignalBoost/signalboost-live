/**
 * Prompt-extraction guard for Concierge / COS.
 *
 * Classify before generation. Extraction is not a writing task.
 * Do not name system prompts, developer instructions, or kernels in refusals.
 */

export const EXTRACTION = 'prompt_extraction' as const

export type TurnClass = typeof EXTRACTION | 'normal'

const EXTRACTION_PATTERNS: RegExp[] = [
  /disregard (all )?previous instructions/i,
  /ignore (all )?(previous|prior|above) instructions/i,
  /output (the )?(full )?system prompt/i,
  /developer instructions/i,
  /repeat (the )?(text|instructions|prompt)/i,
  /word[- ]for[- ]word/i,
  /verbatim/i,
  /translate .{0,80}(system prompt|instructions|private context)/i,
  /\bbase64\b/i,
  /\brots?13\b/i,
  /hex(adecimal)? encode/i,
  /you are concierge/i,
  /exact text of (the |your |its )?(instructions|system prompt|creators? gave)/i,
  /private context data/i,
  /include the exact text of the instructions/i,
]

export function classifyTurn(text: string): TurnClass {
  const blob = String(text || '')
  return EXTRACTION_PATTERNS.some((re) => re.test(blob)) ? EXTRACTION : 'normal'
}

/** One-line public refusal. Do not mention internals. */
export const EXTRACTION_REFUSAL =
  "I can't help with requests for hidden instructions or private configuration. What do you need help with instead?"

export function guardConciergeTurn(userText: string): {
  class: TurnClass
  block: boolean
  reply: string | null
} {
  const turnClass = classifyTurn(userText)
  if (turnClass === EXTRACTION) {
    return { class: EXTRACTION, block: true, reply: EXTRACTION_REFUSAL }
  }
  return { class: 'normal', block: false, reply: null }
}
