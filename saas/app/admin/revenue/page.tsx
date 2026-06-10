'use client'

import { useCallback, useEffect, useState } from 'react'

const GOLD = '#ffc300'

type Breakdown = { line: string; plan: string; count: number; mrr: number }
type Revenue = {
  generatedAt: string
  pricesResolved: boolean
  totals: { mrr: number; arr: number; activeWebsite: number; activePodcast: number; activeTotal: number }
  breakdown: Breakdown[]
}

function money(n: number) {
  return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

export default function AdminRevenuePage() {
  const [data, setData] = useState<Revenue | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notAllowed, setNotAllowed] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/admin/revenue', { cache: 'no-store' })
      if (res.status === 401 || res.status === 403) { setNotAllowed(true); setLoading(false); return }
      const d = await res.json()
      if (!res.ok) { setError(d?.error || 'Could not load revenue.'); setLoading(false); return }
      setData(d)
    } catch {
      setError('Something went wrong loading revenue.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (notAllowed) {
    return (
      <main style={{ padding: 24, color: '#fff', maxWidth: 720, margin: '0 auto' }}>
        <div className="sb-empty" style={{ marginTop: 60 }}>
          <h1 className="sb-h3" style={{ marginTop: 0 }}>Revenue</h1>
          <p className="sb-body" style={{ margin: 0 }}>Only the account owner can view revenue.</p>
        </div>
      </main>
    )
  }

  return (
    <main style={{ color: 'var(--text-primary)', maxWidth: 920, margin: '0 auto' }}>
      <header className="sb-console" style={{ paddingBottom: 12 }}>
        <div className="sb-console__row">
          <div>
            <span className="sb-eyebrow">💰 Admin · Revenue</span>
            <h1 style={{ fontSize: 22, margin: '4px 0' }}>Live MRR from Stripe</h1>
          </div>
          <button onClick={load} disabled={loading} className="sb-button-secondary" style={{ opacity: loading ? 0.6 : 1, fontSize: 13, padding: '9px 16px' }}>
            {loading ? 'Refreshing…' : '↻ Refresh'}
          </button>
        </div>
      </header>

      {error && <p className="sb-caption" style={{ color: '#fca5a5', marginBottom: 12 }}>{error}</p>}
      {loading && !data && <p className="sb-body">Loading…</p>}

      {data && (
        <>
          {!data.pricesResolved && (
            <div style={{ borderLeft: '2px solid rgba(252,165,165,.6)', paddingLeft: 14, marginBottom: 16 }}>
              <p className="sb-caption" style={{ margin: 0, color: '#fca5a5' }}>
                Stripe prices couldn&apos;t be read, so MRR may show $0. Check that STRIPE_SECRET_KEY and the
                STRIPE_PRICE_* variables are set correctly in your environment.
              </p>
            </div>
          )}

          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14, marginBottom: 22 }}>
            <div style={{ borderLeft: '2px solid rgba(255,195,0,.55)', paddingLeft: 14 }}>
              <div style={{ fontSize: 30, fontWeight: 800, color: GOLD, fontFamily: 'ui-monospace, Menlo, monospace', letterSpacing: '-.02em' }}>{money(data.totals.mrr)}</div>
              <div className="sb-caption" style={{ marginTop: 2, textTransform: 'uppercase', letterSpacing: '.1em', fontSize: 10, fontWeight: 800 }}>MRR (monthly recurring)</div>
            </div>
            <div style={{ borderLeft: '2px solid rgba(26,240,255,.4)', paddingLeft: 14 }}>
              <div style={{ fontSize: 30, fontWeight: 800, color: '#9ff7ff', fontFamily: 'ui-monospace, Menlo, monospace', letterSpacing: '-.02em' }}>{money(data.totals.arr)}</div>
              <div className="sb-caption" style={{ marginTop: 2, textTransform: 'uppercase', letterSpacing: '.1em', fontSize: 10, fontWeight: 800 }}>ARR (annual run-rate)</div>
            </div>
            <div style={{ borderLeft: '2px solid rgba(134,239,172,.5)', paddingLeft: 14 }}>
              <div style={{ fontSize: 30, fontWeight: 800, color: '#86efac', fontFamily: 'ui-monospace, Menlo, monospace', letterSpacing: '-.02em' }}>{data.totals.activeTotal}</div>
              <div className="sb-caption" style={{ marginTop: 2, textTransform: 'uppercase', letterSpacing: '.1em', fontSize: 10, fontWeight: 800 }}>Active subscriptions</div>
            </div>
          </section>

          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14, marginBottom: 22 }}>
            <div style={{ borderLeft: '2px solid rgba(125,211,252,.45)', paddingLeft: 14 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#7dd3fc', fontFamily: 'ui-monospace, Menlo, monospace' }}>{data.totals.activeWebsite}</div>
              <div className="sb-caption" style={{ textTransform: 'uppercase', letterSpacing: '.1em', fontSize: 10, fontWeight: 800 }}>Active website plans</div>
            </div>
            <div style={{ borderLeft: '2px solid rgba(196,181,253,.45)', paddingLeft: 14 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#c4b5fd', fontFamily: 'ui-monospace, Menlo, monospace' }}>{data.totals.activePodcast}</div>
              <div className="sb-caption" style={{ textTransform: 'uppercase', letterSpacing: '.1em', fontSize: 10, fontWeight: 800 }}>Active podcast plans</div>
            </div>
          </section>

          <h2 className="sb-eyebrow" style={{ display: 'block', marginBottom: 10 }}>By plan</h2>
          {data.breakdown.length === 0 ? (
            <div className="sb-empty">No active subscriptions yet.</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {data.breakdown.map(b => (
                <div key={`${b.line}:${b.plan}`} style={{ borderTop: '1px solid rgba(255,255,255,.07)', padding: '12px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div>
                    <strong style={{ color: '#fff', textTransform: 'capitalize' }}>{b.line} · {b.plan}</strong>
                    <div className="sb-caption" style={{ marginTop: 2 }}>{b.count} active</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: GOLD, fontFamily: 'ui-monospace, Menlo, monospace' }}>{money(b.mrr)}</div>
                    <div className="sb-caption">/mo</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="sb-caption" style={{ marginTop: 18, opacity: 0.55 }}>
            From active subscriptions in your database, priced live from Stripe. This is a dashboard estimate, not an
            accounting ledger — reconcile against Stripe for official figures. Generated {new Date(data.generatedAt).toLocaleString()}.
          </p>
        </>
      )}
    </main>
  )
}
