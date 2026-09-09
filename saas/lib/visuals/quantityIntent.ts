type VisualQuantityReasoner = (args: Record<string, unknown>) => Promise<{ text?: string } | null>

export const MAX_VISUAL_BATCH_COUNT = 4
const MAX_QUANTITY_OBJECTIVE_CHARS = 8000

async function defaultReasoner(args: Record<string, unknown>) {
  const { callCosReasoner } = await import('../ai/cos/cosReasoner.ts')
  return callCosReasoner(args as never)
}

const SYSTEM_PROMPT = [
  'You are the deep-learning quantity interpreter for a visual-generation request.',
  'Determine how many DISTINCT visual outputs the user is asking to receive in the current request.',
  'Understand meaning, conversational follow-up wording, numbers, number words, and equivalent expressions in any language; do not rely on a fixed phrase list or regex matching.',
  'The input may contain an original request followed by a section named FOLLOW-UP USER INSTRUCTIONS. The latest follow-up instruction controls how many new visuals are requested now.',
  'A request for N more, N alternatives, N examples, N versions, or N concepts means requested_count is N for this turn, not the cumulative number across the conversation.',
  'If the user does not request a specific multiple quantity, return 1.',
  'Return ONLY strict JSON with exactly this shape: {"requested_count": integer}. Do not explain and do not add fields.',
].join(' ')

/**
 * Deep learning owns quantity meaning. Deterministic code only validates the model's
 * structured result and applies the separately declared execution ceiling.
 */
export async function resolveRequestedVisualCount(
  objective: string,
  callImpl: VisualQuantityReasoner = defaultReasoner,
): Promise<number> {
  const value = String(objective || '').trim()
  if (!value || value.length > MAX_QUANTITY_OBJECTIVE_CHARS) return 1

  const result = await callImpl({
    temperature: 0,
    maxTokens: 24,
    jsonObject: true,
    frequencyPenalty: 0,
    presencePenalty: 0,
    systemPrompt: SYSTEM_PROMPT,
    prompt: `VISUAL OBJECTIVE:\n${value}`,
  }).catch(() => null)

  if (!result?.text) return 1
  try {
    const parsed = JSON.parse(result.text) as { requested_count?: unknown }
    if (!Number.isSafeInteger(parsed.requested_count)) return 1
    const count = Number(parsed.requested_count)
    if (count < 1 || count > 99) return 1
    return count
  } catch {
    return 1
  }
}
