'use client'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t as translate } from '@/lib/i18n/t'

export function useTranslation() {
  const { dict, lang, setLang } = useI18n()

  function t(key: string, fallback = key): string {
    return translate(dict, key, fallback)
  }

  return { t, lang, setLang, dict }
}
