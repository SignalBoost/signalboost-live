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

export function fallbackFollowups(prompt: string): string[] {
  const entity = entityFromPrompt(prompt)
  return [`What happened next after ${entity}?`, `Who were the main people involved in ${entity}?`]
}

export function repairFollowups(prompt: string): string[] {
  const topic = entityFromPrompt(prompt)
  return [`Did you mean “${topic}”?`, `Could you explain ${topic}?`]
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
