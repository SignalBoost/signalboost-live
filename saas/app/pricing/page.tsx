// saas/app/dashboard/audit/pricing/page.tsx
// Dashboard alias of the public pricing storefront. Renders the same shared
// component as /pricing (single source of truth) so the two routes stay in sync.

import UnifiedPricingStorefront from '@/components/pricing/UnifiedPricingStorefront'

export default function AuditPricingPage() {
  return <UnifiedPricingStorefront />
}
