'use client'

// saas/app/hub/audit/history/page.tsx
// Audit Run History & Trends — the first screen on the Linear-style design
// system. Persisted readiness snapshots, charted over time, with a one-click
// "Snapshot now". All text flows through t(); styling uses design-system tokens.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { interpolate } from '@/lib/i18n/interpolate'

type Run = {
  id: string
  score: number
  critical: number
  high: number
  medium: number
  low: number
  info: number
  evidence_required: number
  total: number
  created_at: string
}

type RunsResponse = { ok: boolean; runs?: Run[]; error?: string }
type SnapResponse = { ok: boolean; run?: Run; error?: string }

const CARD = 'rounded-md border border-border bg-surface p-4'
const PRIMARY = 'inline-flex items-center justify-center rounded-md border border-accent bg-accent text-bg px-3 py-1.5 text-sm font-medium transition-fast hover:brightness-110 disabled:opacity-50'

export default function AuditHistoryPage() {
  const { t } = useTranslation()
  const [runs, setRuns] = useState<Run[]>([])
  const [loading, setLoading] = useState(true)
  const [snapping, setSnapping] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/hub/audit/history', { credentials: 'include' })
      const json = (await res.json().catch(() => null)) as RunsResponse | null
      if (!json || !json.ok) {
        setError((json && json.error) || t('audit.history.loadError', 'Could not load history.'))
        return
      }
      setRuns(json.runs || [])
      setError(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(interpolate(t('audit.history.fetchError', 'Error: {msg}'), { msg }))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { load() }, [load])

  const snapshot = useCallback(async () => {
    setSnapping(true)
    try {
      const res = await fetch('/api/hub/audit/history', { method: 'POST', credentials: 'include' })
      const json = (await res.json().catch(() => null)) as SnapResponse | null
      if (!json || !json.ok) {
        setError((json && json.error) || t('audit.history.snapshotError', 'Could not take snapshot.'))
        return
      }
      await load()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(interpolate(t('audit.history.fetchError', 'Error: {msg}'), { msg }))
    } finally {
      setSnapping(false)
    }
  }, [t, load])

  return (
    <main className="min-h-screen bg-bg font-sans text-text p-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-text">{t('audit.history.title', 'Readiness History')}</h1>
            <p className="mt-1 text-sm text-text-muted">{t('audit.history.subtitle', 'Track how your readiness score moves over time.')}</p>
          </div>
          <button type="button" onClick={snapshot} disabled={snapping} className={PRIMARY}>
            {snapping ? t('audit.history.snapshotting', 'Saving…') : t('audit.history.snapshot', 'Snapshot now')}
          </button>
        </header>

        {error ? (
          <div className="mb-4 rounded-md border border-danger bg-surface p-4 text-sm text-text">{error}</div>
        ) : null}

        {loading ? (
          <div className="text-sm text-text-muted">{t('audit.history.loading', 'Loading history…')}</div>
        ) : runs.length === 0 ? (
          <div className={`${CARD} text-sm text-text-muted`}>{t('audit.history.empty', 'No snapshots yet. Take your first one above.')}</div>
        ) : (
          <div className="flex flex-col gap-4">
            <TrendChart runs={runs} label={t('audit.history.trendTitle', 'Score over time')} />
            <RunsTable runs={runs} t={t} />
          </div>
        )}
      </div>
    </main>
  )
}

function TrendChart({ runs, label }: { runs: Run[]; label: string }) {
  const W = 600, H = 160, PAD = 24
  const pts = useMemo(() => {
    if (runs.length === 0) return ''
    const n = runs.length
    return runs.map((r, i) => {
      const x = n === 1 ? W / 2 : PAD + (i * (W - PAD * 2)) / (n - 1)
      const y = PAD + (1 - Math.max(0, Math.min(100, r.score)) / 100) * (H - PAD * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
  }, [runs])

  return (
    <section className={CARD}>
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full" preserveAspectRatio="none">
        {[0, 50, 100].map(g => {
          const y = PAD + (1 - g / 100) * (H - PAD * 2)
          return <line key={g} x1={PAD} x2={W - PAD} y1={y} y2={y} className="stroke-border" strokeWidth={1} />
        })}
        {runs.length > 1 ? <polyline points={pts} fill="none" className="stroke-accent" strokeWidth={2} /> : null}
        {runs.map((r, i) => {
          const n = runs.length
          const x = n === 1 ? W / 2 : PAD + (i * (W - PAD * 2)) / (n - 1)
          const y = PAD + (1 - Math.max(0, Math.min(100, r.score)) / 100) * (H - PAD * 2)
          return <circle key={r.id} cx={x} cy={y} r={3} className="fill-accent" />
        })}
      </svg>
    </section>
  )
}

type TFn = (key: string, fallback: string) => string

function RunsTable({ runs, t }: { runs: Run[]; t: TFn }) {
  const ordered = [...runs].reverse() // newest first in the table
  const fmt = (iso: string) => { try { return new Date(iso).toISOString().slice(0, 16).replace('T', ' ') } catch { return iso } }
  return (
    <section className={CARD}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-text-muted">
              <th className="px-3 py-2 font-medium">{t('audit.history.col.date', 'Date')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('audit.common.overallScore', 'Score')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('audit.severity.critical', 'Critical')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('audit.severity.high', 'High')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('audit.severity.medium', 'Medium')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('audit.severity.low', 'Low')}</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map(r => (
              <tr key={r.id} className="border-b border-border transition-fast hover:bg-surfaceElevated">
                <td className="px-3 py-2 font-mono text-text-muted">{fmt(r.created_at)}</td>
                <td className="px-3 py-2 text-right font-mono font-semibold text-text">{r.score}</td>
                <td className="px-3 py-2 text-right font-mono text-danger">{r.critical}</td>
                <td className="px-3 py-2 text-right font-mono text-warning">{r.high}</td>
                <td className="px-3 py-2 text-right font-mono text-accent">{r.medium}</td>
                <td className="px-3 py-2 text-right font-mono text-text-muted">{r.low}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
