'use client'

import CockpitModulePage from '@/components/dashboard/CockpitModulePage'
import { getModuleByKey } from '@/lib/platform/unifiedPlatform'
import { useTranslation } from '@/lib/i18n/useTranslation'

export default function CalendarPage() {
  const { t, locale } = useTranslation()
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(new Date('2026-06-07T12:00:00Z'))
  const time = new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone: 'UTC' }).format(new Date('2026-06-07T15:30:00Z'))

  return (
    <CockpitModulePage module={getModuleByKey('calendar')!} primaryActionKey="calendar.primaryAction" checklistPrefix="calendar.checklist" previewPrefix="calendar.preview">
      <div className="mt-6 grid gap-3 text-sm text-white/75 md:grid-cols-2">
        <p className="rounded-2xl border border-white/10 bg-black/30 p-4">{t('calendar.datePreview', '', { date })}</p>
        <p className="rounded-2xl border border-white/10 bg-black/30 p-4">{t('calendar.timePreview', '', { time })}</p>
      </div>
    </CockpitModulePage>
  )
}
