'use client'
import { useI18n } from '@/components/i18n/I18nProvider'

export function useTranslation() {
  const { dict, lang, setLang } = useI18n()

  function t(key: string, fallback?: string): string {
    const value = dict[key]
    if (typeof value === 'string') return value
    if (fallback) return fallback
    return key
  }

  return { t, lang, setLang, dict }
}
