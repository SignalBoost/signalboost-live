'use client'

import { useTranslation } from '@/components/i18n/useTranslation'

export default function ResetButton({ onReset, className }: { onReset: () => void; className?: string }) {
  const { t } = useTranslation()

  return (
    <button type="button" className={className || 'sb-button-ghost'} onClick={onReset}>
      {t('reset', 'Reset')}
    </button>
  )
}
