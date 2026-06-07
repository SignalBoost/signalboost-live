'use client'

import { useI18n } from '@/components/i18n/I18nProvider'

export function useTranslation() {
  const { dict, lang, locale, setLang } = useI18n()
  function t(key: string, fallback = key, values?: Record<string, string | number>) {
    const template = dict[key] || fallback
    if (!values) return template
    return Object.entries(values).reduce(
      (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
      template,
    )
  }
  function tList(prefix: string) {
    return Object.keys(dict)
      .filter((key) => key.startsWith(`${prefix}.`))
      .sort((a, b) => Number(a.split('.').pop()) - Number(b.split('.').pop()))
      .map((key) => dict[key])
  }
  return { t, tList, lang, locale, setLang }
}
