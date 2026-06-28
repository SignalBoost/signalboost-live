'use client'

// saas/app/dashboard/cos-mining/page.tsx
// Thin host binding: renders the portable COS MiningDashboard with the app's current
// language. Admin-only intelligence; the overview endpoint enforces the role server-side,
// and the component shows a localized no-access panel for non-admins.

import { useTranslation } from '@/components/i18n/useTranslation'
import MiningDashboard from '@/lib/cos/ui/MiningDashboard'

export default function CosMiningPage() {
  const { lang } = useTranslation()
  return <MiningDashboard lang={lang} />
}
