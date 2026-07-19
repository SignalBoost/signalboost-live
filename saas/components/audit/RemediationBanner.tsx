'use client'

// saas/components/audit/RemediationBanner.tsx
// Post-scan consent bridge. The audit must ask before preparing remediation.
// Accepting only scrolls to the existing per-finding preview/approval workflow;
// it does not write code or change provider/production state.

import AuditFixConsent from '@/components/audit/AuditFixConsent'

export default function RemediationBanner({
  count,
  lang = 'en',
  targetId = 'audit-findings',
}: {
  count: number
  lang?: string
  targetId?: string
}) {
  const scrollToFindings = () => {
    if (typeof document === 'undefined') return
    const el = document.getElementById(targetId)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="mt-4">
      <AuditFixConsent count={count} lang={lang} onAccept={scrollToFindings} />
    </div>
  )
}
