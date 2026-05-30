import CockpitModulePage from '@/components/dashboard/CockpitModulePage'
import { getModuleByKey } from '@/lib/platform/unifiedPlatform'

export default function PromoteBusinessPage() {
  return (
    <CockpitModulePage
      module={getModuleByKey('promote')!}
      primaryAction="Build campaign"
      checklist={['Capture campaign objective', 'Bind target market and language', 'Connect Marketplace category', 'Log launch readiness in Admin Console']}
      preview={['Offer builder with localized value proposition', 'Marketplace category and partner fit score', 'Launch sequence for social, email, and review proof', 'Budget, audience, and conversion KPI tiles']}
    />
  )
}
