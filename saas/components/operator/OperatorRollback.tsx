'use client'

import { useTranslation } from '@/components/i18n/useTranslation'

export default function OperatorRollback({ loading, onRollback }: { loading?: boolean; onRollback: () => void }) {
  const { t } = useTranslation()
  return <button className="sb-button-ghost" onClick={onRollback} disabled={loading}>{t('operator.rollback', 'Restore previous version')}</button>
}
