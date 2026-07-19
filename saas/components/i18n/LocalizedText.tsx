'use client'

import { useTranslation } from '@/components/i18n/useTranslation'
import { auditUiText } from '@/lib/i18n/auditUiCopy'

export function LocalizedText({ fallback }: { fallback: string }) {
  const { lang } = useTranslation()
  return <>{auditUiText(lang, fallback)}</>
}
