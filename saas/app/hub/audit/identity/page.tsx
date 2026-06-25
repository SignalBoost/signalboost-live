'use client'

// saas/app/hub/audit/identity/page.tsx
// Identity & Access page — fetches the owner-gated identity-access report.

import { useEffect, useState, type CSSProperties } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { interpolate } from '@/lib/i18n/interpolate'
import IdentityAccessReport from '@/components/audit/IdentityAccessReport'
import ReportExportBar from '@/components/audit/ReportExportBar'
import { toCsv } from '@/lib/audit/exportCsv'

type ApiResponse = { ok: boolean; report?: any; error?: string }
const wrap: CSSProperties = { minHeight: 'calc(100vh - 80px)' }

export default function IdentityPage() {
  const { t } = useTranslation()
  const [data, setData] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/hub/audit/identity-access', { credentials: 'include' })
        const json = (await res.json().catch(() => null)) as ApiResponse | null
        if (!alive) return
        if (!json || !json.ok || !json.report) {
          setError((json && json.error) || t('audit.identity.loadError', 'Could not load the identity report.'))
          return
        }
        const r = json.report
        setData({ ...r, score: typeof r?.score?.score === 'number' ? r.score.score : (typeof r?.score === 'number' ? r.score : 0) })
        setError(null)
      } catch (err: unknown) {
        if (!alive) return
        const msg = err instanceof Error ? err.message : String(err)
        setError(interpolate(t('audit.identity.fetchError', 'Error: {msg}'), { msg }))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [t])

  if (loading) {
    return <main style={{ ...wrap, display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,.6)', padding: 24 }}>{t('audit.identity.loading', 'Loading identity report…')}</main>
  }
  if (error) {
    return <main style={{ ...wrap, display: 'grid', placeItems: 'center', color: '#fca5a5', padding: 24 }}>{error}</main>
  }
  if (!data) return null

  const csv = toCsv(
    ['Provider', 'Principal', 'Kind', 'Role', 'Privileged', 'MFA', 'Last seen days', 'Flags'],
    (data.rows || []).map((r: any) => [r.provider, r.principal, r.kind, r.role, r.isPrivileged ? 'yes' : 'no', r.mfaState, r.lastSeenDays ?? '', (r.flags || []).join('|')]),
  )

  return (
    <>
      <ReportExportBar filename="identity-access" csv={csv} />
      <IdentityAccessReport data={data} />
    </>
  )
}
