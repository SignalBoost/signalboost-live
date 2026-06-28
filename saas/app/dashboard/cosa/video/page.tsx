'use client'

import { useEffect, useMemo, useState } from 'react'
import { VideoPreviewRenderer } from '@/lib/cos/ui/VideoPreviewRenderer'

const GOLD = '#ffc300'

type CampaignOutput = {
  title?: string
  opening?: string
  draft?: string
  call_to_action?: string
  scenes?: Array<{ label?: string; narration?: string; visual_direction?: string }>
}

type Campaign = {
  id: string
  title: string
  objective?: string
  channel?: string
  status?: string
  risk_level?: string
  created_at?: string
  work_items?: Array<{ status?: string; output?: CampaignOutput }>
}

function outputFor(campaign: Campaign) {
  return campaign.work_items?.find((item) => item.output)?.output
}

export default function CosaVideoPreviewPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  async function load() {
    setLoading(true)
    setMessage('')
    try {
      const res = await fetch('/api/cos/campaign-queue', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Could not load campaigns.')
      setCampaigns(Array.isArray(json.campaigns) ? json.campaigns : [])
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not load campaigns.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const videoCampaigns = useMemo(() => campaigns.filter((campaign) => ['youtube', 'short_video'].includes(String(campaign.channel || '')) || outputFor(campaign)), [campaigns])

  async function createCampaign() {
    setBusyId('create')
    try {
      const res = await fetch('/api/cos/campaign-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Could not create campaign.')
      setMessage('Created a COSA campaign. Approve it on the main COSA dashboard or approve it here before generating preview.')
      await load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not create campaign.')
    } finally {
      setBusyId(null)
    }
  }

  async function patchCampaign(id: string, status: 'approved' | 'queued') {
    setBusyId(id)
    try {
      const res = await fetch('/api/cos/campaign-queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || `Could not mark campaign ${status}.`)
      await load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : `Could not mark campaign ${status}.`)
    } finally {
      setBusyId(null)
    }
  }

  async function generatePreview(id: string) {
    setBusyId(id)
    try {
      const res = await fetch('/api/cos/script-worker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Could not generate video preview.')
      setMessage('Video preview generated. This is a browser-rendered preview; MP4 export is the next worker stage.')
      await load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not generate video preview.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gap: 18 }}>
      <section style={{ border: '1px solid rgba(255,195,0,0.22)', borderRadius: 24, padding: 24, background: 'linear-gradient(145deg, rgba(15,23,42,0.94), rgba(2,6,23,0.98))' }}>
        <p className="sb-eyebrow" style={{ margin: 0 }}>COSA Video Studio</p>
        <h1 style={{ color: '#fff', margin: '8px 0 0', fontSize: 34, letterSpacing: '-0.04em' }}>Campaign video preview renderer</h1>
        <p style={{ color: 'rgba(255,255,255,0.65)', lineHeight: 1.7, maxWidth: 760 }}>
          This page shows the visible rendering step for COSA video campaigns. It turns approved campaign scenes into a playable 16:9 preview inside the browser. Final MP4 export will require the FFmpeg render worker pipeline.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={load} disabled={loading || !!busyId} style={secondaryButton}>{loading ? 'Loading...' : 'Refresh'}</button>
          <button onClick={createCampaign} disabled={!!busyId} style={primaryButton}>Create campaign</button>
          <a href="/dashboard/cosa" style={{ ...secondaryButton, textDecoration: 'none' }}>Back to COSA</a>
        </div>
      </section>

      {message && <div style={{ border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(15,23,42,0.75)', color: '#fff', padding: 14, borderRadius: 14 }}>{message}</div>}

      {loading && <p style={{ color: 'rgba(255,255,255,0.55)' }}>Loading video campaigns...</p>}

      {!loading && videoCampaigns.length === 0 && (
        <section style={cardStyle}>
          <h2 style={{ color: '#fff', margin: 0 }}>No video campaigns yet</h2>
          <p style={{ color: 'rgba(255,255,255,0.62)', lineHeight: 1.6 }}>Create a campaign, approve it, then generate a preview.</p>
        </section>
      )}

      {videoCampaigns.map((campaign) => {
        const output = outputFor(campaign)
        const canApprove = campaign.status === 'waiting_approval' || campaign.status === 'draft'
        const canGenerate = campaign.status === 'approved' || campaign.status === 'queued' || campaign.status === 'running'
        return (
          <section key={campaign.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <p className="sb-eyebrow" style={{ margin: 0 }}>{campaign.channel || 'campaign'} · {campaign.status || 'waiting_approval'}</p>
                <h2 style={{ color: '#fff', margin: '8px 0 0', fontSize: 22 }}>{campaign.title}</h2>
                <p style={{ color: 'rgba(255,255,255,0.62)', lineHeight: 1.65 }}>{campaign.objective || 'No objective attached.'}</p>
              </div>
              <span style={{ color: GOLD, fontSize: 12, fontWeight: 950, textTransform: 'uppercase' }}>{campaign.risk_level || 'medium'} risk</span>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              {canApprove && <button disabled={busyId === campaign.id} onClick={() => patchCampaign(campaign.id, 'approved')} style={primaryButton}>Approve campaign</button>}
              {campaign.status === 'approved' && <button disabled={busyId === campaign.id} onClick={() => patchCampaign(campaign.id, 'queued')} style={secondaryButton}>Queue worker</button>}
              {canGenerate && !output && <button disabled={busyId === campaign.id} onClick={() => generatePreview(campaign.id)} style={primaryButton}>Generate video preview</button>}
            </div>

            {output ? (
              <>
                <VideoPreviewRenderer title={output.title || campaign.title} scenes={output.scenes || []} callToAction={output.call_to_action} />
                <details style={{ marginTop: 12 }}>
                  <summary style={{ color: GOLD, cursor: 'pointer', fontWeight: 900 }}>Show generated draft</summary>
                  <pre style={{ whiteSpace: 'pre-wrap', color: 'rgba(255,255,255,0.8)', background: 'rgba(0,0,0,0.28)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12, fontSize: 12, lineHeight: 1.55, maxHeight: 360, overflow: 'auto' }}>{output.draft}</pre>
                </details>
              </>
            ) : (
              <p style={{ color: 'rgba(255,255,255,0.5)', marginTop: 14 }}>No rendered preview yet.</p>
            )}
          </section>
        )
      })}
    </main>
  )
}

const cardStyle: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 18,
  padding: 18,
  background: 'rgba(15,23,42,0.72)',
  boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
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
