import { PUBLIC_BRAND } from '../../public-brand.ts'

type PublicIdentityReply = Readonly<{ reply: string; source: string }>
export type IdentityLanguage = 'en' | 'es' | 'pt' | 'pl' | 'ru'
export type PublicIdentityIntent = 'platform_identity' | 'assistant_employer'

function normalizedQuestion(prompt: string): string {
  return String(prompt || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/([\p{Script=Latin}])\p{M}+/gu, '$1')
    .normalize('NFC')
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

const EMPLOYER_QUESTIONS: readonly Readonly<{
  language: IdentityLanguage
  patterns: readonly RegExp[]
}>[] = [
  {
    language: 'en',
    patterns: [
      /\b(?:who (?:is|s)|what(?: is|s)?) your(?: [a-z]+){0,2} employer\b/,
      /\bwhat (?:is|s) (?:the )?name of your employer\b/,
      /\bwho employs you\b/,
      /\bwho do you work for\b/,
    ],
  },
  {
    language: 'es',
    patterns: [
      /\bquien es tu empleador\b/,
      /\bcual es (?:el )?nombre de tu empleador\b/,
      /\bquien te emplea\b/,
      /\bpara quien trabajas\b/,
    ],
  },
  {
    language: 'pt',
    patterns: [
      /\bquem e (?:o )?seu empregador\b/,
      /\bqual e (?:o )?nome do seu empregador\b/,
      /\bquem te emprega\b/,
      /\bpara quem voce trabalha\b/,
    ],
  },
  {
    language: 'pl',
    patterns: [
      /\bkto jest twoim pracodawca\b/,
      /\bjak nazywa sie twoj pracodawca\b/,
      /\bdla kogo pracujesz\b/,
    ],
  },
  {
    language: 'ru',
    patterns: [
      /(?:^| )кто (?:твой|ваш) работодатель(?: |$)/,
      /(?:^| )как называется (?:твой|ваш) работодатель(?: |$)/,
      /(?:^| )на кого ты работаешь(?: |$)/,
      /(?:^| )на кого вы работаете(?: |$)/,
    ],
  },
]

const COMPANY_NAME_QUESTIONS: readonly Readonly<{
  language: IdentityLanguage
  patterns: readonly RegExp[]
}>[] = [
  { language: 'en', patterns: [
    /\bwhat (?:is|s) (?:the )?name of (?:our|this) (?:company|platform)\b/,
    /\bwhat (?:is|s) (?:our|this) company(?:s)? name\b/,
    /\bwhat (?:is|s) (?:the )?(?:platform|company) called\b/,
  ] },
  { language: 'es', patterns: [/\bcual es (?:el )?nombre de (?:nuestra|esta) empresa\b/, /\bcomo se llama (?:nuestra|esta) empresa\b/] },
  { language: 'pt', patterns: [/\bqual e (?:o )?nome (?:da nossa|desta) empresa\b/, /\bcomo se chama (?:a nossa|esta) empresa\b/] },
  { language: 'pl', patterns: [/\bjak nazywa sie (?:nasza|ta) firma\b/, /\bjaka jest nazwa (?:naszej|tej) firmy\b/] },
  { language: 'ru', patterns: [/(?:^| )как называется (?:наша|эта) компания(?: |$)/, /(?:^| )какое название у (?:нашей|этой) компании(?: |$)/] },
]

const COMPANY_NAME_REPLIES: Readonly<Record<IdentityLanguage, string>> = Object.freeze({
  en: `Our company and public platform are named ${PUBLIC_BRAND.name}.`,
  es: `Nuestra empresa y plataforma pública se llaman ${PUBLIC_BRAND.name}.`,
  pt: `Nossa empresa e plataforma pública se chamam ${PUBLIC_BRAND.name}.`,
  pl: `Nasza firma i publiczna platforma nazywają się ${PUBLIC_BRAND.name}.`,
  ru: `Наша компания и публичная платформа называются ${PUBLIC_BRAND.name}.`,
})

const IDENTITY_REPLIES: Readonly<Record<IdentityLanguage, string>> = Object.freeze({
  en: `I’m the ${PUBLIC_BRAND.name} Concierge, the public AI assistant for ${PUBLIC_BRAND.name}.`,
  es: `Soy el Concierge de ${PUBLIC_BRAND.name}, el asistente público de IA de ${PUBLIC_BRAND.name}.`,
  pt: `Sou o Concierge da ${PUBLIC_BRAND.name}, o assistente público de IA da ${PUBLIC_BRAND.name}.`,
  pl: `Jestem Concierge ${PUBLIC_BRAND.name}, publicznym asystentem AI platformy ${PUBLIC_BRAND.name}.`,
  ru: `Я — Concierge ${PUBLIC_BRAND.name}, публичный ИИ-ассистент платформы ${PUBLIC_BRAND.name}.`,
})

export function publicConciergeIdentityReplyForIntent(
  intent: PublicIdentityIntent,
  language: IdentityLanguage = 'en',
): PublicIdentityReply {
  if (intent === 'platform_identity') {
    return Object.freeze({
      reply: COMPANY_NAME_REPLIES[language],
      source: 'concierge-public-company-identity',
    })
  }
  return Object.freeze({
    reply: IDENTITY_REPLIES[language],
    source: 'concierge-public-identity',
  })
}

/**
 * Fast path for obvious public organizational-identity wording. The deep semantic
 * identity router handles unmatched wording; deterministic code supplies only the
 * canonical iTMounts fact once the intent is known.
 */
export function publicConciergeIdentityReply(prompt: string): PublicIdentityReply | null {
  const normalized = normalizedQuestion(prompt)
  if (!normalized) return null

  for (const rule of COMPANY_NAME_QUESTIONS) {
    if (!rule.patterns.some((pattern) => pattern.test(normalized))) continue
    return publicConciergeIdentityReplyForIntent('platform_identity', rule.language)
  }

  for (const rule of EMPLOYER_QUESTIONS) {
    if (!rule.patterns.some((pattern) => pattern.test(normalized))) continue
    return publicConciergeIdentityReplyForIntent('assistant_employer', rule.language)
  }
  return null
}
