'use client'

import { useEffect, useRef } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import GeneratedContentLocalizer from '@/components/i18n/GeneratedContentLocalizer'
import UtilityContextLocalizer from '@/components/i18n/UtilityContextLocalizer'
import AssistantHistoryLayoutPatch from '@/components/AssistantHistoryLayoutPatch'

const SUPPORTED_LANGUAGES = ['en', 'es', 'pt', 'pl', 'ru'] as const

type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

function normalizeLanguage(value: string | null | undefined): SupportedLanguage {
  const short = String(value || 'en').slice(0, 2).toLowerCase()
  return SUPPORTED_LANGUAGES.includes(short as SupportedLanguage)
    ? short as SupportedLanguage
    : 'en'
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
      <UtilityContextLocalizer />
      <AssistantHistoryLayoutPatch />
      <AutoLanguageInitializer />
    </>
  )
}
