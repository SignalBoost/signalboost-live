'use client'

import { useI18n } from '@/components/i18n/I18nProvider'
import { approvedAuditRemediationText } from '@/lib/i18n/approvedAuditRemediationCopy'
import { auditUiText } from '@/lib/i18n/auditUiCopy'

export function LocalizedText({ fallback }: { fallback: string }) {
  const { lang } = useI18n()
  return <>{approvedAuditRemediationText(lang, fallback) ?? auditUiText(lang, fallback)}</>
}
