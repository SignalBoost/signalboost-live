'use client'

import { useI18n } from '@/components/i18n/I18nProvider'
import { marketingHomeText } from '@/lib/i18n/marketingHomeCopy'

function readPath(source: unknown, path: string): string | undefined {
  let current: unknown = source
  for (const segment of path.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return typeof current === 'string' ? current : undefined
}

export function useTranslation() {
  const { dict, lang } = useI18n()

  function t(key: string, fallback = key) {
    return readPath(dict, key) ?? marketingHomeText(lang, key) ?? fallback
  }

  return { t }
}
