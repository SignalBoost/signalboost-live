'use client'

// saas/app/hub/audit/secrets/page.tsx
import { useEffect, useState, type CSSProperties } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { interpolate } from '@/lib/i18n/interpolate'
import SecretsReport, { type SecretsReportView } from '@/components/audit/SecretsReport'

type ApiResponse = { ok: boolean; report?: SecretsReportView; error?: string }
const wrap: CSSProperties = { minHeight: 'calc(100vh - 80px)' }

export default function SecretsPage() {
  const { t } = useTranslation()
  const [data, setData] = useState<SecretsReportView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/hub/audit/secrets', { credentials: 'include' })
        const json = (await res.json().catch(() => null)) as ApiResponse | null
        if (!alive) return
        if (!json || !json.ok || !json.report) {
          setError((json && json.error) || t('audit.secret.loadError', 'Could not load the report.'))
          return
        }
        setData(json.report)
        setError(null)
      } catch (err: unknown) {
        if (!alive) return
        const msg = err instanceof Error ? err.message : String(err)
        setError(interpolate(t('audit.secret.fetchError', 'Error: {msg}'), { msg }))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [t])

  if (loading) {
    return <main style={{ ...wrap, display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,.6)', padding: 24 }}>{t('audit.secret.loading', 'Loading secrets report…')}</main>
  }
  if (error) {
    return <main style={{ ...wrap, display: 'grid', placeItems: 'center', color: '#fca5a5', padding: 24 }}>{error}</main>
  }
  if (!data) return null
  return <SecretsReport data={data} />
}
