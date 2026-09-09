import type { IdentityLanguage, PublicIdentityIntent } from './publicConciergeIdentity.ts'

type IdentityIntentReasoner = (args: Record<string, unknown>) => Promise<{ text?: string } | null>

export type SemanticPublicIdentity = Readonly<{
  intent: PublicIdentityIntent
  language: IdentityLanguage
}>

async function defaultReasoner(args: Record<string, unknown>) {
  const { callCosReasoner } = await import('./cosReasoner.ts')
  return callCosReasoner(args as never)
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
