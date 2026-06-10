'use client'

import { useCallback, useEffect, useState } from 'react'

const GOLD = '#ffc300'

type Overview = {
  generatedAt: string
  content: {
    reviews: number
    approvedReviews: number
    campaigns: number
    activeCampaigns: number
    projects: number
    publishedProjects: number
    leads: number
    approvedLeads: number
  }
  accounts: {
    totalUsers: number
    teamMembers: number
    subscriptions: number
    plans: Record<string, number>
  }
}

function Stat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div style={{ borderLeft: '2px solid rgba(26,240,255,.4)', paddingLeft: 14 }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: '#9ff7ff', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', letterSpacing: '-.02em' }}>{value}</div>
      <div className="sb-caption" style={{ marginTop: 2, textTransform: 'uppercase', letterSpacing: '.1em', fontSize: 10, fontWeight: 800 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/admin/overview', { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) { setError(d?.error || 'Could not load overview.'); setLoading(false); return }
      setData(d)
    } catch {
      setError('Something went wrong loading the overview.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <main style={{ color: 'var(--text-primary)', maxWidth: 1000, margin: '0 auto' }}>
      <header className="sb-console" style={{ paddingBottom: 12 }}>
        <div className="sb-console__row">
          <div>
            <span className="sb-eyebrow">🛰️ Admin</span>
            <h1 style={{ fontSize: 22, margin: '4px 0' }}>Overview</h1>
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
          <h2 className="sb-eyebrow" style={{ display: 'block', marginBottom: 12 }}>Accounts</h2>
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 14, marginBottom: 22 }}>
            <Stat label="Registered users" value={data.accounts.totalUsers} />
            <Stat label="Team members" value={data.accounts.teamMembers} />
            <Stat label="Subscriptions" value={data.accounts.subscriptions} />
          </section>

          {Object.keys(data.accounts.plans).length > 0 && (
            <section style={{ borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 14, marginBottom: 22 }}>
              <h3 className="sb-eyebrow" style={{ display: 'block', marginBottom: 10 }}>Plan distribution</h3>
              <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
                {Object.entries(data.accounts.plans).map(([plan, n]) => (
                  <div key={plan}>
                    <span style={{ fontSize: 22, fontWeight: 800, color: GOLD }}>{n}</span>
                    <span className="sb-caption" style={{ marginLeft: 6, textTransform: 'capitalize' }}>{plan}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <h2 className="sb-eyebrow" style={{ display: 'block', marginBottom: 12, marginTop: 4 }}>Content &amp; activity</h2>
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 14, marginBottom: 22 }}>
            <Stat label="Reviews" value={data.content.reviews} sub={`${data.content.approvedReviews} approved`} />
            <Stat label="Campaigns" value={data.content.campaigns} sub={`${data.content.activeCampaigns} active`} />
            <Stat label="Sites built" value={data.content.projects} sub={`${data.content.publishedProjects} published`} />
            <Stat label="Outreach leads" value={data.content.leads} sub={`${data.content.approvedLeads} approved`} />
          </section>

          <section style={{ borderLeft: '2px solid rgba(255,195,0,.5)', paddingLeft: 14 }}>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 900, color: '#ffc300' }}>Not yet instrumented</h3>
            <p className="sb-caption" style={{ margin: '6px 0 0' }}>
              Revenue/MRR, AI usage &amp; cost, email performance, and system health aren&apos;t tracked yet — they need
              Stripe data, request logging, and telemetry wired in. Those become real once that instrumentation exists.
              Everything above is live data counted from your database.
            </p>
          </section>

          <p className="sb-caption" style={{ marginTop: 18, opacity: 0.5 }}>
            Generated {new Date(data.generatedAt).toLocaleString()}
          </p>
        </>
      )}
    </main>
  )
}
