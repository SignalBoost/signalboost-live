'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type Lead = {
  id: string
  business_name?: string
  business_url?: string
  status?: 'pending' | 'approved' | 'rejected'
  created_at?: string
}

const TOOLS = [
  { icon: '🔎', title: 'Discovery', desc: 'Analyze a new business and queue it.', href: '/dashboard/outreach/discovery' },
  { icon: '📇', title: 'Contacts', desc: 'Review and approve analyzed leads.', href: '/dashboard/outreach/contacts' },
  { icon: '📊', title: 'Pipeline', desc: 'Track prospects by stage.', href: '/dashboard/outreach/pipeline' },
  { icon: '⚙️', title: 'Engine', desc: 'Turn a lead into an approved campaign.', href: '/dashboard/outreach/outreach' },
]

const STATUS_COLOR: Record<string, string> = { pending: '#fde68a', approved: '#86efac', rejected: '#fca5a5' }

export default function OutreachHubPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [sendLimit, setSendLimit] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch('/api/outreach/queue?limit=100', { cache: 'no-store' })
        const data = await res.json()
        if (!active) return
        if (!res.ok) setError(data?.error || 'Could not load outreach data.')
        setLeads(Array.isArray(data.outreach) ? data.outreach : [])
        setSendLimit(data.sendLimit ?? null)
      } catch {
        if (active) setError('Something went wrong loading outreach.')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  const count = (s: string) => leads.filter(l => (l.status || 'pending') === s).length
  const stats = [
    { label: 'Total leads', value: leads.length, accent: '#fff' },
    { label: 'Pending', value: count('pending'), accent: STATUS_COLOR.pending },
    { label: 'Approved', value: count('approved'), accent: STATUS_COLOR.approved },
    { label: 'Rejected', value: count('rejected'), accent: STATUS_COLOR.rejected },
  ]
  const recent = leads.slice(0, 5)
  const remaining = typeof sendLimit?.remaining === 'number' ? sendLimit.remaining : null
  const dailyLimit = typeof sendLimit?.limit === 'number' ? sendLimit.limit : null

  return (
    <main className="sb-glass" style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <span className="sb-eyebrow">Outreach</span>
        <h1 className="sb-h2" style={{ marginTop: 10 }}>Your outreach command center.</h1>
        <p className="sb-body" style={{ maxWidth: 640 }}>
          Analyze businesses, review AI-prepared leads, and move prospects through the pipeline — all from one place.
        </p>
        {remaining !== null && dailyLimit !== null && (
          <p className="sb-caption" style={{ marginTop: 4 }}>{remaining} of {dailyLimit} sends left today.</p>
        )}
      </div>

      {loading && <p className="sb-body">Loading…</p>}
      {error && !loading && <p className="sb-caption" style={{ color: '#fca5a5' }}>{error}</p>}

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginBottom: 24 }}>
        {stats.map(s => (
          <div key={s.label} className="sb-card" style={{ padding: 18 }}>
            <div style={{ fontSize: 32, fontWeight: 900, color: s.accent }}>{s.value}</div>
            <div className="sb-caption">{s.label}</div>
          </div>
        ))}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14, marginBottom: 24 }}>
        {TOOLS.map(tool => (
          <Link key={tool.title} href={tool.href} className="sb-card" style={{ padding: 20, textDecoration: 'none', color: '#fff', display: 'block' }}>
            <div style={{ fontSize: 26 }}>{tool.icon}</div>
            <h2 className="sb-h3" style={{ margin: '10px 0 4px' }}>{tool.title}</h2>
            <p className="sb-body" style={{ fontSize: 14, margin: 0 }}>{tool.desc}</p>
          </Link>
        ))}
      </section>

      <section className="sb-card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <h2 className="sb-h3" style={{ margin: 0 }}>Recent leads</h2>
          <Link className="sb-caption" href="/dashboard/outreach/contacts" style={{ color: '#7dd3fc' }}>View all →</Link>
        </div>
        {recent.length === 0 && !loading ? (
          <p className="sb-body" style={{ margin: 0 }}>No leads yet. Start with <Link href="/dashboard/outreach/discovery" style={{ color: '#7dd3fc' }}>Discovery</Link>.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {recent.map(lead => (
              <div key={lead.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.business_name || lead.business_url || 'Unnamed business'}</span>
                <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', color: STATUS_COLOR[lead.status || 'pending'] }}>{lead.status || 'pending'}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
