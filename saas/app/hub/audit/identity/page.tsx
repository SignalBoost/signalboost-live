'use client'

// saas/app/hub/audit/identity/page.tsx
// Client page — fetches /api/hub/audit/identity-access and renders the
// IdentityAccessReport component with full loading / error states.
// All UI text flows through useTranslation (t()) — zero hardcoded English.

import { useEffect, useState, CSSProperties } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { interpolate } from '@/lib/i18n/interpolate'
import IdentityAccessReport from '@/components/audit/IdentityAccessReport'

// ─── design tokens (match AuditDashboard.tsx exactly) ───────────────────────
const GOLD = '#ffc300'
const CYAN = '#1af0ff'
const RED  = '#fca5a5'

const glass: CSSProperties = {
  background: 'linear-gradient(160deg, rgba(15,23,42,.55), rgba(7,11,20,.65))',
  border: '1px solid rgba(255,255,255,.10)',
  borderRadius: 16,
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
}

// ─── types ───────────────────────────────────────────────────────────────────
type ReportData = {
  generatedAt: string
  rows: unknown[]
  findings: unknown[]
  summary: Record<string, number>
  score: number
}

// Flat result shape — the repo's tsconfig is non-strict, so discriminated
// unions do not narrow on `if (!json.ok)`. Keep ok/report/error on one object.
type ApiResponse = { ok: boolean; report?: ReportData; error?: string }

// ─── page ────────────────────────────────────────────────────────────────────
export default function IdentityAccessPage() {
  const { t } = useTranslation()

  const [data,    setData]    = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res  = await fetch('/api/hub/audit/identity-access', { credentials: 'include' })
        const json = await res.json().catch(() => null) as ApiResponse | null

        if (!alive) return

        if (!json) {
          setError(t('audit.identity.loadError', 'Could not load report.'))
          return
        }
        if (!json.ok) {
          setError(json.error || t('audit.identity.loadError', 'Could not load report.'))
          return
        }
        setData(json.report)
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

  // ── loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <main style={{ padding: 32, color: '#fff', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ ...glass, padding: 32, display: 'flex', alignItems: 'center', gap: 14 }}>
          <Spinner />
          <span style={{ fontSize: 14, color: 'rgba(255,255,255,.65)' }}>
            {t('audit.identity.loading', 'Loading identity report…')}
          </span>
        </div>
      </main>
    )
  }

  // ── error state ────────────────────────────────────────────────────────────
  if (error || !data) {
    return (
      <main style={{ padding: 32, color: '#fff', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ ...glass, padding: 32 }}>
          {/* header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: RED }}>
              {t('audit.identity.errorTitle', 'Report unavailable')}
            </h2>
          </div>

          <p style={{ margin: '0 0 20px', fontSize: 13, color: 'rgba(255,255,255,.6)', lineHeight: 1.6 }}>
            {error || t('audit.identity.loadError', 'Could not load report.')}
          </p>

          <button
            onClick={() => { setError(null); setLoading(true); setData(null) }}
            style={{
              padding: '10px 22px',
              borderRadius: 10,
              border: `1px solid ${CYAN}66`,
              background: 'transparent',
              color: CYAN,
              fontSize: 13,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            {t('audit.identity.retry', 'Retry')}
          </button>
        </div>
      </main>
    )
  }

  // ── success state ──────────────────────────────────────────────────────────
  return (
    <main style={{ padding: 24, color: '#fff', maxWidth: 1100, margin: '0 auto' }}>
      {/* breadcrumb */}
      <nav style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
        <a
          href="/hub/audit"
          style={{ fontSize: 12, color: 'rgba(255,255,255,.45)', textDecoration: 'none', fontWeight: 600 }}
        >
          {t('audit.nav.auditCenter', 'Audit Center')}
        </a>
        <span style={{ color: 'rgba(255,255,255,.25)', fontSize: 12 }}>›</span>
        <span style={{ fontSize: 12, color: GOLD, fontWeight: 700 }}>
          {t('audit.identity.pageTitle', 'Identity & Access')}
        </span>
      </nav>

      {/* report */}
      <IdentityAccessReport data={data as Parameters<typeof IdentityAccessReport>[0]['data']} />

      {/* footer — refresh link */}
      <div style={{ marginTop: 24, textAlign: 'right' }}>
        <button
          onClick={() => { setData(null); setLoading(true) }}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'rgba(255,255,255,.35)',
            fontSize: 11.5,
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {t('audit.identity.refresh', '↺ Refresh report')}
        </button>
      </div>
    </main>
  )
}

// ─── tiny spinner ─────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 22 22"
      style={{ animation: 'spin 0.9s linear infinite' }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <circle
        cx={11}
        cy={11}
        r={8}
        fill="none"
        stroke={GOLD}
        strokeWidth={2.5}
        strokeDasharray="28 16"
        strokeLinecap="round"
      />
    </svg>
  )
}
