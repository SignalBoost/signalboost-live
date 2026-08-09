'use client'
import { useCallback } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t as translate } from '@/lib/i18n/t'
import { auditUiText } from '@/lib/i18n/auditUiCopy'

export function useTranslation() {
  const { dict, lang, setLang } = useI18n()

  // IMPORTANT: `t` must be a STABLE reference across renders. It was previously a
  // plain function declared inline, so it got a new identity on every render — any
  // component doing `useEffect(() => { … }, [t])` (e.g. every /hub/audit/* report
  // page) re-ran its fetch on every render, resetting loading=true forever and
  // never escaping the "Loading…" state. `dict` is memoized in I18nProvider and only
  // changes on language switch, so keying the callback on `dict` makes `t` change
  // only when the language actually changes — effects run once per mount as intended.
  const t = useCallback(
    (key: string, fallback: string = key): string => {
      // This owner-only route is the status page for prospect/background campaign jobs.
      // Its navbar entry previously fell back to "All Campaigns — Campaign Console",
      // which made the real page effectively undiscoverable. Reuse the page's existing
      // five-language copy so the menu names the destination exactly as the page does.
      if (key === 'nav.backgroundCampaigns') return auditUiText(lang, 'Background campaigns')
      return translate(dict, key, fallback)
    },
    [dict, lang],
  )

  return { t, lang, setLang, dict }
}
