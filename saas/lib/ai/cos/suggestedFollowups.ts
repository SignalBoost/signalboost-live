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

async function boundedLocalJson(prompt: string, reply: string, titles: string[]): Promise<unknown> {
  const result = await Promise.race([
    callLocalModel({
      systemPrompt: [
        'Return ONLY strict JSON: {"followups":["question one?","question two?"]}.',
        'Produce exactly two questions. Use only the user question, answer, and source titles supplied.',
        'Do not introduce a person, event, date, number, or claim absent from those strings.',
        'Questions only; do not answer them or assert facts.',
      ].join(' '),
      prompt: `USER QUESTION:\n${prompt}\n\nANSWER:\n${reply}\n\nSOURCE TITLES:\n${titles.join('\n') || '(none)'}`,
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
}): Promise<string[]> {
  const prompt = clean(args.prompt)
  if (!prompt) return []
  const fallback = args.failedClosed ? repairFollowups(prompt) : fallbackFollowups(prompt)
  if (args.failedClosed || !clean(args.reply)) return validateSuggestedFollowups([], prompt, fallback)
  try {
    const generated = await boundedLocalJson(prompt, clean(args.reply).slice(0, 4_000), sourceTitles(args.sources || []))
    return validateSuggestedFollowups(generated, prompt, fallback)
  } catch {
    return validateSuggestedFollowups([], prompt, fallback)
  }
}
