'use client'

import CockpitModulePage from '@/components/dashboard/CockpitModulePage'
import { getModuleByKey } from '@/lib/platform/unifiedPlatform'
import { useTranslation } from '@/lib/i18n/useTranslation'

export default function OutreachPage() {
  const { t, locale } = useTranslation()

  return (
    <CockpitModulePage module={getModuleByKey('outreach')!} primaryActionKey="outreach.primaryAction" checklistPrefix="outreach.checklist" previewPrefix="outreach.preview">
      <div className="mt-6 rounded-2xl border border-[#FFD700]/20 bg-[#FFD700]/10 p-4 text-sm text-white/80">
        <p className="font-bold text-[#FFD700]">{t('outreach.subject', '', { market: locale.toUpperCase() })}</p>
        <p className="mt-2">{t('outreach.body')}</p>
      </div>
    </CockpitModulePage>
  )
}
