// saas/lib/outreach/localeOutreach.ts
// Dynamic outreach localization through the platform's shared generated-content i18n engine.
// The caller supplies the locale selected by the user at runtime. No language is hardcoded
// as an outreach policy here; en/es/pt/pl/ru all use the same path.

import { translateGeneratedContent } from '@/lib/i18n/contentTranslation'
import { normalizeReportLang, type ReportLang } from '@/lib/i18n/reportLanguage'

export type LocalizableOutreach = { id: string; text: string }

export async function localizeOutreachMessages(
  rows: LocalizableOutreach[],
  locale: string | null | undefined,
): Promise<{ locale: ReportLang; messages: Map<string, string>; failed: string[] }> {
  const targetLanguage = normalizeReportLang(locale)
  const messages = new Map<string, string>()
  const failed: string[] = []
  const clean = rows
    .map(row => ({ id: String(row.id || '').trim(), text: String(row.text || '') }))
    .filter(row => row.id && row.text.trim())

  if (!clean.length) return { locale: targetLanguage, messages, failed }

  if (targetLanguage === 'en') {
    for (const row of clean) messages.set(row.id, row.text)
    return { locale: targetLanguage, messages, failed }
  }

  // Queue GET historically passed every pending row here before returning any data.
  // That turned a database read into many serial AI calls and made Contacts time out.
  // Release-time localization uses explicit body:/subject: ids (or the single "message"
  // id), so raw-id batches larger than two are display previews and must stay off the
  // blocking server path. GeneratedContentLocalizer translates the rendered rows instead.
  const bulkDisplayPreview = clean.length > 2 && clean.every(row =>
    row.id !== 'message' && !row.id.startsWith('body:') && !row.id.startsWith('subject:'),
  )
  if (bulkDisplayPreview) {
    for (const row of clean) messages.set(row.id, row.text)
    return { locale: targetLanguage, messages, failed }
  }

  // Keep each translation request comfortably below the shared engine's segment/character
  // ceilings. Release-time batches contain only the messages that are actually being sent.
  let batch: LocalizableOutreach[] = []
  let chars = 0

  const flush = async () => {
    if (!batch.length) return
    try {
      const translated = await translateGeneratedContent({
        segments: batch.map(row => ({ id: row.id, text: row.text })),
        targetLanguage,
      })
      for (const segment of translated.segments) messages.set(segment.id, segment.text)
      for (const row of batch) if (!messages.has(row.id)) failed.push(row.id)
    } catch {
      for (const row of batch) failed.push(row.id)
    }
    batch = []
    chars = 0
  }

  for (const row of clean) {
    if (batch.length >= 12 || chars + row.text.length > 18_000) await flush()
    batch.push(row)
    chars += row.text.length
  }
  await flush()

  // Never replace usable source copy with an empty/error result. A failed localization
  // stays readable and, more importantly, cannot silently become an empty outbound email.
  for (const row of clean) if (!messages.has(row.id)) messages.set(row.id, row.text)

  return { locale: targetLanguage, messages, failed }
}

export async function localizeOutreachMessage(
  text: string,
  locale: string | null | undefined,
): Promise<{ locale: ReportLang; text: string; localized: boolean }> {
  const result = await localizeOutreachMessages([{ id: 'message', text }], locale)
  const translated = result.messages.get('message') || String(text || '')
  return { locale: result.locale, text: translated, localized: !result.failed.includes('message') }
}
