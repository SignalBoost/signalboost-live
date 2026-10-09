import { SUPPORTED_LANGUAGES, SUPPORTED_LANGUAGE_NATIVE_NAMES, type SupportedLanguage } from '../i18n/supportedLanguages.ts'

// Public marketing pages are published in every platform language.
export const PUBLIC_LOCALES = SUPPORTED_LANGUAGES
export type PublicLocale = SupportedLanguage
export const PUBLIC_TOPICS = ['ai-website-builder', 'customer-reviews', 'ai-content', 'ai-lab'] as const
export type PublicTopic = (typeof PUBLIC_TOPICS)[number]
export const PUBLIC_LOCALE_NAMES: Readonly<Record<PublicLocale, string>> = SUPPORTED_LANGUAGE_NATIVE_NAMES

export function isPublicLocale(value: unknown): value is PublicLocale {
  return typeof value === 'string' && PUBLIC_LOCALES.some(locale => locale === value)
}

export function isPublicTopic(value: unknown): value is PublicTopic {
  return typeof value === 'string' && PUBLIC_TOPICS.some(topic => topic === value)
}

export function publicLocaleFromPath(pathname: string | null): PublicLocale | null {
  const parts = (pathname || '').replace(/\/$/, '').split('/').slice(1)
  if (!isPublicLocale(parts[0])) return null
  if (parts.length === 1 || (parts.length === 2 && isPublicTopic(parts[1]))) return parts[0]
  return null
}

export function publicPagePath(locale: PublicLocale, topic?: PublicTopic): string {
  return `/${locale}${topic ? `/${topic}` : ''}`
}
