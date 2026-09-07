// Semantic request understanding for Concierge and owner Assistant.
//
// Production behavior must not depend on magic commands such as "fix it" or on a vocabulary
// regex. COS reads the current request together with recent conversational context and decides
// whether it understands both the requested action and its referent. If it does not, callers ask
// one natural clarification and take no external action.

type RequestUnderstandingReasoner = (args: Record<string, unknown>) => Promise<{ text?: string } | null>

export type RequestUnderstanding = Readonly<{
  needsClarification: boolean
  missing: 'action' | 'referent' | 'both' | 'none'
  softwareRepairIntent: boolean
}>

async function defaultReasoner(args: Record<string, unknown>) {
  const { callCosReasoner } = await import('./cosReasoner.ts')
  return callCosReasoner(args as never)
}

const SYSTEM_PROMPT = [
  'You classify the meaning of a human request from conversation, not keywords.',
  'Use the current user message and the recent conversation context together.',
  'Return ONLY strict JSON with exactly these fields:',
  '{"needs_clarification":boolean,"missing":"action|referent|both|none","software_repair_intent":boolean}.',
  'needs_clarification is true only when a useful response or requested action cannot be determined confidently because the requested action, the thing it refers to, or both are missing.',
  'A normal factual question, explanation request, complete creative request, or complete task is not ambiguous merely because it is short.',
  'A bare follow-up such as an agreement or imperative can be fully understood when the recent conversation clearly supplies what it refers to.',
  'When the current message refers to something that is not present in the supplied recent context, set needs_clarification true and mark referent or both as missing.',
  'software_repair_intent is true only when the human is actually asking or agreeing to change, repair, debug, or otherwise modify software. Merely pasting evidence, asking what failed, or discussing a repair is false.',
  'Do not infer mutation authority. Authority is enforced separately by the application.',
  'Judge meaning semantically in any language. Do not use or describe keyword matching.',
  'Do not explain your answer and do not add fields.',
].join(' ')

function bounded(value: string, maxChars: number): string {
  const text = String(value || '').trim()
  if (text.length <= maxChars) return text
  const tail = Math.max(1, Math.floor(maxChars * 0.7))
  const head = Math.max(1, maxChars - tail)
  return `${text.slice(0, head)}\n[…context omitted…]\n${text.slice(-tail)}`
}

function parseResult(raw: string): RequestUnderstanding | null {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>
    const missing = parsed.missing
    if (typeof parsed.needs_clarification !== 'boolean') return null
    if (typeof parsed.software_repair_intent !== 'boolean') return null
    if (!['action', 'referent', 'both', 'none'].includes(String(missing))) return null
    return {
      needsClarification: parsed.needs_clarification,
      missing: String(missing) as RequestUnderstanding['missing'],
      softwareRepairIntent: parsed.software_repair_intent,
    }
  } catch {
    return null
  }
}

export async function understandRequest(
  input: Readonly<{
    prompt: string
    previousUserPrompt?: string
    priorAnswer?: string
    hasAttachments?: boolean
  }>,
  callImpl: RequestUnderstandingReasoner = defaultReasoner,
): Promise<RequestUnderstanding | null> {
  const prompt = String(input.prompt || '').trim()
  if (!prompt && !input.hasAttachments) {
    return { needsClarification: true, missing: 'both', softwareRepairIntent: false }
  }

  const result = await callImpl({
    temperature: 0,
    maxTokens: 64,
    jsonObject: true,
    frequencyPenalty: 0,
    presencePenalty: 0,
    systemPrompt: SYSTEM_PROMPT,
    prompt: [
      `RECENT PREVIOUS USER MESSAGE:\n${bounded(String(input.previousUserPrompt || ''), 6_000) || '[none]'}`,
      `RECENT ASSISTANT ANSWER:\n${bounded(String(input.priorAnswer || ''), 3_000) || '[none]'}`,
      `CURRENT USER MESSAGE:\n${bounded(prompt, 8_000) || '[no text]'}`,
      `CURRENT ATTACHMENTS PRESENT: ${input.hasAttachments ? 'yes' : 'no'}`,
    ].join('\n\n'),
  }).catch(() => null)

  // If semantic understanding is unavailable, do not invent ambiguity and do not manufacture
  // repair intent. Ordinary COS reasoning may still answer; mutation-specific lanes remain closed.
  if (!result?.text) return null
  return parseResult(result.text)
}

const CLARIFICATION_COPY = Object.freeze({
  en: {
    action: 'What would you like me to do with this?',
    referent: 'What would you like me to work on?',
    both: 'What would you like me to do?',
    none: 'What would you like me to do?',
  },
  es: {
    action: '¿Qué quieres que haga con esto?',
    referent: '¿En qué quieres que trabaje?',
    both: '¿Qué quieres que haga?',
    none: '¿Qué quieres que haga?',
  },
  pt: {
    action: 'O que você gostaria que eu fizesse com isso?',
    referent: 'Em que você gostaria que eu trabalhasse?',
    both: 'O que você gostaria que eu fizesse?',
    none: 'O que você gostaria que eu fizesse?',
  },
  pl: {
    action: 'Co mam z tym zrobić?',
    referent: 'Nad czym mam pracować?',
    both: 'Co chcesz, żebym zrobił?',
    none: 'Co chcesz, żebym zrobił?',
  },
  ru: {
    action: 'Что вы хотите, чтобы я с этим сделал?',
    referent: 'Над чем вы хотите, чтобы я поработал?',
    both: 'Что вы хотите, чтобы я сделал?',
    none: 'Что вы хотите, чтобы я сделал?',
  },
})

export function clarificationQuestion(
  language: string,
  missing: RequestUnderstanding['missing'],
): string {
  const locale = (['en', 'es', 'pt', 'pl', 'ru'].includes(String(language).toLowerCase())
    ? String(language).toLowerCase()
    : 'en') as keyof typeof CLARIFICATION_COPY
  return CLARIFICATION_COPY[locale][missing]
}
