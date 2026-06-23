'use client'

import { useTranslation } from '@/components/i18n/useTranslation'

export default function OperatorApproval({ loading, onApprove }: { loading?: boolean; onApprove: () => void }) {
  const { t } = useTranslation()
  return <button className="sb-button-ghost" onClick={onApprove} disabled={loading}>{t('operator.approve', 'Approve update')}</button>
}
