const MIN_LENGTH = 8
const MAX_LENGTH = 140

function clean(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function normalized(value: string): string {
  return clean(value).toLocaleLowerCase()
}

/**
 * There is deliberately no generic fallback question. A follow-up chip is a product promise that
 * COS can continue the topic coherently. If the grounded generator cannot justify two questions
 * from the answered turn, the correct UI is no chips rather than speculative prompts.
 */
export function fallbackFollowups(_prompt: string): string[] {
  return []
}

/** Failed-closed answers must not advertise a next question that inherits the same evidence gap. */
export function repairFollowups(_prompt: string): string[] {
  return []
}

function valid(candidate: unknown, prompt: string): candidate is string {
  const question = clean(candidate)
  return question.length >= MIN_LENGTH
    && question.length <= MAX_LENGTH
    && question.endsWith('?')
    && normalized(question) !== normalized(prompt)
}

/**
 * Suggestions are all-or-nothing. The UI promises two next questions when it shows this surface;
 * one weak/invalid candidate suppresses the surface instead of being padded with an ungrounded one.
 */
export function validateSuggestedFollowups(value: unknown, prompt: string, _fallback: string[] = []): string[] {
  const candidates = Array.isArray(value) ? value : []
  const accepted = [...new Set(candidates.filter(candidate => valid(candidate, prompt)).map(clean))]
  return accepted.length === 2 ? accepted : []
}
