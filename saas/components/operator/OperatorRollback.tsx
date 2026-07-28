'use client'

import { useTranslation } from '@/components/i18n/useTranslation'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


export default function OperatorRollback({ loading, onRollback }: { loading?: boolean; onRollback: () => void }) {
  const { t } = useTranslation()
  return <button className="sb-button-ghost" onClick={onRollback} disabled={loading}>{t('operator.rollback', uiCopy('u_14d05ce53f3a92c1'))}</button>
}
