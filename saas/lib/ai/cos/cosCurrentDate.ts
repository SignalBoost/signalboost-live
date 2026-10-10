// saas/lib/ai/cos/cosCurrentDate.ts
//
// COS HAS A CLOCK (2026-10-09, owner-reported production defect).
// Production chat, Portuguese: "que anos nos estamos?" -> "Estamos em 2024 ... conforme a data atual do
// sistema", and "quem sera o proximo presidente do Brasil?" -> the October 2026 election described as still
// far away five days after its first round. Both questions route to the primary reasoner, whose prompt never
// contained today's date, so the model fell back to the year implied by its training data.
//
// This line gives the reasoner the server's real date on every turn. It is pure (the clock is injected) so
// tests can freeze time, and it changes once per UTC day, so it sits at the end of the prompt where it does
// not disturb the cached prompt prefix.

import { normalizeReportLang, type ReportLang } from '../../i18n/reportLanguage.ts'

const LOCALE: Readonly<Record<ReportLang, string>> = Object.freeze({
  en: 'en-US',
  es: 'es-ES',
  pt: 'pt-BR',
  pl: 'pl-PL',
  ru: 'ru-RU',
  de: 'de-DE',
  fr: 'fr-FR',
  it: 'it-IT',
  ja: 'ja-JP',
  ko: 'ko-KR',
  ar: 'ar-EG',
})

function formatFullDate(now: Date, locale: string): string {
  // Some locales end the full date with an abbreviation period (Russian "2026 г."); drop it so the sentence
  // terminator is not doubled.
  return new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }).format(now).replace(/\.$/, '')
}

/** The authoritative current-date instruction for the COS reasoner prompt. */
export function cosCurrentDateLine(language?: string | null, now: Date = new Date()): string {
  const iso = now.toISOString().slice(0, 10)
  const year = now.getUTCFullYear()
  const english = formatFullDate(now, LOCALE.en)
  const lang = normalizeReportLang(language)
  const localized = lang === 'en' ? '' : ` In the reply language: ${formatFullDate(now, LOCALE[lang])}.`
  return [
    `CURRENT DATE (authoritative, from the server clock): today is ${english} — ${iso} (UTC).${localized}`,
    'The user may be in another time zone, so near midnight UTC their local date can be one day earlier or later; when they ask for today\'s exact date, give this UTC date and say it is UTC.',
    `Use this date for the current day, month and year and for anything relative to it ("now", "today", "this year", "next", "upcoming", "recent", how long ago or how long until).`,
    `It overrides any year implied by your training data: never state that the current year is anything other than ${year}.`,
    'Anything scheduled before this date has already happened — never describe it as upcoming or far away; if you have no verified outcome for it, say so plainly.',
  ].join(' ')
}
