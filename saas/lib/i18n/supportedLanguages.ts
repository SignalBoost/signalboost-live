export const SUPPORTED_LANGUAGES = ['en', 'es', 'pt', 'pl', 'ru'] as const

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en'

export const SUPPORTED_LANGUAGE_NAMES: Readonly<Record<SupportedLanguage, string>> = Object.freeze({
  en: 'English',
  es: 'Spanish',
  pt: 'Portuguese',
  pl: 'Polish',
  ru: 'Russian',
})

const SUPPORTED_LANGUAGE_SET = new Set<string>(SUPPORTED_LANGUAGES)

export function normalizeSupportedLanguage(
  value: unknown,
  fallback: SupportedLanguage = DEFAULT_LANGUAGE,
): SupportedLanguage {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return fallback
  const base = raw.split(/[-_]/, 1)[0]
  return SUPPORTED_LANGUAGE_SET.has(base) ? base as SupportedLanguage : fallback
}

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return typeof value === 'string' && SUPPORTED_LANGUAGE_SET.has(value.toLowerCase())
}
