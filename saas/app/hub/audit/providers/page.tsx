'use client'

// saas/app/hub/audit/providers/page.tsx
// Provider Inventory page — fetches the owner-gated report and renders the
// ProviderInventoryReport component with loading / error states.

import { useEffect, useState, type CSSProperties } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { interpolate } from '@/lib/i18n/interpolate'
import ProviderInventoryReport, { type ProviderInventoryView } from '@/components/audit/ProviderInventoryReport'

// Flat result shape — non-strict tsconfig does not narrow discriminated unions.
type ApiResponse = { ok: boolean; report?: ProviderInventoryView; error?: string }

const wrap: CSSProperties = { minHeight: 'calc(100vh - 80px)' }

export default function ProviderInventoryPage() {
  const { t } = useTranslation()

  const [data, setData] = useState<ProviderInventoryView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/hub/audit/provider-inventory', { credentials: 'include' })
        const json = (await res.json().catch(() => null)) as ApiResponse | null
        if (!alive) return
        if (!json || !json.ok || !json.report) {
          setError((json && json.error) || t('audit.provider.loadError', 'Could not load the inventory.'))
          return
        }
        setData(json.report)
        setError(null)
      } catch (err: unknown) {
        if (!alive) return
        const msg = err instanceof Error ? err.message : String(err)
        setError(interpolate(t('audit.provider.fetchError', 'Error: {msg}'), { msg }))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [t])

  if (loading) {
    return (
      <main style={{ ...wrap, display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,.6)', padding: 24 }}>
        {t('audit.provider.loading', 'Loading provider inventory…')}
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
  return <ProviderInventoryReport data={data} />
}
