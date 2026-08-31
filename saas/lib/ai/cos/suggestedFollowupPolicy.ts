const MIN_LENGTH = 8
const MAX_LENGTH = 140

function clean(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function normalized(value: string): string {
  return clean(value).toLocaleLowerCase()
}

export function isFollowupChipEcho(prompt: string): boolean {
  const text = clean(prompt)
  return /^(?:did you mean|could you explain|which live source|what part of|what does live\s*\d|which retrieved source|what related claim|what does the comparison|what does that comparison|using the original question)\b/i.test(text)
}

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return clean(content)
  if (!Array.isArray(content)) return ''
  return clean(content.map((block: any) => String(block?.text || '')).filter(Boolean).join(' '))
}

/** Last real user question in the thread, never a previous chip. */
export function originUserPrompt(body: any, currentPrompt: string): string {
  const current = clean(currentPrompt)
  const messages = Array.isArray(body?.messages) ? body.messages : []
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role !== 'user') continue
    const text = textFromContent(messages[index]?.content)
    if (!text) continue
    if (isFollowupChipEcho(text)) continue
    if (normalized(text) === normalized(current) && isFollowupChipEcho(current)) continue
    return text.slice(0, 240)
  }
  if (current && !isFollowupChipEcho(current)) return current.slice(0, 240)
  return current.slice(0, 240)
}

const STOPWORDS = new Set([
  'about','after','again','also','answer','before','between','could','does','from','have','include','into','live','more','question','regarding','source','specific','text','than','that','their','these','this','those','what','when','where','which','with','would','your',
])

function topicTerms(prompt: string): string[] {
  return [...new Set((normalized(prompt).match(/[\p{L}\p{N}]+/gu) || [])
    .filter(term => term.length >= 4 && !STOPWORDS.has(term)))]
    .slice(0, 10)
}

function topicFromPrompt(prompt: string): string {
  const withoutQuestion = clean(prompt).replace(/\?+$/, '')
  const match = withoutQuestion.match(/(?:about|of|for|on|explain|describe|who is|who was|what is|what was)\s+(.{3,80})/i)
  const extracted = clean(match?.[1] || withoutQuestion)
  return extracted.slice(0, 80) || 'this topic'
}

function hasTopicAffinity(candidate: string, prompt: string): boolean {
  const terms = topicTerms(prompt)
  if (!terms.length) return true
  const haystack = normalized(candidate)
  const overlap = terms.filter(term => haystack.includes(term)).length
  return overlap >= Math.min(2, terms.length)
}

const MEASUREMENT_PROMPT = /\b(?:pay|wage|wages|earnings?|gap|difference|median|rate|ratio|percent|percentage|unemployment|inflation|cpi|gdp|price|how much|how many)\b/i
const PERSON_OR_ROLE_PROMPT = /\b(?:who is|who was|president|ceo|prime minister|minister|director|holder)\b/i

export function fallbackFollowups(prompt: string): string[] {
  const topic = topicFromPrompt(prompt)
  if (MEASUREMENT_PROMPT.test(prompt)) {
    return [
      `What does the evidence for ${topic} actually measure?`,
      `What does the evidence for ${topic} leave uncontrolled or unmeasured?`,
    ]
  }
  if (PERSON_OR_ROLE_PROMPT.test(prompt)) {
    return [
      `Which source directly identifies ${topic}?`,
      `What do the sources not establish about ${topic}?`,
    ]
  }
  return [
    `Which retrieved source directly supports ${topic}?`,
    `What related claim about ${topic} do those sources not establish?`,
  ]
}

/** Failed turns must return to the original question, not compound the failed chip. */
export function repairFollowups(originPrompt: string): string[] {
  const topic = topicFromPrompt(originPrompt)
  return [
    `What do retrieved sources state about ${topic}?`,
    `What do retrieved sources not measure about ${topic}?`,
  ]
}

function valid(candidate: unknown, prompt: string): candidate is string {
  const question = clean(candidate)
  return question.length >= MIN_LENGTH
    && question.length <= MAX_LENGTH
    && question.endsWith('?')
    && normalized(question) !== normalized(prompt)
    && hasTopicAffinity(question, prompt)
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
