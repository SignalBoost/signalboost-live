import { callLocalModel, localInferenceConfigFromEnv } from '@/lib/ai/local-inference'
import { fallbackFollowups, repairFollowups, validateSuggestedFollowups } from './suggestedFollowupPolicy.ts'

export type FollowupSource = { title?: unknown }

const LOCAL_TIMEOUT_MS = 1_500

function clean(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function sourceTitles(sources: FollowupSource[]): string[] {
  return [...new Set(sources.map(source => clean(source?.title)).filter(Boolean))].slice(0, 8)
}

function parseFollowups(text: string): unknown {
  try {
    const parsed = JSON.parse(text)
    return parsed?.followups
  } catch {
    return null
  }
}

function removeUnsupportedSourceQuestions(value: unknown, titles: string[]): unknown {
  if (titles.length || !Array.isArray(value)) return value
  return value.filter(candidate => !/\b(?:source|sources|retrieved|citation|citations|live\s*\d+)\b/i.test(clean(candidate)))
}

async function boundedLocalJson(prompt: string, reply: string, titles: string[]): Promise<unknown> {
  const result = await Promise.race([
    callLocalModel({
      systemPrompt: [
        'Return ONLY strict JSON: {"followups":["question one?","question two?"]}.',
        'Produce exactly two questions. Use only the original user question, answer, and source titles.',
        'Each question must stay on that original topic and be answerable from those strings.',
        'If SOURCE TITLES is empty, do not ask which source, citation, or retrieved evidence supports anything.',
        'Ask what a cited measure includes, or what it does not include, only when the supplied answer or source titles support that wording.',
        'Do not ask for causes, motives, discrimination, or legal conclusions the text did not state.',
        'Do not ask what LIVE2 or another citation id defines unless that title is in SOURCE TITLES.',
        'Do not introduce a person, event, date, number, or claim absent from those strings.',
        'Questions only; do not answer them or assert facts.',
      ].join(' '),
      prompt: `ORIGINAL USER QUESTION:\n${prompt}\n\nANSWER:\n${reply}\n\nSOURCE TITLES:\n${titles.join('\n') || '(none)'}`,
      maxTokens: 120,
      temperature: 0,
    }, { ...localInferenceConfigFromEnv(), timeoutMs: LOCAL_TIMEOUT_MS }),
    new Promise<null>(resolve => setTimeout(() => resolve(null), LOCAL_TIMEOUT_MS)),
  ])
  return typeof result === 'string' ? parseFollowups(result) : null
}

/** Optional post-answer product surface. It never changes answer generation or provenance. */
export async function suggestFollowups(args: {
  prompt: string
  reply: string
  sources?: FollowupSource[]
  failedClosed?: boolean
  originPrompt?: string
}): Promise<string[]> {
  const prompt = clean(args.prompt)
  if (!prompt) return []
  const origin = clean(args.originPrompt) || prompt
  const titles = sourceTitles(args.sources || [])
  const fallback = args.failedClosed ? repairFollowups(origin) : fallbackFollowups(origin, titles.length)
  if (args.failedClosed || !clean(args.reply)) return validateSuggestedFollowups([], prompt, fallback)
  try {
    const generated = await boundedLocalJson(origin, clean(args.reply).slice(0, 4_000), titles)
    return validateSuggestedFollowups(removeUnsupportedSourceQuestions(generated, titles), prompt, fallback)
  } catch {
    return validateSuggestedFollowups([], prompt, fallback)
  }
}
