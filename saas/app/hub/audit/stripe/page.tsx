'use client'

// saas/app/hub/audit/stripe/page.tsx
// Stripe / Payments Configuration report page — fetches the owner-gated report
// and renders the StripeReport component with loading / error states + export.

import { useEffect, useState, type CSSProperties } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { interpolate } from '@/lib/i18n/interpolate'
import StripeReport, { type StripeReportView } from '@/components/audit/StripeReport'
import ReportExportBar from '@/components/audit/ReportExportBar'
import { toCsv } from '@/lib/audit/exportCsv'

// Flat result shape — non-strict tsconfig does not narrow discriminated unions.
type ApiResponse = { ok: boolean; report?: StripeReportView; error?: string }

const wrap: CSSProperties = { minHeight: 'calc(100vh - 80px)' }

export default function StripeReportPage() {
  const { t } = useTranslation()

  const [data, setData] = useState<StripeReportView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/hub/audit/stripe', { credentials: 'include' })
        const json = (await res.json().catch(() => null)) as ApiResponse | null
        if (!alive) return
        if (!json || !json.ok || !json.report) {
          setError((json && json.error) || t('audit.stripe.loadError', 'Could not load the Stripe report.'))
          return
        }
        setData(json.report)
        setError(null)
      } catch (err: unknown) {
        if (!alive) return
        const msg = err instanceof Error ? err.message : String(err)
        setError(interpolate(t('audit.stripe.fetchError', 'Error: {msg}'), { msg }))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [t])

  if (loading) {
    return (
      <main style={{ ...wrap, display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,.6)', padding: 24 }}>
        {t('audit.stripe.loading', 'Loading Stripe report…')}
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
    ['Tier', 'Amount', 'Interval', 'PriceId', 'Status'],
    data.tiers.map(tr => [tr.name, (tr.amount / 100).toFixed(2), tr.interval, tr.priceId, tr.mismatch ? 'mismatch' : 'active']),
  )

  return (
    <>
      <ReportExportBar filename="stripe-report" csv={csv} />
      <StripeReport data={data} />
    </>
  )
}
