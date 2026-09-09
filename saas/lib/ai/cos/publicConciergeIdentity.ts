type PublicIdentityReply = Readonly<{ reply: string; source: string }>
type IdentityLanguage = 'en' | 'es' | 'pt' | 'pl' | 'ru'

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
      /(?:^| )кто (?:твои|ваш) работодатель(?: |$)/,
      /(?:^| )как называется (?:твои|ваш) работодатель(?: |$)/,
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
    /\bwhat (?:is|s) (?:the )?name of (?:our|this) company\b/,
    /\bwhat (?:is|s) (?:our|this) company(?:s)? name\b/,
    /\bwhat (?:is|s) (?:the )?(?:platform|company) called\b/,
  ] },
  { language: 'es', patterns: [/\bcual es (?:el )?nombre de (?:nuestra|esta) empresa\b/, /\bcomo se llama (?:nuestra|esta) empresa\b/] },
  { language: 'pt', patterns: [/\bqual e (?:o )?nome (?:da nossa|desta) empresa\b/, /\bcomo se chama (?:a nossa|esta) empresa\b/] },
  { language: 'pl', patterns: [/\bjak nazywa sie (?:nasza|ta) firma\b/, /\bjaka jest nazwa (?:naszej|tej) firmy\b/] },
  { language: 'ru', patterns: [/(?:^| )как называется (?:наша|эта) компания(?: |$)/, /(?:^| )какое название у (?:нашей|этой) компании(?: |$)/] },
]

const COMPANY_NAME_REPLIES: Readonly<Record<IdentityLanguage, string>> = Object.freeze({
  en: 'Our company and public platform are named iTMounts.',
  es: 'Nuestra empresa y plataforma pública se llaman iTMounts.',
  pt: 'Nossa empresa e plataforma pública se chamam iTMounts.',
  pl: 'Nasza firma i publiczna platforma nazywają się iTMounts.',
  ru: 'Наша компания и публичная платформа называются iTMounts.',
})

const IDENTITY_REPLIES: Readonly<Record<IdentityLanguage, string>> = Object.freeze({
  en: 'I’m iTMounts Concierge, an AI assistant—not a person—so I do not have an employer.',
  es: 'Soy iTMounts Concierge, un asistente de IA, no una persona, así que no tengo empleador.',
  pt: 'Sou o iTMounts Concierge, um assistente de IA, não uma pessoa, portanto não tenho empregador.',
  pl: 'Jestem iTMounts Concierge, asystentem sztucznej inteligencji, a nie osobą, więc nie mam pracodawcy.',
  ru: 'Я — iTMounts Concierge, ИИ-ассистент, а не человек, поэтому у меня нет работодателя.',
})

/**
 * Public Concierge has no human employment history. Intercept only direct questions
 * about who employs Concierge, across all five supported languages. Third-party topics
 * such as employer branding or hiring continue through normal reasoning.
 */
export function publicConciergeIdentityReply(prompt: string): PublicIdentityReply | null {
  const normalized = normalizedQuestion(prompt)
  if (!normalized) return null

  for (const rule of COMPANY_NAME_QUESTIONS) {
    if (!rule.patterns.some((pattern) => pattern.test(normalized))) continue
    return Object.freeze({
      reply: COMPANY_NAME_REPLIES[rule.language],
      source: 'concierge-public-company-identity',
    })
  }

  for (const rule of EMPLOYER_QUESTIONS) {
    if (!rule.patterns.some((pattern) => pattern.test(normalized))) continue
    return Object.freeze({
      reply: IDENTITY_REPLIES[rule.language],
      source: 'concierge-public-identity',
    })
  }
  return null
}
