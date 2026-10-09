// Locale-aware presentation helpers for the eleven-language roadmap.
// These helpers do not activate pending user-facing locales.
import { writingDirection } from './supportedLanguages.ts'
export const INTERNATIONAL_LOCALES = Object.freeze({
  en: 'en-US', es: 'es-ES', pt: 'pt-BR', pl: 'pl-PL', ru: 'ru-RU',
  de: 'de-DE', fr: 'fr-FR', it: 'it-IT', ja: 'ja-JP', ko: 'ko-KR', ar: 'ar-SA',
} as const)
export type InternationalLocale = keyof typeof INTERNATIONAL_LOCALES
export function canonicalIntlLocale(locale: string): string {
  const input = String(locale || '').trim().replace(/_/g, '-')
  const base = input.toLowerCase().split('-', 1)[0]
  if (!Object.prototype.hasOwnProperty.call(INTERNATIONAL_LOCALES, base)) return INTERNATIONAL_LOCALES.en
  try {
    // Honor an explicitly chosen region (e.g. fr-CA, pt-PT) without widening
    // the platform's allowed language set or accepting arbitrary locale data.
    const candidate = new Intl.Locale(input)
    if (candidate.language.toLowerCase() === base) return candidate.toString()
  } catch { /* malformed BCP-47 tags fall back to the canonical regional default */ }
  return INTERNATIONAL_LOCALES[base as InternationalLocale]
}
export function formatLocalizedNumber(value: number, locale: string, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(canonicalIntlLocale(locale), options).format(value)
}
export function formatLocalizedDate(value: Date | number, locale: string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(canonicalIntlLocale(locale), { timeZone: 'UTC', ...options }).format(value)
}
export function languageDirection(locale: string): 'ltr' | 'rtl' {
  return writingDirection(locale)
}
