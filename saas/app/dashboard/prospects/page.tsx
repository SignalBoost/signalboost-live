'use client'

import { useEffect, useState } from 'react'

type Prospect = {
  id: string
  business_name: string
  category: string | null
  location: string | null
  website: string | null
  phone: string | null
  status: string
  web_presence_score: number | null
  assessment: string | null
}

const STATUSES = ['all', 'discovered', 'contacted', 'replied', 'customer', 'unsubscribed', 'archived']

export default function ProspectsPage() {
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [status, setStatus] = useState('all')
  const [query, setQuery] = useState('restaurants in Merida')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function loadProspects(nextStatus = status) {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ limit: '150' })
      if (nextStatus !== 'all') params.set('status', nextStatus)
      const res = await fetch(`/api/prospects?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load prospects')
      setProspects(data.prospects || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load prospects')
    } finally {
      setLoading(false)
    }
  }

  async function discover() {
    const cleanQuery = query.trim()
    if (!cleanQuery || loading) return
    setLoading(true)
    setMessage('')
    setError('')
    try {
      const res = await fetch('/api/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: cleanQuery, maxResults: 20 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Discovery failed')
      setMessage(`Found ${data.found || 0}. Saved ${data.saved || 0} new prospects.`)
      await loadProspects(status)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Discovery failed')
    } finally {
      setLoading(false)
    }
  }

  async function updateStatus(id: string, nextStatus: string) {
    const previous = prospects
    setProspects(items => items.map(item => item.id === id ? { ...item, status: nextStatus } : item))
    try {
      const res = await fetch(`/api/prospects?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not update status')
    } catch (err) {
      setProspects(previous)
      setError(err instanceof Error ? err.message : 'Could not update status')
    }
  }

  useEffect(() => {
    loadProspects(status)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  return (
    <main className="sb-page">
      <div className="sb-kicker">Revenue engine</div>
      <h1 className="sb-title" style={{ fontSize: 'clamp(36px, 5vw, 62px)' }}>Prospects pipeline</h1>
      <p className="sb-subtitle">Discover businesses, track outreach stages, and build the first distribution engine for SignalBoost.</p>

      <section className="sb-card" style={{ padding: 18, margin: '24px 0' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input className="sb-input" value={query} onChange={event => setQuery(event.target.value)} style={{ flex: 1, minWidth: 240, padding: 12 }} />
          <button className="sb-button-primary" onClick={discover} disabled={loading || !query.trim()}>{loading ? 'Working...' : 'Discover'}</button>
          <button className="sb-button-ghost" onClick={() => loadProspects(status)} disabled={loading}>Refresh</button>
        </div>
        {(message || error) && <div style={{ marginTop: 12, color: error ? 'var(--red)' : 'var(--green)' }}>{error || message}</div>}
      </section>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        {STATUSES.map(item => (
          <button key={item} className={status === item ? 'sb-button-primary' : 'sb-button-ghost'} onClick={() => setStatus(item)} style={{ padding: '8px 13px', fontSize: 12 }}>{item}</button>
        ))}
      </div>

      <section className="sb-card" style={{ overflow: 'hidden' }}>
        {loading && prospects.length === 0 ? (
          <div style={{ padding: 28, color: 'var(--text-muted)' }}>Loading prospects...</div>
        ) : prospects.length === 0 ? (
          <div style={{ padding: 34, color: 'var(--text-muted)' }}>No prospects found. Run discovery to fill the pipeline.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 900 }}>
              <thead><tr><th style={{ textAlign: 'left', padding: 14 }}>Business</th><th style={{ textAlign: 'left', padding: 14 }}>Contact</th><th style={{ textAlign: 'left', padding: 14 }}>Assessment</th><th style={{ textAlign: 'left', padding: 14 }}>Status</th></tr></thead>
              <tbody>
                {prospects.map(prospect => (
                  <tr key={prospect.id} style={{ borderTop: '1px solid var(--border-soft)' }}>
                    <td style={{ padding: 14, verticalAlign: 'top' }}><div style={{ color: '#fff', fontWeight: 900 }}>{prospect.business_name}</div><div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{prospect.category || 'Unknown category'}</div><div style={{ color: 'var(--text-faint)', fontSize: 12 }}>{prospect.location || 'No location'}</div></td>
                    <td style={{ padding: 14, verticalAlign: 'top' }}>{prospect.website ? <a href={prospect.website} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)' }}>Website</a> : <span style={{ color: 'var(--text-faint)' }}>No website</span>}<div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{prospect.phone || 'No phone'}</div></td>
                    <td style={{ padding: 14, verticalAlign: 'top', color: 'var(--text-muted)' }}>{prospect.assessment || `Score: ${prospect.web_presence_score ?? 'unknown'}`}</td>
                    <td style={{ padding: 14, verticalAlign: 'top' }}><select className="sb-input" value={prospect.status} onChange={event => updateStatus(prospect.id, event.target.value)} style={{ padding: 10 }}>{STATUSES.filter(item => item !== 'all').map(item => <option key={item} value={item}>{item}</option>)}</select></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
