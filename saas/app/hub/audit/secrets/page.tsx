'use client'

// saas/app/hub/audit/secrets/page.tsx
import { useEffect, useState, type CSSProperties } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { interpolate } from '@/lib/i18n/interpolate'
import SecretsReport, { type SecretsReportView } from '@/components/audit/SecretsReport'
import ReportExportBar from '@/components/audit/ReportExportBar'
import { toCsv } from '@/lib/audit/exportCsv'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


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
          setError((json && json.error) || t('audit.secret.loadError', uiCopy('u_d135169e6914fc38')))
          return
        }
        setData(json.report)
        setError(null)
      } catch (err: unknown) {
        if (!alive) return
        const msg = err instanceof Error ? err.message : String(err)
        setError(interpolate(t('audit.secret.fetchError', uiCopy('u_ae682be7ed30677f')), { msg }))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [t])

  if (loading) {
    return <main style={{ ...wrap, display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,.6)', padding: 24 }}>{t('audit.secret.loading', uiCopy('u_b514e1584aacef44'))}</main>
  }
  if (error) {
    return <main style={{ ...wrap, display: 'grid', placeItems: 'center', color: '#fca5a5', padding: 24 }}>{error}</main>
  }
  if (!data) return null
  const csv = toCsv(
    ['Name', 'Provider', 'Environment', 'Exposure', 'Rotation', 'Risk'],
    data.rows.map(r => [r.name, r.provider, r.environment, r.publicExposed ? 'client-exposed' : 'server-only', r.rotationKnown ? 'tracked' : 'unknown', r.risk]),
  )
  return (
    <>
      <ReportExportBar filename="secrets-exposure" csv={csv} />
      <SecretsReport data={data} />
    </>
  )
}
