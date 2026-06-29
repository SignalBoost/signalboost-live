'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

type Campaign = {
  id: string
  title?: string
  objective?: string
  channel?: string
  status?: string
  risk_level?: string
  created_at?: string
  metadata?: Record<string, any>
  work_items?: Array<{ output?: { title?: string; opening?: string; draft?: string } }>
}

type Props = {
  label: string
  href: string
  icon: string
  active?: boolean
}

const pendingStatuses = new Set(['draft', 'waiting_approval'])

function hasReviewDraft(campaign: Campaign) {
  return Boolean(campaign.work_items?.some(item => item.output))
}

function campaignThumbnail(campaign: Campaign) {
  const channel = campaign.channel || 'campaign'
  if (channel === 'youtube') return '▶️'
  if (channel === 'short_video') return '🎬'
  if (channel === 'linkedin') return '💼'
  if (channel === 'email' || channel === 'outreach') return '✉️'
  return '📣'
}

export default function CosaNotificationCenter({ label, href, icon, active }: Props) {
  const [open, setOpen] = useState(false)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(false)
  const [actingId, setActingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const response = await fetch('/api/cos/campaign-queue?limit=25', { cache: 'no-store' })
      const json = await response.json().catch(() => null)
      setCampaigns(Array.isArray(json?.campaigns) ? json.campaigns : [])
    } catch {
      setCampaigns([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const pending = useMemo(() => campaigns.filter(campaign => pendingStatuses.has(campaign.status || '') && hasReviewDraft(campaign)), [campaigns])
  const publishing = useMemo(() => campaigns.filter(campaign => campaign.status === 'queued' || campaign.status === 'running').slice(0, 3), [campaigns])
  const count = pending.length

  async function act(campaign: Campaign, action: 'approve' | 'request_edits' | 'reject' | 'archive') {
    setActingId(campaign.id)
    try {
      const status = action === 'approve' ? 'approved' : action === 'reject' || action === 'archive' ? 'rejected' : (campaign.status || 'waiting_approval')
      const response = await fetch('/api/cos/campaign-queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: campaign.id, status, action }),
      })
      if (!response.ok) throw new Error('Action failed')
      await load()
    } catch {
      await load()
    } finally {
      setActingId(null)
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 8 }}>
        <Link href={href} className="sb-sidebar__link" style={active ? { background: 'rgba(26,240,255,.14)', color: '#fff', borderColor: 'rgba(26,240,255,.42)', boxShadow: '0 0 24px rgba(26,240,255,.14)' } : undefined}>
          <span aria-hidden="true">{icon}</span><span>{label}</span>
        </Link>
        <button
          type="button"
          aria-label={`${count} pending Marketing and Sales approvals`}
          onClick={() => { setOpen(current => !current); if (!open) load() }}
          style={{
            minWidth: 32,
            height: 26,
            borderRadius: 999,
            border: count ? '1px solid rgba(248,113,113,.7)' : '1px solid rgba(255,255,255,.14)',
            background: count ? 'rgba(248,113,113,.18)' : 'rgba(255,255,255,.06)',
            color: count ? '#fecaca' : 'rgba(255,255,255,.62)',
            fontSize: 11,
            fontWeight: 950,
            cursor: 'pointer',
          }}
        >
          {count || '0'}
        </button>
      </div>

      {open && (
        <div style={{
          position: 'absolute',
          zIndex: 50,
          left: 0,
          top: 'calc(100% + 8px)',
          width: 360,
          maxWidth: 'calc(100vw - 32px)',
          background: 'rgba(2,6,23,.98)',
          border: '1px solid rgba(255,255,255,.16)',
          borderRadius: 18,
          boxShadow: '0 28px 90px rgba(0,0,0,.55)',
          padding: 14,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div>
              <p style={{ margin: 0, color: '#ffc300', fontSize: 11, letterSpacing: '.09em', textTransform: 'uppercase', fontWeight: 950 }}>COSA Notifications</p>
              <h3 style={{ margin: '5px 0 0', color: '#fff', fontSize: 16 }}>Approval center</h3>
            </div>
            <button type="button" onClick={load} disabled={loading} style={smallButton}>{loading ? '...' : 'Refresh'}</button>
          </div>

          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            {pending.length === 0 && <p style={{ color: 'rgba(255,255,255,.58)', fontSize: 13, lineHeight: 1.5, margin: 0 }}>No draft campaigns waiting for approval.</p>}
            {pending.slice(0, 4).map(campaign => (
              <div key={campaign.id} style={{ border: '1px solid rgba(255,255,255,.09)', background: 'rgba(255,255,255,.045)', borderRadius: 14, padding: 12 }}>
                <Link href={`/dashboard/cosa?campaign=${campaign.id}`} style={{ display: 'grid', gridTemplateColumns: '44px 1fr', gap: 10, textDecoration: 'none' }}>
                  <div style={{ height: 44, borderRadius: 12, background: 'linear-gradient(145deg, rgba(255,195,0,.22), rgba(26,240,255,.12))', display: 'grid', placeItems: 'center', fontSize: 22 }}>{campaignThumbnail(campaign)}</div>
                  <div>
                    <strong style={{ color: '#fff', fontSize: 13, lineHeight: 1.35 }}>{campaign.title || 'Untitled campaign'}</strong>
                    <p style={{ color: '#fecaca', fontSize: 11, fontWeight: 850, margin: '5px 0 0' }}>{campaign.status || 'pending'} · {campaign.channel || 'campaign'}</p>
                  </div>
                </Link>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                  <button disabled={actingId === campaign.id} onClick={() => act(campaign, 'approve')} style={actionButton}>Approve</button>
                  <button disabled={actingId === campaign.id} onClick={() => act(campaign, 'request_edits')} style={actionButton}>Request edits</button>
                  <button disabled={actingId === campaign.id} onClick={() => act(campaign, 'reject')} style={dangerButton}>Reject</button>
                  <button disabled={actingId === campaign.id} onClick={() => act(campaign, 'archive')} style={mutedButton}>Archive</button>
                </div>
              </div>
            ))}

            {publishing.length > 0 && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,.09)', paddingTop: 10 }}>
                <p style={{ margin: '0 0 8px', color: '#93c5fd', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 950 }}>Publishing confirmations</p>
                {publishing.map(campaign => (
                  <Link key={campaign.id} href={`/dashboard/cosa?campaign=${campaign.id}`} style={{ display: 'block', color: 'rgba(255,255,255,.72)', fontSize: 12, textDecoration: 'none', marginBottom: 6 }}>
                    {campaign.title || 'Campaign'} · {campaign.status}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <Link href="/dashboard/cosa" style={{ display: 'block', marginTop: 12, color: '#ffc300', fontSize: 12, fontWeight: 900, textDecoration: 'none' }}>View all in Marketing/Sales →</Link>
        </div>
      )}
    </div>
  )
}

const smallButton: React.CSSProperties = { border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.06)', color: '#fff', borderRadius: 9, padding: '6px 8px', fontSize: 11, fontWeight: 850, cursor: 'pointer' }
const actionButton: React.CSSProperties = { border: 'none', background: '#ffc300', color: '#000', borderRadius: 9, padding: '7px 9px', fontSize: 11, fontWeight: 950, cursor: 'pointer' }
const dangerButton: React.CSSProperties = { ...actionButton, background: 'rgba(248,113,113,.18)', color: '#fecaca', border: '1px solid rgba(248,113,113,.38)' }
const mutedButton: React.CSSProperties = { ...actionButton, background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.72)', border: '1px solid rgba(255,255,255,.12)' }
