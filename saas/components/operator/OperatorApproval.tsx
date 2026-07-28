'use client'

import { useTranslation } from '@/components/i18n/useTranslation'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


export default function OperatorApproval({ loading, onApprove }: { loading?: boolean; onApprove: () => void }) {
  const { t } = useTranslation()
  return <button className="sb-button-ghost" onClick={onApprove} disabled={loading}>{t('operator.approve', uiCopy('u_1aad746eec46768d'))}</button>
}
