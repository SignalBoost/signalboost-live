'use client'

import { useTranslation } from '@/components/i18n/useTranslation'
import { approvedAuditRemediationText } from '@/lib/i18n/approvedAuditRemediationCopy'
import { auditUiText } from '@/lib/i18n/auditUiCopy'

export function LocalizedText({ fallback }: { fallback: string }) {
  const { lang } = useTranslation()
  return <>{approvedAuditRemediationText(lang, fallback) ?? auditUiText(lang, fallback)}</>
}
