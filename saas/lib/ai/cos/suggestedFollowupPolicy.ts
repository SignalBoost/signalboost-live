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
  return /^(?:did you mean|could you explain|which live source|what part of|what does live\s*\d|which retrieved source|what related claim|what does the comparison|what does that comparison|using the original question|what do current|where do those published|what published rule|what do those same)\b/i.test(text)
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

function entityFromPrompt(prompt: string): string {
  const withoutQuestion = clean(prompt).replace(/\?+$/, '')
  const match = withoutQuestion.match(/(?:about|of|for|on|explain|describe|who is|who was|what is|what was)\s+(.{3,80})/i)
  return clean(match?.[1] || withoutQuestion).slice(0, 80) || 'this topic'
}

const MEASUREMENT_PROMPT = /\b(?:pay|wage|wages|earnings?|gap|difference|median|rate|ratio|percent|percentage|unemployment|inflation|cpi|gdp|price|how much|how many)\b/i
const PERSON_OR_ROLE_PROMPT = /\b(?:who is|who was|president|ceo|prime minister|minister|director|holder)\b/i
const STOPWORDS = new Set(['what','which','who','whom','whose','when','where','why','how','does','do','did','is','are','was','were','the','a','an','and','or','to','of','for','on','in','with','from','about','specific','factors','contribute','between','should','could','would','can'])

function topicTerms(prompt: string): string[] {
  const matches: string[] = normalized(prompt).match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]{2,}/gu) || []
  return [...new Set(matches.filter(term => !STOPWORDS.has(term)))].slice(0, 16)
}

function onTopic(candidate: string, prompt: string): boolean {
  const terms = topicTerms(prompt)
  if (!terms.length) return true
  const text = normalized(candidate)
  return terms.some(term => text.includes(term))
}

export function fallbackFollowups(prompt: string, sourceCount = 0): string[] {
  const entity = entityFromPrompt(prompt)
  if (MEASUREMENT_PROMPT.test(prompt)) {
    return [
      `What does the comparison used for ${entity} actually measure?`,
      `What does that ${entity} comparison leave uncontrolled or unmeasured?`,
    ]
  }
  if (sourceCount < 1) {
    return [
      `Explain the considerations already identified about ${entity}?`,
      `Explain what the answer does not establish about ${entity}?`,
    ]
  }
  if (PERSON_OR_ROLE_PROMPT.test(prompt)) {
    return [
      `Which source identifies ${entity}?`,
      `What would those sources not be enough to conclude about ${entity}?`,
    ]
  }
  return [
    `What published rule in the cited sources applies to ${entity}?`,
    `What do those same sources leave unresolved about ${entity}?`,
  ]
}

/** Failed turns must return to the original question, not compound the failed chip. */
export function repairFollowups(originPrompt: string): string[] {
  const topic = entityFromPrompt(originPrompt)
  return [
    `What do current published rules state about ${topic}?`,
    `What do those same rules leave unresolved about ${topic}?`,
  ]
}

function valid(candidate: unknown, prompt: string): candidate is string {
  const question = clean(candidate)
  return question.length >= MIN_LENGTH
    && question.length <= MAX_LENGTH
    && question.endsWith('?')
    && normalized(question) !== normalized(prompt)
    && onTopic(question, prompt)
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
