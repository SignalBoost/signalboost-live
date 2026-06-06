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
    <div className="sb-card" style={{ padding: 18 }}>
      <div style={{ fontSize: 28, fontWeight: 900, color: '#fff' }}>{value}</div>
      <div className="sb-caption" style={{ marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginTop: 4 }}>{sub}</div>}
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
    <main style={{ padding: 24, color: '#fff', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <span className="sb-eyebrow">Admin</span>
          <h1 className="sb-h2" style={{ marginTop: 8, marginBottom: 2 }}>Overview</h1>
          <p className="sb-body" style={{ margin: 0 }}>Real counts from your live data.</p>
        </div>
        <button onClick={load} disabled={loading} className="sb-button-secondary" style={{ opacity: loading ? 0.6 : 1 }}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <p className="sb-caption" style={{ color: '#fca5a5', marginBottom: 12 }}>{error}</p>}
      {loading && !data && <p className="sb-body">Loading…</p>}

      {data && (
        <>
          <h2 className="sb-h3" style={{ marginBottom: 10 }}>Accounts</h2>
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 26 }}>
            <Stat label="Registered users" value={data.accounts.totalUsers} />
            <Stat label="Team members" value={data.accounts.teamMembers} />
            <Stat label="Subscriptions" value={data.accounts.subscriptions} />
          </section>

          {Object.keys(data.accounts.plans).length > 0 && (
            <section className="sb-card" style={{ padding: 18, marginBottom: 26 }}>
              <h3 className="sb-h3" style={{ marginTop: 0, fontSize: 15 }}>Plan distribution</h3>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 8 }}>
                {Object.entries(data.accounts.plans).map(([plan, n]) => (
                  <div key={plan}>
                    <span style={{ fontSize: 22, fontWeight: 800, color: GOLD }}>{n}</span>
                    <span className="sb-caption" style={{ marginLeft: 6, textTransform: 'capitalize' }}>{plan}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <h2 className="sb-h3" style={{ marginBottom: 10 }}>Content & activity</h2>
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 26 }}>
            <Stat label="Reviews" value={data.content.reviews} sub={`${data.content.approvedReviews} approved`} />
            <Stat label="Campaigns" value={data.content.campaigns} sub={`${data.content.activeCampaigns} active`} />
            <Stat label="Sites built" value={data.content.projects} sub={`${data.content.publishedProjects} published`} />
            <Stat label="Outreach leads" value={data.content.leads} sub={`${data.content.approvedLeads} approved`} />
          </section>

          <section className="sb-card" style={{ padding: 16 }}>
            <h3 className="sb-h3" style={{ marginTop: 0, fontSize: 14 }}>Not yet instrumented</h3>
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
