import { getAccess } from '@/lib/auth/access'
import { callLocalModel, localInferenceConfigFromEnv } from '@/lib/ai/local-inference'
import { buildCascadePlan, type CascadePlan } from './cascadeContract.ts'
import { attachCascadePlanToStoredTurn, cascadeRootForClickedFollowup } from './cascadePersistence.ts'
import { fallbackFollowups, repairFollowups, validateSuggestedFollowups } from './suggestedFollowupPolicy.ts'

export type FollowupSource = { title?: unknown }

const LOCAL_TIMEOUT_MS = 1_500

function clean(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function emptyCascadePlan(): CascadePlan {
  return { root_topic_id: '', root_question: '', root_topic: '', candidates: [] }
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
        'Each question must stay on that original topic and must have a credible retrieval or evidence path.',
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

async function resolvedRoot(args: { prompt: string; reply: string; originPrompt?: string }): Promise<{ root: string; userId: string | null }> {
  const explicit = clean(args.originPrompt)
  const access = await getAccess().catch(() => null)
  const userId = access?.userId || null
  if (explicit) return { root: explicit, userId }
  if (userId) {
    const persisted = await cascadeRootForClickedFollowup(userId, args.prompt, args.reply)
    if (persisted) return { root: persisted, userId }
  }
  return { root: clean(args.prompt), userId }
}

export async function suggestFollowupCascade(args: {
  prompt: string
  reply: string
  sources?: FollowupSource[]
  failedClosed?: boolean
  originPrompt?: string
}): Promise<CascadePlan> {
  const prompt = clean(args.prompt)
  if (!prompt) return emptyCascadePlan()
  const { root: origin, userId } = await resolvedRoot({ prompt, reply: clean(args.reply), originPrompt: args.originPrompt })
  if (!origin) return emptyCascadePlan()
  const titles = sourceTitles(args.sources || [])
  const fallback = args.failedClosed ? repairFollowups(origin) : fallbackFollowups(origin, titles.length)

  let questions: string[]
  if (args.failedClosed || !clean(args.reply)) {
    questions = validateSuggestedFollowups([], origin, fallback)
  } else {
    try {
      const generated = await boundedLocalJson(origin, clean(args.reply).slice(0, 4_000), titles)
      questions = validateSuggestedFollowups(removeUnsupportedSourceQuestions(generated, titles), origin, fallback)
    } catch {
      questions = validateSuggestedFollowups([], origin, fallback)
    }
  }

  const plan = buildCascadePlan({ rootQuestion: origin, questions, sourceTitles: titles })
  if (userId && plan.candidates.length === 2 && clean(args.reply)) {
    await attachCascadePlanToStoredTurn(userId, clean(args.reply), plan)
  }
  return plan
}

/** Optional post-answer product surface. The UI still receives only two strings. */
export async function suggestFollowups(args: {
  prompt: string
  reply: string
  sources?: FollowupSource[]
  failedClosed?: boolean
  originPrompt?: string
}): Promise<string[]> {
  const plan = await suggestFollowupCascade(args)
  return plan.candidates.map(candidate => candidate.question)
}
