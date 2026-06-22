'use client'

// saas/app/hub/audit/vercel/page.tsx
// Cloud / Deployment Configuration report (Vercel) page — fetches the owner-gated
// report and renders the VercelReport component with loading / error + export.

import { useEffect, useState, type CSSProperties } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { interpolate } from '@/lib/i18n/interpolate'
import VercelReport, { type VercelReportView } from '@/components/audit/VercelReport'
import ReportExportBar from '@/components/audit/ReportExportBar'
import { toCsv } from '@/lib/audit/exportCsv'

// Flat result shape — non-strict tsconfig does not narrow discriminated unions.
type ApiResponse = { ok: boolean; report?: VercelReportView; error?: string }

const wrap: CSSProperties = { minHeight: 'calc(100vh - 80px)' }

export default function VercelReportPage() {
  const { t } = useTranslation()

  const [data, setData] = useState<VercelReportView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/hub/audit/vercel', { credentials: 'include' })
        const json = (await res.json().catch(() => null)) as ApiResponse | null
        if (!alive) return
        if (!json || !json.ok || !json.report) {
          setError((json && json.error) || t('audit.vercel.loadError', 'Could not load the deployment report.'))
          return
        }
        setData(json.report)
        setError(null)
      } catch (err: unknown) {
        if (!alive) return
        const msg = err instanceof Error ? err.message : String(err)
        setError(interpolate(t('audit.vercel.fetchError', 'Error: {msg}'), { msg }))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [t])

  if (loading) {
    return (
      <main style={{ ...wrap, display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,.6)', padding: 24 }}>
        {t('audit.vercel.loading', 'Loading deployment report…')}
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

  // CSV: one row per (scope, variable name). Names only — never values.
  const rows: (string | number)[][] = []
  for (const sc of data.scopes) {
    for (const n of sc.names) rows.push([sc.scope, n])
  }
  const csv = toCsv(['Scope', 'Variable'], rows)

  return (
    <>
      <ReportExportBar filename="deployment-report" csv={csv} />
      <VercelReport data={data} />
    </>
  )
}
