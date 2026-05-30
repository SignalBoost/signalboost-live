import CockpitModulePage from '@/components/dashboard/CockpitModulePage'
import { getModuleByKey } from '@/lib/platform/unifiedPlatform'

export default function CalendarPage() {
  return (
    <CockpitModulePage
      module={getModuleByKey('calendar')!}
      primaryAction="Schedule mission"
      checklist={['Log calendar view', 'Attach campaign or booking', 'Check local cultural timing', 'Send reminders to Outreach queue']}
      preview={['7-day launch calendar with review asks and promo windows', 'Marketplace booking moments synced to campaign tasks', 'Cultural-calendar guardrails for multilingual launches', 'Follow-up reminders for owners, partners, and customers']}
    />
  )
}
