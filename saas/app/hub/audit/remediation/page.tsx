'use client'

// saas/app/hub/audit/remediation/page.tsx
// Remediation Roadmap page — fetches the roadmap AND per-finding triage state,
// renders the roadmap with status/owner controls, and persists changes
// (optimistic update + POST to /api/hub/audit/finding-state).

import { useEffect, useState, useCallback, type CSSProperties } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { interpolate } from '@/lib/i18n/interpolate'
import RemediationRoadmap, { type RemediationRoadmapView } from '@/components/audit/RemediationRoadmap'
import ReportExportBar from '@/components/audit/ReportExportBar'
import { toCsv } from '@/lib/audit/exportCsv'
import { indexStates, normalizeStatus, type FindingStateMap, type FindingStateRow } from '@/lib/audit/findingState'

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
          fetch('/api/hub/audit/remediation', { credentials: 'include' }),
          fetch('/api/hub/audit/finding-state', { credentials: 'include' }),
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

  const onChange = useCallback((findingId: string, patch: { status?: string; owner?: string; dueDate?: string }) => {
    // Optimistic update.
    setStates(prev => {
      const cur = prev[findingId] || { status: 'open' as const, owner: '', note: '', dueDate: '' }
      return {
        ...prev,
        [findingId]: {
          status: patch.status !== undefined ? normalizeStatus(patch.status) : cur.status,
          owner: patch.owner !== undefined ? patch.owner : cur.owner,
          note: cur.note,
          dueDate: patch.dueDate !== undefined ? patch.dueDate : cur.dueDate,
        },
      }
    })
    // Persist (fire-and-forget; UI already reflects the change).
    fetch('/api/hub/audit/finding-state', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ findingId, ...patch }),
    }).catch(() => { /* keep optimistic state; a reload re-syncs from the server */ })
  }, [])

  if (loading) {
    return <main style={{ ...wrap, display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,.6)', padding: 24 }}>{t('audit.remediation.loading', 'Building remediation roadmap…')}</main>
  }
  if (error) {
    return <main style={{ ...wrap, display: 'grid', placeItems: 'center', color: '#fca5a5', padding: 24 }}>{error}</main>
  }
  if (!data) return null

  const csv = toCsv(
    ['Tier', 'Severity', 'Provider', 'Title', 'Status', 'Owner', 'Recommendation'],
    data.items.map(({ finding, tier }) => {
      const st = states[finding.id]
      return [tier, finding.severity, finding.provider, finding.fallback.title, st?.status || 'open', st?.owner || '', finding.fallback.recommendation]
    }),
  )

  return (
    <>
      <ReportExportBar filename="remediation-roadmap" csv={csv} />
      <RemediationRoadmap data={data} states={states} onChange={onChange} />
    </>
  )
}
