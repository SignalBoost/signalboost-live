'use client'

// saas/app/hub/audit/compliance/page.tsx
// Compliance Readiness Matrix page — fetches the owner-gated report and renders
// the ComplianceReport component with loading / error states + export bar.

import { useEffect, useState, type CSSProperties } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { interpolate } from '@/lib/i18n/interpolate'
import ComplianceReport, { type ComplianceReportView } from '@/components/audit/ComplianceReport'
import ReportExportBar from '@/components/audit/ReportExportBar'
import { toCsv } from '@/lib/audit/exportCsv'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


// Flat result shape — non-strict tsconfig does not narrow discriminated unions.
type ApiResponse = { ok: boolean; report?: ComplianceReportView; error?: string }

const wrap: CSSProperties = { minHeight: 'calc(100vh - 80px)' }

export default function ComplianceReportPage() {
  const { t } = useTranslation()

  const [data, setData] = useState<ComplianceReportView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/hub/audit/compliance', { credentials: 'include' })
        const json = (await res.json().catch(() => null)) as ApiResponse | null
        if (!alive) return
        if (!json || !json.ok || !json.report) {
          setError((json && json.error) || t('audit.compliance.loadError', uiCopy('u_5062a2b306b49fe1')))
          return
        }
        setData(json.report)
        setError(null)
      } catch (err: unknown) {
        if (!alive) return
        const msg = err instanceof Error ? err.message : String(err)
        setError(interpolate(t('audit.compliance.fetchError', uiCopy('u_bfd37ec7540869ba')), { msg }))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [t])

  if (loading) {
    return (
      <main style={{ ...wrap, display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,.6)', padding: 24 }}>
        {t('audit.compliance.loading', uiCopy('u_94ad0b71ecd8a2d3'))}
      </main>
    )
  }
  if (error) {
    return (
      <main style={{ ...wrap, display: 'grid', placeItems: 'center', color: '#fca5a5', padding: 24 }}>
        {error}
      </main>
    )
  }
  if (!data) return null

  const csv = toCsv(
    ['Control family', 'Status', 'Findings', 'SOC 2', 'ISO 27001', 'NIST CSF', 'CIS'],
    data.families.map(f => [f.id, f.status, f.findingCount, f.refs.soc2 || '', f.refs.iso27001 || '', f.refs.nist || '', f.refs.cis || '']),
  )

  return (
    <>
      <ReportExportBar filename="compliance-readiness" csv={csv} />
      <ComplianceReport data={data} />
    </>
  )
}
