'use client'

// saas/app/hub/audit/executive/page.tsx
// Executive Risk Summary page — fetches the owner-gated report and renders the
// ExecutiveSummary component with loading / error states. Passes the active
// language so the LLM narrative comes back localized.

import { useEffect, useState, type CSSProperties } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { interpolate } from '@/lib/i18n/interpolate'
import ExecutiveSummary, { type ExecutiveSummaryView } from '@/components/audit/ExecutiveSummary'

// Flat result shape — the repo's tsconfig is non-strict, so discriminated unions
// do not narrow on `if (!json.ok)`. Keep ok/report/error on one object.
type ApiResponse = { ok: boolean; report?: ExecutiveSummaryView; error?: string }

const wrap: CSSProperties = { minHeight: 'calc(100vh - 80px)' }

export default function ExecutiveSummaryPage() {
  const { t, lang } = useTranslation()

  const [data, setData] = useState<ExecutiveSummaryView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/hub/audit/executive-summary?lang=${encodeURIComponent(lang || 'en')}`, { credentials: 'include' })
        const json = (await res.json().catch(() => null)) as ApiResponse | null
        if (!alive) return
        if (!json) {
          setError(t('audit.exec.loadError', 'Could not load the summary.'))
          return
        }
        if (!json.ok || !json.report) {
          setError(json.error || t('audit.exec.loadError', 'Could not load the summary.'))
          return
        }
        setData(json.report)
        setError(null)
      } catch (err: unknown) {
        if (!alive) return
        const msg = err instanceof Error ? err.message : String(err)
        setError(interpolate(t('audit.exec.fetchError', 'Error: {msg}'), { msg }))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [lang, t])

  if (loading) {
    return (
      <main style={{ ...wrap, display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,.6)', padding: 24 }}>
        {t('audit.exec.loading', 'Building executive summary…')}
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
  return <ExecutiveSummary data={data} />
}
