'use client'

// saas/app/hub/audit/github/page.tsx
// GitHub / Software Development report page — fetches the owner-gated report and
// renders the GithubReport component with loading / error states + export bar.

import { useEffect, useState, type CSSProperties } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { interpolate } from '@/lib/i18n/interpolate'
import GithubReport, { type GithubReportView } from '@/components/audit/GithubReport'
import ReportExportBar from '@/components/audit/ReportExportBar'
import { toCsv } from '@/lib/audit/exportCsv'

// Flat result shape — non-strict tsconfig does not narrow discriminated unions.
type ApiResponse = { ok: boolean; report?: GithubReportView; error?: string }

const wrap: CSSProperties = { minHeight: 'calc(100vh - 80px)' }

export default function GithubReportPage() {
  const { t } = useTranslation()

  const [data, setData] = useState<GithubReportView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/hub/audit/github', { credentials: 'include' })
        const json = (await res.json().catch(() => null)) as ApiResponse | null
        if (!alive) return
        if (!json || !json.ok || !json.report) {
          setError((json && json.error) || t('audit.github.loadError', 'Could not load the GitHub report.'))
          return
        }
        setData(json.report)
        setError(null)
      } catch (err: unknown) {
        if (!alive) return
        const msg = err instanceof Error ? err.message : String(err)
        setError(interpolate(t('audit.github.fetchError', 'Error: {msg}'), { msg }))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [t])

  if (loading) {
    return (
      <main style={{ ...wrap, display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,.6)', padding: 24 }}>
        {t('audit.github.loading', 'Loading GitHub report…')}
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
    ['User', 'Role', 'Access'],
    data.collaborators.map(c => [c.login, c.role, c.isAdmin ? 'admin' : 'member']),
  )

  return (
    <>
      <ReportExportBar filename="github-report" csv={csv} />
      <GithubReport data={data} />
    </>
  )
}
