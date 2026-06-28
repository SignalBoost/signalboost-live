'use client'

import { useEffect, useState } from 'react'

const GOLD = '#ffc300'

type ReviewItem = {
  id: string
  campaign_id?: string
  title: string
  description: string
  tags?: string[]
  status: string
  video_asset_url?: string | null
  video_asset_path?: string | null
  external_video_id?: string | null
  created_at?: string
}

function formatDate(value?: string) {
  if (!value) return 'Unknown time'
  try { return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }
  catch { return value }
}

export default function CosaVideoReviewPage() {
  const [items, setItems] = useState<ReviewItem[]>([])
  const [campaignId, setCampaignId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  async function load() {
    setLoading(true)
    setMessage('')
    try {
      const res = await fetch('/api/cos/video-review-queue', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Could not load video review queue.')
      setItems(Array.isArray(json.items) ? json.items : [])
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not load video review queue.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function createFromCampaign() {
    if (!campaignId.trim()) {
      setMessage('Paste a campaign ID first.')
      return
    }
    setBusyId('create')
    try {
      const res = await fetch('/api/cos/video-review-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaignId.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Could not create review item.')
      setCampaignId('')
      setMessage('Created video review item. It is waiting for final approval.')
      await load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not create review item.')
    } finally {
      setBusyId(null)
    }
  }

  async function patchItem(id: string, status: 'approved' | 'rejected' | 'ready' | 'scheduled' | 'done') {
    setBusyId(id)
    try {
      const res = await fetch('/api/cos/video-review-queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || `Could not mark item ${status}.`)
      setMessage(`Video review item marked ${status}.`)
      await load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : `Could not mark item ${status}.`)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gap: 18 }}>
      <section style={heroStyle}>
        <p className="sb-eyebrow" style={{ margin: 0 }}>COSA final video approval</p>
        <h1 style={{ color: '#fff', margin: '8px 0 0', fontSize: 32, letterSpacing: '-0.04em' }}>Video review queue</h1>
        <p style={{ color: 'rgba(255,255,255,0.66)', lineHeight: 1.7, maxWidth: 760 }}>
          This is the control point between a finished campaign video and external channel work. COSA should only move forward after final human approval.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a href="/dashboard/cosa/video" style={{ ...secondaryButton, textDecoration: 'none' }}>Video preview</a>
          <a href="/dashboard/cosa" style={{ ...secondaryButton, textDecoration: 'none' }}>COSA dashboard</a>
          <button onClick={load} disabled={loading || !!busyId} style={secondaryButton}>{loading ? 'Loading...' : 'Refresh'}</button>
        </div>
      </section>

      <section style={cardStyle}>
        <p className="sb-eyebrow" style={{ margin: 0 }}>Create from campaign ID</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <input value={campaignId} onChange={(event) => setCampaignId(event.target.value)} placeholder="cos campaign id" style={{ flex: '1 1 280px', border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(0,0,0,0.22)', color: '#fff', borderRadius: 12, padding: '10px 12px' }} />
          <button onClick={createFromCampaign} disabled={!!busyId} style={primaryButton}>Create review item</button>
        </div>
      </section>

      {message && <div style={{ border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(15,23,42,0.75)', color: '#fff', padding: 14, borderRadius: 14 }}>{message}</div>}

      {loading && <p style={{ color: 'rgba(255,255,255,0.55)' }}>Loading review queue...</p>}
      {!loading && items.length === 0 && <section style={cardStyle}><p style={{ color: 'rgba(255,255,255,0.6)' }}>No final video review items yet.</p></section>}

      {items.map((item) => (
        <section key={item.id} style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <p className="sb-eyebrow" style={{ margin: 0 }}>{item.status} · {formatDate(item.created_at)}</p>
              <h2 style={{ color: '#fff', margin: '8px 0 0', fontSize: 20 }}>{item.title}</h2>
              <p style={{ color: 'rgba(255,255,255,0.66)', lineHeight: 1.6 }}>{item.description}</p>
              <p style={{ color: 'rgba(255,255,255,0.48)', fontSize: 12 }}>Campaign: {item.campaign_id || 'unknown'}</p>
            </div>
            <span style={{ color: GOLD, fontWeight: 950 }}>{item.external_video_id ? 'External ID attached' : 'No external ID yet'}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {item.status === 'waiting_approval' && <button disabled={busyId === item.id} onClick={() => patchItem(item.id, 'rejected')} style={secondaryButton}>Reject</button>}
            {item.status === 'waiting_approval' && <button disabled={busyId === item.id} onClick={() => patchItem(item.id, 'approved')} style={primaryButton}>Approve final video</button>}
            {item.status === 'approved' && <button disabled={busyId === item.id} onClick={() => patchItem(item.id, 'ready')} style={primaryButton}>Mark ready</button>}
            {item.status === 'ready' && <button disabled={busyId === item.id} onClick={() => patchItem(item.id, 'scheduled')} style={primaryButton}>Mark scheduled</button>}
            {item.status === 'scheduled' && <button disabled={busyId === item.id} onClick={() => patchItem(item.id, 'done')} style={primaryButton}>Mark done</button>}
          </div>
        </section>
      ))}
    </main>
  )
}

const heroStyle: React.CSSProperties = {
  border: '1px solid rgba(255,195,0,0.22)',
  borderRadius: 24,
  padding: 24,
  background: 'linear-gradient(145deg, rgba(15,23,42,0.94), rgba(2,6,23,0.98))',
}

const cardStyle: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 18,
  padding: 18,
  background: 'rgba(15,23,42,0.72)',
}

const primaryButton: React.CSSProperties = {
  border: 'none',
  background: GOLD,
  color: '#000',
  borderRadius: 12,
  padding: '10px 14px',
  fontWeight: 950,
  cursor: 'pointer',
}

const secondaryButton: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.16)',
  background: 'rgba(255,255,255,0.06)',
  color: '#fff',
  borderRadius: 12,
  padding: '10px 14px',
  fontWeight: 850,
  cursor: 'pointer',
}
