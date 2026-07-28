'use client'

// saas/app/hub/audit/email/page.tsx
// Email Deliverability & DNS Health report page — fetches the owner-gated
// report and renders the EmailHealthReport component with loading / error.

import { useEffect, useState, type CSSProperties } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { interpolate } from '@/lib/i18n/interpolate'
import EmailHealthReport, { type EmailHealthReportView } from '@/components/audit/EmailHealthReport'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


// Flat result shape — non-strict tsconfig does not narrow discriminated unions.
type ApiResponse = { ok: boolean; report?: EmailHealthReportView; error?: string }

const wrap: CSSProperties = { minHeight: 'calc(100vh - 80px)' }

export default function EmailHealthReportPage() {
  const { t } = useTranslation()

  const [data, setData] = useState<EmailHealthReportView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/hub/audit/email', { credentials: 'include' })
        const json = (await res.json().catch(() => null)) as ApiResponse | null
        if (!alive) return
        if (!json || !json.ok || !json.report) {
          setError((json && json.error) || t('audit.email.loadError', uiCopy('u_72b101f49212a1e8')))
          return
        }
        setData(json.report)
        setError(null)
      } catch (err: unknown) {
        if (!alive) return
        const msg = err instanceof Error ? err.message : String(err)
        setError(interpolate(t('audit.email.fetchError', uiCopy('u_823f600b4d984298')), { msg }))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [t])

  return (
    <div style={wrap}>
      {loading && <p style={{ color: 'rgba(255,255,255,.65)', padding: 24 }}>{t('audit.email.loading', uiCopy('u_8423597d3064ff8b'))}</p>}
      {!loading && error && <p style={{ color: '#fca5a5', padding: 24 }}>{error}</p>}
      {!loading && !error && data && <EmailHealthReport data={data} />}
    </div>
  )
}
