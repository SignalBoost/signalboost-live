// saas/components/audit/RemediationBanner.tsx
// Intentional compatibility boundary. The Audit Console now renders exactly one
// run-scoped approval control. No second consent, scroll-to-fix, preview, or
// manual remediation action may be rendered here.

export default function RemediationBanner(_props: {
  count: number
  lang?: string
  targetId?: string
}) {
  return null
}
