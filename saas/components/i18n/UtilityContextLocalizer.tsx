'use client'

// saas/components/i18n/UtilityContextLocalizer.tsx
// Public utilities store generated report summaries for the Concierge in one shared
// localStorage record. Some producers still emit their canonical English report text.
// Localize that shared boundary once instead of duplicating translation logic in every
// utility page. The canonical source is retained so language changes never translate a
// translation.

import { useEffect } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

const STORAGE_KEY = 'signalboost.concierge.utilityContext'
const EVENT_NAME = 'signalboost:concierge-utility-context'
const SUPPORTED = ['en', 'es', 'pt', 'pl', 'ru'] as const

type SupportedLanguage = (typeof SUPPORTED)[number]
type TranslationResponse = {
  ok?: boolean
  segments?: Array<{ id: string; text: string }>
}

function normalizeLanguage(value: string | null | undefined): SupportedLanguage {
  const short = String(value || 'en').slice(0, 2).toLowerCase()
  return SUPPORTED.includes(short as SupportedLanguage)
    ? short as SupportedLanguage
    : 'en'
}

export default function UtilityContextLocalizer() {
  const { lang } = useI18n()

  useEffect(() => {
    const targetLanguage = normalizeLanguage(lang)
    let cancelled = false
    let generation = 0

    const localizeStoredContext = async () => {
      const currentGeneration = ++generation

      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) return

        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return

        const currentReport = typeof parsed.report === 'string' ? parsed.report.trim() : ''
        const sourceReport = typeof parsed.sourceReport === 'string' && parsed.sourceReport.trim()
          ? parsed.sourceReport.trim()
          : currentReport
        if (!sourceReport) return

        let localizedReport = sourceReport
        if (targetLanguage !== 'en') {
          const response = await fetch('/api/i18n/translate-content', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              targetLanguage,
              contentKind: 'concierge-utility-context',
              segments: [{ id: 'utility-report', text: sourceReport }],
            }),
          })

          if (!response.ok) return
          const payload = await response.json().catch(() => null) as TranslationResponse | null
          const translated = payload?.segments?.find(segment => segment.id === 'utility-report')?.text
          if (!payload?.ok || !translated?.trim()) return
          localizedReport = translated.trim()
        }

        if (cancelled || currentGeneration !== generation) return

        const next = {
          ...parsed,
          sourceReport,
          report: localizedReport,
          localizedLanguage: targetLanguage,
        }
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
        window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { localized: true } }))
      } catch {
        // Utility context is an enhancement. Never block the page or Concierge if a stale
        // browser record is malformed or the translation service is temporarily unavailable.
      }
    }

    const onUtilityContext = (event: Event) => {
      if ((event as CustomEvent)?.detail?.localized) return
      void localizeStoredContext()
    }

    void localizeStoredContext()
    window.addEventListener(EVENT_NAME, onUtilityContext)

    return () => {
      cancelled = true
      window.removeEventListener(EVENT_NAME, onUtilityContext)
    }
  }, [lang])

  return null
}
