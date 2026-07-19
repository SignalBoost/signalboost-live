'use client'

// saas/components/audit/PatchPreview.tsx
// Individual findings are informational only. Repository audit fixes are now
// approved once at the run level and consolidated into one branch / pull request.

import { useTranslation } from '@/components/i18n/useTranslation'

export type PatchFinding = {
  file: string
  line?: number | null
  category?: string
  title: string
  detail?: string
  recommendation?: string
}

export default function PatchPreview({ finding }: { finding: PatchFinding }) {
  const { t } = useTranslation()

  return (
    <div className="rounded-md border border-accent/35 bg-bg px-3.5 py-3">
      <div className="text-[12.5px] font-semibold text-accent">
        {t('audit.patch.batchManaged', 'Included in the one-time audit approval')}
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-text-muted">
        {t(
          'audit.patch.batchManagedBody',
          'No separate approval is required for this finding. Approve the completed audit once and SignalBoost AI will group every accepted fix into one validated branch and one pull request.',
        )}
      </p>
      <div className="mt-2 break-all font-mono text-[10.5px] text-text-muted/80">{finding.file}</div>
      <a
        href="/dashboard/audit#audit-batch-remediation"
        className="mt-3 inline-flex rounded-md border border-accent bg-accent px-3.5 py-2 text-[12.5px] font-semibold text-bg transition-fast hover:brightness-110"
      >
        {t('audit.patch.openBatchApproval', 'Open final audit approval')}
      </a>
    </div>
  )
}
