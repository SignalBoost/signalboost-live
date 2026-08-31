const MIN_LENGTH = 8
const MAX_LENGTH = 140

function clean(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function normalized(value: string): string {
  return clean(value).toLocaleLowerCase()
}

function entityFromPrompt(prompt: string): string {
  const withoutQuestion = clean(prompt).replace(/\?+$/, '')
  const match = withoutQuestion.match(/(?:about|of|for|on|explain|describe|who is|who was|what is|what was)\s+(.{3,80})/i)
  return clean(match?.[1] || withoutQuestion).slice(0, 80) || 'this topic'
}

const MEASUREMENT_PROMPT = /\b(?:pay|wage|wages|earnings?|gap|difference|median|rate|ratio|percent|percentage|unemployment|inflation|cpi|gdp|price|how much|how many)\b/i
const PERSON_OR_ROLE_PROMPT = /\b(?:who is|who was|president|ceo|prime minister|minister|director|holder)\b/i

/**
 * Chips must be questions the next turn can answer from the same class of
 * evidence. Event-biography prompts ("what happened next", "who was involved")
 * made every topic look like history and then failed grounding.
 */
export function fallbackFollowups(prompt: string): string[] {
  const entity = entityFromPrompt(prompt)
  if (MEASUREMENT_PROMPT.test(prompt)) {
    return [
      `What does the comparison used for ${entity} actually measure?`,
      `What does that comparison leave uncontrolled or unmeasured?`,
    ]
  }
  if (PERSON_OR_ROLE_PROMPT.test(prompt)) {
    return [
      `Which source identifies ${entity}?`,
      `What would those sources not be enough to conclude about ${entity}?`,
    ]
  }
  return [
    `Which retrieved source directly supports the answer about ${entity}?`,
    `What related claim do those sources not establish about ${entity}?`,
  ]
}

export function repairFollowups(prompt: string): string[] {
  const topic = entityFromPrompt(prompt)
  return [
    `Which live source is required before answering ${topic}?`,
    `What part of ${topic} can be restated only from retrieved pages?`,
  ]
}

function valid(candidate: unknown, prompt: string): candidate is string {
  const question = clean(candidate)
  return question.length >= MIN_LENGTH && question.length <= MAX_LENGTH && question.endsWith('?') && normalized(question) !== normalized(prompt)
}

export function validateSuggestedFollowups(value: unknown, prompt: string, fallback: string[]): string[] {
  const candidates = Array.isArray(value) ? value : []
  const accepted = [...new Set(candidates.filter(candidate => valid(candidate, prompt)).map(clean))]
  for (const candidate of fallback) {
    if (accepted.length >= 2) break
    if (valid(candidate, prompt) && !accepted.some(item => normalized(item) === normalized(candidate))) accepted.push(candidate)
  }
  return accepted.slice(0, 2)
}
