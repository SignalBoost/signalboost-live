// saas/lib/outreach/localizeDrafts.ts
// Localize generated outreach copy through the SAME shared i18n engine used by
// long-form generated platform content. The UI locale is authoritative for this
// operation; no parallel outreach-only translator is maintained here.

import { translateGeneratedContent } from '@/lib/i18n/contentTranslation'
import { normalizeReportLang, type ReportLang } from '@/lib/i18n/reportLanguage'

export async function localizeOutreachDrafts(params: {
  admin: any
  outreachIds: string[]
  locale: string
}): Promise<{ localized: number; failed: number; locale: ReportLang; errors: string[] }> {
  const locale = normalizeReportLang(params.locale)
  const ids = Array.from(new Set((params.outreachIds || []).map(String).filter(Boolean))).slice(0, 60)
  if (!ids.length) return { localized: 0, failed: 0, locale, errors: [] }

  const { data, error } = await params.admin
    .from('outreach_queue')
    .select('id,outreach_message,status')
    .in('id', ids)
    .eq('status', 'pending')

  if (error) throw new Error(error.message)

  let localized = 0
  let failed = 0
  const errors: string[] = []

  // Small concurrent groups keep model use bounded while preserving one independent
  // translation per email. translateGeneratedContent preserves URLs, email addresses,
  // names, numbers and technical literals by contract.
  const rows = data || []
  for (let i = 0; i < rows.length; i += 6) {
    const batch = rows.slice(i, i + 6)
    const outcomes = await Promise.all(batch.map(async (row: any) => {
      const source = String(row.outreach_message || '')
      if (!source.trim()) return { ok: false, id: row.id, error: 'empty_outreach_message' }

      try {
        const translated = await translateGeneratedContent({
          segments: [{ id: String(row.id), text: source }],
          targetLanguage: locale,
        })
        const message = translated.segments[0]?.text || ''
        if (!message.trim()) return { ok: false, id: row.id, error: 'empty_localized_message' }

        const { error: updateError } = await params.admin
          .from('outreach_queue')
          .update({ outreach_message: message })
          .eq('id', row.id)
          .eq('status', 'pending')

        if (updateError) return { ok: false, id: row.id, error: updateError.message }
        return { ok: true, id: row.id }
      } catch (err: any) {
        return { ok: false, id: row.id, error: String(err?.message || err || 'localization_failed') }
      }
    }))

    for (const outcome of outcomes) {
      if (outcome.ok) localized += 1
      else {
        failed += 1
        if (errors.length < 5) errors.push(`${outcome.id}:${outcome.error}`)
      }
    }
  }

  return { localized, failed, locale, errors }
}
