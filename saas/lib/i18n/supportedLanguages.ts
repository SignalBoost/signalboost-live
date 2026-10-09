// saas/lib/i18n/supportedLanguages.ts
export const SUPPORTED_LANGUAGES = ['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar'] as const

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en'

export const SUPPORTED_LANGUAGE_NAMES: Readonly<Record<SupportedLanguage, string>> = Object.freeze({
  en: 'English',
  es: 'Spanish',
  pt: 'Portuguese',
  pl: 'Polish',
  ru: 'Russian',
  de: 'German',
  fr: 'French',
  it: 'Italian',
  ja: 'Japanese',
  ko: 'Korean',
  ar: 'Arabic',
})

/** Native (endonym) names for language pickers. */
export const SUPPORTED_LANGUAGE_NATIVE_NAMES: Readonly<Record<SupportedLanguage, string>> = Object.freeze({
  en: 'English',
  es: 'Español',
  pt: 'Português',
  pl: 'Polski',
  ru: 'Русский',
  de: 'Deutsch',
  fr: 'Français',
  it: 'Italiano',
  ja: '日本語',
  ko: '한국어',
  ar: 'العربية',
})

const RTL_LANGUAGE_SET = new Set<string>(['ar'])

export function writingDirection(value: unknown): 'ltr' | 'rtl' {
  const base = String(value || '').trim().toLowerCase().split(/[-_]/, 1)[0]
  return RTL_LANGUAGE_SET.has(base) ? 'rtl' : 'ltr'
}

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
