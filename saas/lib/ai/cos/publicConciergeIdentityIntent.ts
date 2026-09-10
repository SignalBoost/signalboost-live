// saas/lib/ai/cos/publicConciergeIdentityIntent.ts
import type { IdentityLanguage, PublicIdentityIntent } from './publicConciergeIdentity.ts'

type IdentityIntentReasoner = (args: Record<string, unknown>) => Promise<{ text?: string } | null>

export type SemanticPublicIdentity = Readonly<{
  intent: PublicIdentityIntent
  language: IdentityLanguage
}>

// Routing classifiers are short JSON verdicts that run BEFORE the answer path on the public browser
// ingress. Unbounded, a slow model turn here consumed the time the answer needed and Vercel killed
// the request at maxDuration ("the page stopped waiting"). A verdict not reached within this window
// is treated exactly like any other missing verdict: fail closed to "not a match" and the request
// continues to the normal answer path. Shared env var across both routing classifiers.
const ROUTING_CLASSIFIER_DEFAULT_MS = 15_000

function routingClassifierDeadlineMs(): number {
  const configured = Number(process.env.COS_ROUTING_CLASSIFIER_TIMEOUT_MS)
  if (!Number.isFinite(configured) || configured <= 0) return ROUTING_CLASSIFIER_DEFAULT_MS
  return Math.min(30_000, Math.max(2_000, Math.floor(configured)))
}

async function withinRoutingDeadline<T>(stage: string, run: Promise<T | null>): Promise<T | null> {
  const deadlineMs = routingClassifierDeadlineMs()
  let timer: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<'expired'>((resolve) => { timer = setTimeout(() => resolve('expired'), deadlineMs) })
  try {
    const outcome = await Promise.race([run.catch(() => null), expired])
    if (outcome === 'expired') {
      console.warn('[cos-routing-classifier-deadline]', JSON.stringify({ at: new Date().toISOString(), stage, deadlineMs, action: 'verdict_abandoned_request_continues_to_answer_path' }))
      return null
    }
    return outcome
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function defaultReasoner(args: Record<string, unknown>) {
  const { callCosReasoner } = await import('./cosReasoner.ts')
  return withinRoutingDeadline('public_identity', callCosReasoner(args as never))
}

const SUPPORTED_LANGUAGES = new Set<IdentityLanguage>(['en', 'es', 'pt', 'pl', 'ru'])
const MAX_IDENTITY_PROMPT_CHARS = 300

const SYSTEM_PROMPT = [
  'You are the deep-learning intent router for the public Concierge.',
  'Classify meaning, not keywords.',
  'platform_identity means the user asks for the existing company or platform name, identity, brand, or what this service is called.',
  'assistant_employer means the user asks who employs, owns, or operates the AI assistant itself.',
  'other means naming suggestions, renaming, domain ideas, branding work, third-party companies, or any unrelated request.',
  'A question asking what the current platform is named is platform_identity, never a request to generate names.',
  'Return only strict JSON: {"identity_intent":"platform_identity"|"assistant_employer"|"other","language":"en"|"es"|"pt"|"pl"|"ru"}.',
].join(' ')

export async function resolveSemanticPublicIdentity(
  prompt: string,
  callImpl: IdentityIntentReasoner = defaultReasoner,
): Promise<SemanticPublicIdentity | null> {
  const value = String(prompt || '').trim()
  if (!value || value.length > MAX_IDENTITY_PROMPT_CHARS) return null

  const result = await callImpl({
    temperature: 0,
    maxTokens: 40,
    jsonObject: true,
    frequencyPenalty: 0,
    presencePenalty: 0,
    systemPrompt: SYSTEM_PROMPT,
    prompt: value,
  }).catch(() => null)
  if (!result?.text) return null

  try {
    const parsed = JSON.parse(result.text) as { identity_intent?: unknown; language?: unknown }
    if (parsed.identity_intent !== 'platform_identity' && parsed.identity_intent !== 'assistant_employer') return null
    if (typeof parsed.language !== 'string' || !SUPPORTED_LANGUAGES.has(parsed.language as IdentityLanguage)) return null
    return Object.freeze({
      intent: parsed.identity_intent,
      language: parsed.language as IdentityLanguage,
    })
  } catch {
    return null
  }
}
