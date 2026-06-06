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
        <div className="sb-card" style={{ padding: 28, textAlign: 'center' }}>
          <h1 className="sb-h3" style={{ marginTop: 0 }}>Revenue</h1>
          <p className="sb-body" style={{ margin: 0 }}>Only the account owner can view revenue.</p>
        </div>
      </main>
    )
  }

  return (
    <main style={{ padding: 24, color: '#fff', maxWidth: 920, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <span className="sb-eyebrow">Admin</span>
          <h1 className="sb-h2" style={{ marginTop: 8, marginBottom: 2 }}>Revenue</h1>
          <p className="sb-body" style={{ margin: 0 }}>Live MRR from active subscriptions, priced from Stripe.</p>
        </div>
        <button onClick={load} disabled={loading} className="sb-button-secondary" style={{ opacity: loading ? 0.6 : 1 }}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <p className="sb-caption" style={{ color: '#fca5a5', marginBottom: 12 }}>{error}</p>}
      {loading && !data && <p className="sb-body">Loading…</p>}

      {data && (
        <>
          {!data.pricesResolved && (
            <div className="sb-card" style={{ padding: 14, marginBottom: 16, border: '1px solid rgba(252,165,165,.3)' }}>
              <p className="sb-caption" style={{ margin: 0, color: '#fca5a5' }}>
                Stripe prices couldn&apos;t be read, so MRR may show $0. Check that STRIPE_SECRET_KEY and the
                STRIPE_PRICE_* variables are set correctly in your environment.
              </p>
            </div>
          )}

          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 26 }}>
            <div className="sb-card" style={{ padding: 18 }}>
              <div style={{ fontSize: 30, fontWeight: 900, color: GOLD }}>{money(data.totals.mrr)}</div>
              <div className="sb-caption" style={{ marginTop: 2 }}>MRR (monthly recurring)</div>
            </div>
            <div className="sb-card" style={{ padding: 18 }}>
              <div style={{ fontSize: 30, fontWeight: 900, color: '#fff' }}>{money(data.totals.arr)}</div>
              <div className="sb-caption" style={{ marginTop: 2 }}>ARR (annual run-rate)</div>
            </div>
            <div className="sb-card" style={{ padding: 18 }}>
              <div style={{ fontSize: 30, fontWeight: 900, color: '#86efac' }}>{data.totals.activeTotal}</div>
              <div className="sb-caption" style={{ marginTop: 2 }}>Active subscriptions</div>
            </div>
          </section>

          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 26 }}>
            <div className="sb-card" style={{ padding: 16 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#7dd3fc' }}>{data.totals.activeWebsite}</div>
              <div className="sb-caption">Active website plans</div>
            </div>
            <div className="sb-card" style={{ padding: 16 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#c4b5fd' }}>{data.totals.activePodcast}</div>
              <div className="sb-caption">Active podcast plans</div>
            </div>
          </section>

          <h2 className="sb-h3" style={{ marginBottom: 10 }}>By plan</h2>
          {data.breakdown.length === 0 ? (
            <div className="sb-card" style={{ padding: 24, textAlign: 'center' }}>
              <p className="sb-body" style={{ margin: 0 }}>No active subscriptions yet.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {data.breakdown.map(b => (
                <div key={`${b.line}:${b.plan}`} className="sb-card" style={{ padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div>
                    <strong style={{ color: '#fff', textTransform: 'capitalize' }}>{b.line} · {b.plan}</strong>
                    <div className="sb-caption" style={{ marginTop: 2 }}>{b.count} active</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: GOLD }}>{money(b.mrr)}</div>
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
