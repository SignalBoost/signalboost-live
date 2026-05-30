import CockpitModulePage from '@/components/dashboard/CockpitModulePage'
import { getModuleByKey } from '@/lib/platform/unifiedPlatform'

export default function ReviewsPage() {
  return (
    <CockpitModulePage
      module={getModuleByKey('reviews')!}
      primaryAction="Collect proof"
      checklist={['Track review request source', 'Detect sentiment and language', 'Queue response or escalation', 'Publish reusable proof to Marketplace profile']}
      preview={['Review inbox by language and sentiment', 'Response templates for English, Spanish, Portuguese, Polish, and Russian', 'Moderation lane for sensitive feedback', 'Proof cards ready for Promote Business campaigns']}
    />
  )
}
