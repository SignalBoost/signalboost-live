'use client'

import { useTranslation } from '@/components/i18n/useTranslation'

export function AuthUnavailableNotice() {
  const { t } = useTranslation()
  return <>{t('auth.temporarilyUnavailable')}</>
}
