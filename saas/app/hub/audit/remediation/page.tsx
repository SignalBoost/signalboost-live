'use client'

// saas/app/hub/audit/remediation/page.tsx
// Read-only remediation roadmap. The only human remediation action is the
// run-scoped approval in /dashboard/audit. All subsequent work is performed by
// the approved autonomous remediation controller.

import { useEffect, useState, type CSSProperties } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { interpolate } from '@/lib/i18n/interpolate'
import RemediationRoadmap, { type RemediationRoadmapView } from '@/components/audit/RemediationRoadmap'
import ReportExportBar from '@/components/audit/ReportExportBar'
import { toCsv } from '@/lib/audit/exportCsv'
import { indexStates, type FindingStateMap, type FindingStateRow } from '@/lib/audit/findingState'

type ReportResponse = { ok: boolean; report?: RemediationRoadmapView; error?: string }
type StatesResponse = { ok: boolean; states?: FindingStateRow[]; error?: string }
const wrap: CSSProperties = { minHeight: 'calc(100vh - 80px)' }

export default function RemediationPage() {
  const { t } = useTranslation()
  const [data, setData] = useState<RemediationRoadmapView | null>(null)
  const [states, setStates] = useState<FindingStateMap>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      try {
        const [rRes, sRes] = await Promise.all([
          fetch('/api/hub/audit/remediation', { credentials: 'include', cache: 'no-store' }),
          fetch('/api/hub/audit/finding-state', { credentials: 'include', cache: 'no-store' }),
        ])
        const rJson = (await rRes.json().catch(() => null)) as ReportResponse | null
        const sJson = (await sRes.json().catch(() => null)) as StatesResponse | null
        if (!alive) return
        if (!rJson || !rJson.ok || !rJson.report) {
          setError((rJson && rJson.error) || t('audit.remediation.loadError', 'Could not load the roadmap.'))
          return
        }
        setData(rJson.report)
        setStates(sJson && sJson.ok && sJson.states ? indexStates(sJson.states) : {})
        setError(null)
      } catch (err: unknown) {
        if (!alive) return
        const msg = err instanceof Error ? err.message : String(err)
        setError(interpolate(t('audit.remediation.fetchError', 'Error: {msg}'), { msg }))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [t])

  if (loading) {
    return <main style={{ ...wrap, display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,.6)', padding: 24 }}>{t('audit.remediation.loading', 'Building remediation roadmap…')}</main>
  }
  if (error) {
    return <main style={{ ...wrap, display: 'grid', placeItems: 'center', color: '#fca5a5', padding: 24 }}>{error}</main>
  }
  if (!data) return null

  const csv = toCsv(
    ['Tier', 'Severity', 'Provider', 'Title', 'Status', 'Recommendation'],
    data.items.map(({ finding, tier }) => {
      const st = states[finding.id]
      return [tier, finding.severity, finding.provider, finding.fallback.title, st?.status || finding.status || 'open', finding.fallback.recommendation]
    }),
  )

  return (
    <>
      <ReportExportBar filename="remediation-roadmap" csv={csv} />
      <RemediationRoadmap data={data} states={states} />
    </>
  )
}
