'use client'

// saas/components/audit/ReportExportBar.tsx
// Toolbar above audit reports: CSV export, server-side PDF download when the
// report is supported, and browser print/save-PDF fallback for every report.

import { useTranslation } from '@/components/i18n/useTranslation'

const btn: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer',
  background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.16)',
  borderRadius: 999, padding: '6px 14px',
}

type ReportId =
  | 'executive-summary'
  | 'provider-inventory'
  | 'identity-access'
  | 'secrets-keys'
  | 'github-changes'
  | 'vercel-deployment'
  | 'supabase-security'
  | 'stripe-config'
  | 'compliance-readiness'
  | 'remediation-roadmap'

const FILE_TO_REPORT: Record<string, ReportId> = {
  'executive-risk-summary': 'executive-summary',
  'provider-inventory': 'provider-inventory',
  'identity-access': 'identity-access',
  'secrets-exposure': 'secrets-keys',
  'github-report': 'github-changes',
  'deployment-report': 'vercel-deployment',
  'supabase-report': 'supabase-security',
  'stripe-report': 'stripe-config',
  'compliance-readiness': 'compliance-readiness',
  'remediation-roadmap': 'remediation-roadmap',
}

export default function ReportExportBar({ filename, csv, reportId }: { filename: string; csv?: string; reportId?: ReportId }) {
  const { t } = useTranslation()
  const resolvedReport = reportId || FILE_TO_REPORT[filename]

  const downloadCsv = () => {
    if (!csv) return
    try {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${filename}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch { /* no-op */ }
  }

  const downloadPdf = () => {
    if (!resolvedReport) return
    window.location.href = `/api/hub/audit/pdf?report=${encodeURIComponent(resolvedReport)}`
  }

  const printPdf = () => { try { window.print() } catch { /* no-op */ } }

  return (
    <div className="no-print" style={{ maxWidth: 1100, margin: '0 auto', padding: '16px 24px 0', display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
      <style>{`@media print { .no-print { display: none !important; } html, body { background: #ffffff !important; } main, main * { color: #1a1a1a !important; } main a { color: #1a1a1a !important; text-decoration: none; } }`}</style>
      {csv ? (
        <button type="button" onClick={downloadCsv} style={btn}>{t('audit.export.csv', 'Export CSV')}</button>
      ) : null}
      {resolvedReport ? (
        <button type="button" onClick={downloadPdf} style={btn}>{t('audit.export.downloadPdf', 'Download PDF')}</button>
      ) : null}
      <button type="button" onClick={printPdf} style={btn}>{t('audit.export.pdf', 'Print / Save PDF')}</button>
    </div>
  )
}
