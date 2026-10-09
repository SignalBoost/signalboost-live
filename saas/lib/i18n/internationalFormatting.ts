// Locale-aware presentation helpers for the eleven-language roadmap.
// These helpers do not activate pending user-facing locales.
import { writingDirection } from './localeExpansion.ts'
export const INTERNATIONAL_LOCALES = Object.freeze({
  en: 'en-US', es: 'es-ES', pt: 'pt-BR', pl: 'pl-PL', ru: 'ru-RU',
  de: 'de-DE', fr: 'fr-FR', it: 'it-IT', ja: 'ja-JP', ko: 'ko-KR', ar: 'ar-SA',
} as const)
export type InternationalLocale = keyof typeof INTERNATIONAL_LOCALES
export function canonicalIntlLocale(locale: string): string {
  const base = locale.trim().toLowerCase().split(/[-_]/, 1)[0]
  return Object.prototype.hasOwnProperty.call(INTERNATIONAL_LOCALES, base)
    ? INTERNATIONAL_LOCALES[base as InternationalLocale]
    : INTERNATIONAL_LOCALES.en
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
