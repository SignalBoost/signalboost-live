'use client'

import { useTranslation } from '@/components/i18n/useTranslation'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


export default function ResetButton({ onReset, className }: { onReset: () => void; className?: string }) {
  const { t } = useTranslation()

  return (
    <button type="button" className={className || 'sb-button-ghost'} onClick={onReset}>
      {t('reset', uiCopy('u_50e3d6660ad4ddd3'))}
    </button>
  )
}
