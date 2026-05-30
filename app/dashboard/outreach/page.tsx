import CockpitModulePage from '@/components/dashboard/CockpitModulePage'
import { getModuleByKey } from '@/lib/platform/unifiedPlatform'

export default function OutreachPage() {
  return (
    <CockpitModulePage
      module={getModuleByKey('outreach')!}
      primaryAction="Approve queue"
      checklist={['Capture channel and audience', 'Require human approval before send', 'Attach Marketplace or SaaS source', 'Log delivery and response trend']}
      preview={['Email, social, partner, and review follow-up queue', 'Approval rail with owner-safe sending limits', 'Message variants localized by market', 'Response trend connected to Promote Business campaigns']}
    />
  )
}
