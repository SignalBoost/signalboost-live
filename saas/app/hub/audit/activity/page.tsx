'use client'

// saas/app/hub/audit/activity/page.tsx
// Audit Log & Activity Timeline page — fetches the owner-gated report and renders
// the ActivityReport component with loading / error states + export bar.

import { useEffect, useState, type CSSProperties } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { interpolate } from '@/lib/i18n/interpolate'
import ActivityReport, { type ActivityReportView } from '@/components/audit/ActivityReport'
import ReportExportBar from '@/components/audit/ReportExportBar'
import { toCsv } from '@/lib/audit/exportCsv'

// Flat result shape — non-strict tsconfig does not narrow discriminated unions.
type ApiResponse = { ok: boolean; report?: ActivityReportView; error?: string }

const wrap: CSSProperties = { minHeight: 'calc(100vh - 80px)' }

export default function ActivityReportPage() {
  const { t } = useTranslation()

  const [data, setData] = useState<ActivityReportView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/hub/audit/activity', { credentials: 'include' })
        const json = (await res.json().catch(() => null)) as ApiResponse | null
        if (!alive) return
        if (!json || !json.ok || !json.report) {
          setError((json && json.error) || t('audit.activity.loadError', 'Could not load the activity log.'))
          return
        }
        setData(json.report)
        setError(null)
      } catch (err: unknown) {
        if (!alive) return
        const msg = err instanceof Error ? err.message : String(err)
        setError(interpolate(t('audit.activity.fetchError', 'Error: {msg}'), { msg }))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [t])

  if (loading) {
    return (
      <main style={{ ...wrap, display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,.6)', padding: 24 }}>
        {t('audit.activity.loading', 'Loading activity log…')}
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
    ['Time (UTC)', 'Actor', 'Action', 'Target', 'Status', 'Message'],
    data.events.map(e => [e.createdAt, e.actor, e.action, e.target, e.status, e.message]),
  )

  return (
    <>
      <ReportExportBar filename="activity-log" csv={csv} />
      <ActivityReport data={data} />
    </>
  )
}
