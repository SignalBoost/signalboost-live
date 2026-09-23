'use client'

import { useEffect, useRef } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import GeneratedContentLocalizer from '@/components/i18n/GeneratedContentLocalizer'
import AssistantHistoryLayoutPatch from '@/components/AssistantHistoryLayoutPatch'
import { normalizeSupportedLanguage } from '@/lib/i18n/supportedLanguages'

function normalizeLanguage(value: string | null | undefined) {
  return normalizeSupportedLanguage(value)
}

function AutoLanguageInitializer() {
  const { lang, setLang } = useI18n()
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current || typeof window === 'undefined') return
    initialized.current = true

    const saved =
      localStorage.getItem('signalboost_language') ||
      localStorage.getItem('site-language')

    if (saved) return

    const browserLanguage =
      navigator.languages?.find(Boolean) ||
      navigator.language
    const detected = normalizeLanguage(browserLanguage)

    if (detected !== normalizeLanguage(lang)) {
      void setLang(detected)
    }
  }, [lang, setLang])

  return null
}

export default function LanguageSuggestion() {
  return (
    <>
      <GeneratedContentLocalizer />
      <AssistantHistoryLayoutPatch />
      <AutoLanguageInitializer />
    </>
  )
}
