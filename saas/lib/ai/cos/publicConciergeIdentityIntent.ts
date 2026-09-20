// saas/lib/ai/cos/publicConciergeIdentityIntent.ts
import type { IdentityLanguage, PublicIdentityIntent } from './publicConciergeIdentity.ts'

type IdentityIntentReasoner = (args: Record<string, unknown>) => Promise<{ text?: string } | null>

export type SemanticPublicIdentity = Readonly<{
  intent: PublicIdentityIntent
  language: IdentityLanguage
}>

// Routing classifiers are optional control-plane verdicts, not answer generation.
// Keep them compact, no-thinking, and actually abortable so they can never consume the
// response budget that belongs to the user's answer.
const ROUTING_CLASSIFIER_DEFAULT_MS = 2_500

function routingClassifierDeadlineMs(): number {
  const configured = Number(process.env.COS_ROUTING_CLASSIFIER_TIMEOUT_MS)
  if (!Number.isFinite(configured) || configured <= 0) return ROUTING_CLASSIFIER_DEFAULT_MS
  return Math.min(5_000, Math.max(750, Math.floor(configured)))
}

async function defaultReasoner(args: Record<string, unknown>) {
  const { callCosReasoner } = await import('./cosReasoner.ts')
  const deadlineMs = routingClassifierDeadlineMs()
  const startedAt = Date.now()
  const result = await callCosReasoner({
    ...args,
    usageContext: { feature: 'cos_routing_classifier', purpose: 'public_identity' },
    disableThinking: true,
    timeoutMs: deadlineMs,
    allowConfiguredFallback: false,
    persistUsage: false,
  } as never).catch(() => null)
  if (!result && Date.now() - startedAt >= deadlineMs - 50) {
    console.warn('[cos-routing-classifier-deadline]', JSON.stringify({
      at: new Date().toISOString(),
      stage: 'public_identity',
      deadlineMs,
      action: 'transport_aborted_request_continues_to_answer_path',
    }))
  }
  return result
}

const SUPPORTED_LANGUAGES = new Set<IdentityLanguage>(['en', 'es', 'pt', 'pl', 'ru'])
const MAX_IDENTITY_PROMPT_CHARS = 300

const SEMANTIC_IDENTITY_CANDIDATE = [
  /\b(?:who|what) (?:are|is) (?:you|this (?:service|platform|company))\b/i,
  /\b(?:your|our|this) (?:name|company|platform|brand|employer)\b/i,
  /\b(?:who (?:owns|operates|employs)|work for|called)\b/i,
  /\b(?:quien|cual|como)\b[^\n]{0,80}\b(?:asistente|empresa|plataforma|marca|empleador|llama)\b/i,
  /\b(?:quem|qual|como)\b[^\n]{0,80}\b(?:assistente|empresa|plataforma|marca|empregador|chama)\b/i,
  /\b(?:kto|jak|jaka|jaki)\b[^\n]{0,80}\b(?:asystent|firma|platforma|marka|pracodawca|nazywa)\b/i,
  /(?:^|\s)(?:кто|что|как)\b[^\n]{0,80}\b(?:ассистент|компания|платформа|бренд|работодатель|называется)\b/i,
]

export function shouldResolveSemanticPublicIdentity(prompt: string): boolean {
  const value = String(prompt || '').trim()
  return Boolean(value)
    && value.length <= MAX_IDENTITY_PROMPT_CHARS
    && SEMANTIC_IDENTITY_CANDIDATE.some(pattern => pattern.test(value))
}

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
