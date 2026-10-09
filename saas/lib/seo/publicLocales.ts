import { PLANNED_LANGUAGES, type PlannedLanguage } from '../i18n/localeExpansion.ts'

// Public marketing translations are complete independently of dashboard activation.
export const PUBLIC_LOCALES = PLANNED_LANGUAGES
export type PublicLocale = PlannedLanguage
export const PUBLIC_TOPICS = ['ai-website-builder', 'customer-reviews', 'ai-content', 'ai-lab'] as const
export type PublicTopic = (typeof PUBLIC_TOPICS)[number]
export const PUBLIC_LOCALE_NAMES: Record<PublicLocale, string> = {
  en: 'English', es: 'Español', pt: 'Português', pl: 'Polski', ru: 'Русский',
  de: 'Deutsch', fr: 'Français', it: 'Italiano', ja: '日本語', ko: '한국어', ar: 'العربية',
}

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
