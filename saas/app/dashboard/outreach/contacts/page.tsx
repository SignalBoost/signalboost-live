'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type Lead = {
  id: string
  business_name?: string
  business_url?: string
  source_platform?: string
  status?: 'pending' | 'approved' | 'rejected'
  outreach_message?: string
  created_at?: string
}

const FILTERS = ['all', 'pending', 'approved', 'rejected'] as const
type Filter = typeof FILTERS[number]

const STATUS_COLOR: Record<string, string> = {
  pending: '#fde68a',
  approved: '#86efac',
  rejected: '#fca5a5',
}

export default function OutreachContactsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [busyId, setBusyId] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/outreach/queue?limit=100', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error || 'Could not load contacts.')
        setLeads([])
        return
      }
      setLeads(Array.isArray(data.outreach) ? data.outreach : [])
    } catch {
      setError('Something went wrong loading contacts.')
      setLeads([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function setStatus(id: string, status: 'approved' | 'rejected') {
    setBusyId(id)
    try {
      const res = await fetch('/api/outreach/queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      const data = await res.json()
      if (res.ok && data.outreach) {
        setLeads(prev => prev.map(l => (l.id === id ? { ...l, ...data.outreach } : l)))
      }
    } catch {
      // keep current state; user can retry
    } finally {
      setBusyId('')
    }
  }

  const visible = filter === 'all' ? leads : leads.filter(l => (l.status || 'pending') === filter)

  return (
    <main className="sb-glass" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <span className="sb-eyebrow">Contacts</span>
          <h1 className="sb-h2" style={{ marginTop: 10 }}>Your analyzed leads, ready for a human call.</h1>
          <p className="sb-body" style={{ maxWidth: 620 }}>
            Each lead was profiled by AI. Approve the ones worth contacting, reject the rest.
          </p>
        </div>
        <Link className="sb-button-primary" href="/dashboard/outreach/discovery">+ Discover new lead</Link>
      </div>

      <div className="sb-cta-row" style={{ marginBottom: 16 }}>
        {FILTERS.map(f => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={filter === f ? 'sb-button-primary' : 'sb-button-secondary'}
          >
            {f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading && <p className="sb-body">Loading contacts…</p>}
      {error && !loading && <p className="sb-caption" style={{ color: '#fca5a5' }}>{error}</p>}
      {!loading && !error && visible.length === 0 && (
        <div className="sb-card" style={{ padding: 24, textAlign: 'center' }}>
          <p className="sb-body" style={{ margin: 0 }}>No leads here yet.</p>
          <div className="sb-cta-row" style={{ justifyContent: 'center', marginTop: 14 }}>
            <Link className="sb-button-primary" href="/dashboard/outreach/discovery">Analyze your first lead</Link>
          </div>
        </div>
      )}

      <section style={{ display: 'grid', gap: 12 }}>
        {visible.map(lead => {
          const status = lead.status || 'pending'
          return (
            <article key={lead.id} className="sb-card" style={{ padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <h2 className="sb-h3" style={{ margin: 0 }}>{lead.business_name || 'Unnamed business'}</h2>
                  {lead.business_url && (
                    <a href={lead.business_url} target="_blank" rel="noreferrer" className="sb-caption" style={{ color: '#7dd3fc' }}>
                      {lead.business_url}
                    </a>
                  )}
                </div>
                <span style={{
                  alignSelf: 'flex-start',
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                  color: STATUS_COLOR[status] || '#fff',
                  border: `1px solid ${STATUS_COLOR[status] || '#fff'}`,
                  borderRadius: 999,
                  padding: '4px 12px',
                }}>{status}</span>
              </div>

              {lead.outreach_message && (
                <p className="sb-body" style={{ fontSize: 14, marginTop: 10 }}>{lead.outreach_message}</p>
              )}

              <div className="sb-cta-row" style={{ marginTop: 14 }}>
                <button
                  className="sb-button-primary"
                  type="button"
                  disabled={busyId === lead.id || status === 'approved'}
                  onClick={() => setStatus(lead.id, 'approved')}
                >
                  {status === 'approved' ? 'Approved' : 'Approve'}
                </button>
                <button
                  className="sb-button-secondary"
                  type="button"
                  disabled={busyId === lead.id || status === 'rejected'}
                  onClick={() => setStatus(lead.id, 'rejected')}
                >
                  {status === 'rejected' ? 'Rejected' : 'Reject'}
                </button>
                <Link className="sb-button-secondary" href="/dashboard/outreach/outreach">Open engine</Link>
              </div>
            </article>
          )
        })}
      </section>
    </main>
  )
}
