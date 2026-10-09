/** Candidate locales are NOT production enabled until full locale parity is certified. */
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from './supportedLanguages.ts'

export const PENDING_LANGUAGE_NAMES = Object.freeze({
  de: 'Deutsch',
  fr: 'Français',
  it: 'Italiano',
  ja: '日本語',
  ko: '한국어',
  ar: 'العربية',
} as const)

export type PendingLanguage = keyof typeof PENDING_LANGUAGE_NAMES
export type PlannedLanguage = SupportedLanguage | PendingLanguage

export const PENDING_LANGUAGES = Object.freeze(
  Object.keys(PENDING_LANGUAGE_NAMES) as PendingLanguage[],
)

/** Product roadmap only. Never use this for active language selection. */
export const PLANNED_LANGUAGES = Object.freeze([
  ...SUPPORTED_LANGUAGES,
  ...PENDING_LANGUAGES,
] as const)

const RTL_LANGUAGES = new Set<string>(['ar'])

export function writingDirection(locale: string): 'ltr' | 'rtl' {
  return RTL_LANGUAGES.has(locale.toLowerCase().split(/[-_]/, 1)[0]) ? 'rtl' : 'ltr'
}

export function isPendingLanguage(locale: unknown): locale is PendingLanguage {
  return typeof locale === 'string'
    && Object.prototype.hasOwnProperty.call(PENDING_LANGUAGE_NAMES, locale.toLowerCase())
}
