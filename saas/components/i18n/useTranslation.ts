'use client'
import { useI18n } from '@/components/i18n/I18nProvider'

export function useTranslation() {
  const { dict, lang, setLang } = useI18n()

  function t(key: string, fallback?: string): string {
    // Walk the dot-path (e.g. "audio.title") through the nested dict,
    // instead of looking for a flat key literally named "audio.title".
    const value = key
      .split('.')
      .reduce<any>((acc, part) => {
        if (acc && typeof acc === 'object' && part in acc) {
          return acc[part]
        }
        return undefined
      }, dict)

    if (typeof value === 'string') return value
    if (fallback) return fallback
    return key
  }

  return { t, lang, setLang, dict }
}
