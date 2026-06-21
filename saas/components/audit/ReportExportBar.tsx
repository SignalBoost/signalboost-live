'use client'

// saas/components/audit/ReportExportBar.tsx
// A small toolbar above a report: download the data as CSV, or print / save as
// PDF (the browser's print dialog). Self-positioning to match the report's
// centered 1100px column. Hidden when printing.

import { useTranslation } from '@/components/i18n/useTranslation'

const btn: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer',
  background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.16)',
  borderRadius: 999, padding: '6px 14px',
}

export default function ReportExportBar({ filename, csv }: { filename: string; csv?: string }) {
  const { t } = useTranslation()

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

  const printPdf = () => { try { window.print() } catch { /* no-op */ } }

  return (
    <div className="no-print" style={{ maxWidth: 1100, margin: '0 auto', padding: '16px 24px 0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
      <style>{`@media print { .no-print { display: none !important; } html, body { background: #ffffff !important; } main, main * { color: #1a1a1a !important; } main a { color: #1a1a1a !important; text-decoration: none; } }`}</style>
      {csv ? (
        <button type="button" onClick={downloadCsv} style={btn}>{t('audit.export.csv', 'Export CSV')}</button>
      ) : null}
      <button type="button" onClick={printPdf} style={btn}>{t('audit.export.pdf', 'Print / Save PDF')}</button>
    </div>
  )
}
