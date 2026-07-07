'use client'

import { useEffect, useState } from 'react'

const GOLD = '#ffc300'
const CYAN = '#1af0ff'
const GREEN = '#34d399'
const RED = '#fca5a5'
const panel = { background: 'rgba(15,23,42,.78)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 18, padding: 18 } as const
const button = { border: 'none', background: GOLD, color: '#000', borderRadius: 12, padding: '10px 14px', fontWeight: 900, cursor: 'pointer' } as const
const approveButton = { border: 'none', background: GREEN, color: '#001018', borderRadius: 12, padding: '10px 14px', fontWeight: 950, cursor: 'pointer' } as const
const cyanButton = { border: 'none', background: CYAN, color: '#001018', borderRadius: 12, padding: '10px 14px', fontWeight: 900, cursor: 'pointer' } as const
const ghost = { border: '1px solid rgba(255,255,255,.18)', background: 'rgba(255,255,255,.06)', color: '#fff', borderRadius: 12, padding: '10px 14px', fontWeight: 800, cursor: 'pointer' } as const

function safe(value: any) {
  return value == null || value === '' ? '-' : String(value)
}

function fmt(value: any) {
  if (!value) return '-'
  const d = new Date(String(value))
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function shortId(value: any) {
  return String(value || '').slice(0, 8) || '-'
}

function progressFor(campaign: any, finalReady: boolean, rawOnly: boolean) {
  const video = campaign?.video || {}
  const stage = String(video?.stage || '').toLowerCase()
  const hasBase = Boolean(video?.hasKlingUrl || rawOnly)
  const voiced = Array.isArray(video?.voicedLangs) && video.voicedLangs.length > 0
  const branded = Boolean(video?.branded) || (Array.isArray(video?.brandedLangs) && video.brandedLangs.length > 0)
  if (finalReady) return { percent: 100, label: 'Final branded preview ready', color: GREEN }
  if (stage === 'failed' || String(campaign?.eligibility || '').startsWith('STUCK')) return { percent: 100, label: 'Needs attention', color: RED }
  if (!video?.stage) return { percent: 10, label: 'Preparing video job', color: GOLD }
  if (stage === 'rendering' && !hasBase) return { percent: 30, label: 'Rendering base video', color: CYAN }
  if (hasBase && !voiced && !branded) return { percent: 55, label: 'Base ready. Voice and captions next.', color: GOLD }
  if (voiced && !branded) return { percent: 78, label: 'Voice/captions ready. Branding next.', color: CYAN }
  if (branded && !finalReady) return { percent: 92, label: 'Branding detected. Final preview syncing.', color: CYAN }
  return { percent: rawOnly ? 50 : 35, label: 'Processing video pipeline', color: CYAN }
}

function PipelineProgress({ info }: { info: ReturnType<typeof progressFor> }) {
  return <div style={{ marginTop: 12, border: '1px solid rgba(255,255,255,.1)', borderRadius: 14, padding: 12, background: 'rgba(0,0,0,.2)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
      <strong style={{ color: info.color, fontSize: 13 }}>{info.label}</strong>
      <span style={{ color: 'rgba(255,255,255,.65)', fontSize: 12, fontWeight: 900 }}>{info.percent}%</span>
    </div>
    <div style={{ height: 12, borderRadius: 999, background: 'rgba(255,255,255,.08)', overflow: 'hidden', marginTop: 10 }}>
      <div style={{ width: String(info.percent) + '%', height: '100%', borderRadius: 999, background: info.color }} />
    </div>
    <p style={{ color: 'rgba(255,255,255,.55)', margin: '8px 0 0', fontSize: 12 }}>Steps: render base video - add voice/captions - burn brand banner - final preview.</p>
  </div>
}

export default function CosaVideoPipelinePage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [approvingId, setApprovingId] = useState('')

  async function load(path = '/api/cos/video-pipeline-xray') {
    setLoading(true)
    setMessage('')
    try {
      const res = await fetch(path, { cache: 'no-store', credentials: 'include' })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Could not load video pipeline.')
      setData(json)
    } catch (e: any) {
      setMessage(e?.message || 'Could not load video pipeline.')
    } finally {
      setLoading(false)
    }
  }

  async function kick() { await load('/api/cos/video-pipeline-xray?kick=1') }

  async function kickBranding() {
    setLoading(true)
    setMessage('')
    try {
      const res = await fetch('/api/cos/brand-overlay-dispatch', { method: 'POST', cache: 'no-store', credentials: 'include' })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Could not dispatch branding worker.')
      setData((prev: any) => ({ ...(prev || {}), actions: [{ action: 'brand-overlay-dispatch', ...json }] }))
    } catch (e: any) {
      setMessage(e?.message || 'Could not dispatch branding worker.')
    } finally {
      setLoading(false)
    }
  }

  async function approveCampaign(id: string) {
    setApprovingId(id)
    setMessage('')
    try {
      const res = await fetch('/api/cos/campaign-queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id, status: 'approved' }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Approval failed.')
      setMessage(json.autoPublish?.published ? 'Approved and published. Check your email for the YouTube link.' : 'Approved. Publishing result is shown in the campaign metadata.')
      await load()
    } catch (e: any) {
      setMessage(e?.message || 'Approval failed.')
    } finally {
      setApprovingId('')
    }
  }

  async function reset(id: string) { await load(`/api/cos/video-pipeline-xray?reset=${encodeURIComponent(id)}&kick=1`) }

  useEffect(() => { load() }, [])
  const campaigns = Array.isArray(data?.campaigns) ? data.campaigns : []

  return <main style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gap: 18 }}>
    <section style={{ ...panel, background: 'linear-gradient(145deg, rgba(15,23,42,.96), rgba(2,6,23,.98))' }}>
      <p style={{ margin: 0, color: GOLD, fontSize: 12, fontWeight: 950, letterSpacing: '.12em', textTransform: 'uppercase' }}>COSA Video Pipeline</p>
      <h1 style={{ color: '#fff', margin: '10px 0 0', fontSize: 32 }}>Final video review</h1>
      <p style={{ color: 'rgba(255,255,255,.68)', lineHeight: 1.65, maxWidth: 820 }}>This page separates raw base renders from final campaign videos. Only approve after you watch the final branded preview.</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
        <button onClick={() => load()} disabled={loading} style={ghost}>{loading ? 'Loading...' : 'Refresh'}</button>
        <button onClick={kick} disabled={loading} style={button}>Kick missing renders</button>
        <button onClick={kickBranding} disabled={loading} style={cyanButton}>Kick branding worker</button>
        <a href="/dashboard/cosa" style={{ ...ghost, textDecoration: 'none' }}>Back to approval dashboard</a>
      </div>
      {message && <p style={{ color: message.toLowerCase().includes('fail') ? RED : GREEN, marginTop: 12 }}>{message}</p>}
    </section>

    {Array.isArray(data?.actions) && data.actions.length > 0 && <section style={panel}>
      <h2 style={{ color: '#fff', margin: 0, fontSize: 20 }}>Action result</h2>
      <pre style={{ color: 'rgba(255,255,255,.8)', whiteSpace: 'pre-wrap', background: 'rgba(0,0,0,.28)', borderRadius: 12, padding: 12, overflow: 'auto' }}>{JSON.stringify(data.actions, null, 2)}</pre>
    </section>}

    <section style={panel}>
      <h2 style={{ color: '#fff', margin: 0, fontSize: 20 }}>Recent video campaigns</h2>
      <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
        {campaigns.length === 0 && <p style={{ color: 'rgba(255,255,255,.62)' }}>{loading ? 'Loading...' : 'No recent video campaigns found.'}</p>}
        {campaigns.map((campaign: any) => {
          const video = campaign.video || null
          const stage = video?.stage || 'no video metadata'
          const finalReady = video?.branded === true && Boolean(video?.finalUrl || video?.previewUrl) && video?.previewKind === 'branded final'
          const rawOnly = Boolean(video?.previewUrl) && !finalReady
          const color = finalReady ? GREEN : stage === 'failed' ? RED : stage === 'rendering' ? CYAN : GOLD
          const stuck = String(campaign.eligibility || '').startsWith('STUCK') || stage === 'failed'
          const previewUrl = finalReady && video?.previewUrl ? String(video.previewUrl) : ''
          const progress = progressFor(campaign, finalReady, rawOnly)
          return <article key={campaign.id} style={{ border: finalReady ? '1px solid rgba(52,211,153,.35)' : rawOnly ? '1px solid rgba(255,195,0,.35)' : '1px solid rgba(255,255,255,.1)', borderRadius: 14, padding: 14, background: finalReady ? 'rgba(52,211,153,.06)' : rawOnly ? 'rgba(255,195,0,.06)' : 'rgba(2,6,23,.45)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <strong style={{ color: '#fff' }}>{campaign.title || campaign.id}</strong>
                <p style={{ color: 'rgba(255,255,255,.5)', margin: '4px 0 0', fontSize: 12 }}>Video ID {shortId(campaign.id)} - {campaign.channel} - {campaign.status}</p>
              </div>
              <span style={{ color, fontSize: 12, fontWeight: 900 }}>{finalReady ? 'FINAL READY' : rawOnly ? 'RAW DRAFT ONLY' : stage}</span>
            </div>

            <PipelineProgress info={progress} />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginTop: 10 }}>
              <small style={{ color: 'rgba(255,255,255,.68)' }}>Created: {fmt(campaign.created_at)}</small>
              <small style={{ color: 'rgba(255,255,255,.68)' }}>Final approval: {fmt(campaign.approved_at)}</small>
              <small style={{ color: 'rgba(255,255,255,.68)' }}>Render started: {fmt(video?.started_at)}</small>
              <small style={{ color: 'rgba(255,255,255,.68)' }}>Request: {shortId(video?.requestId)}</small>
            </div>

            <p style={{ color: 'rgba(255,255,255,.72)', lineHeight: 1.55 }}>{campaign.eligibility}</p>

            {previewUrl && <div style={{ margin: '12px 0', border: '1px solid rgba(52,211,153,.35)', borderRadius: 14, padding: 12, background: 'rgba(52,211,153,.08)' }}>
              <p style={{ color: GREEN, margin: '0 0 8px', fontSize: 12, fontWeight: 900 }}>Final playable campaign video - branded final - Created {fmt(campaign.created_at)}</p>
              <video src={previewUrl} controls style={{ width: '100%', maxHeight: 460, background: '#000', borderRadius: 12 }} />
            </div>}

            {!previewUrl && rawOnly && <div style={{ margin: '12px 0', border: '1px solid rgba(255,195,0,.32)', borderRadius: 14, padding: 12, background: 'rgba(255,195,0,.08)' }}>
              <p style={{ color: GOLD, margin: 0, fontSize: 13, fontWeight: 900 }}>Not final yet: the SignalBoostAi website banner has not been burned in.</p>
            </div>}
            {!previewUrl && !rawOnly && <p style={{ color: 'rgba(255,255,255,.55)', fontSize: 12 }}>No final playable campaign video yet.</p>}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
              <small style={{ color: 'rgba(255,255,255,.55)' }}>Base video URL: {video?.hasKlingUrl ? 'yes' : 'no'}</small>
              <small style={{ color: 'rgba(255,255,255,.55)' }}>Voiced pending: {(video?.voicedLangs || []).join(', ') || 'none'}</small>
              <small style={{ color: 'rgba(255,255,255,.55)' }}>Branded final: {(video?.brandedLangs || []).join(', ') || (video?.branded ? 'yes' : 'none')}</small>
              <small style={{ color: 'rgba(255,255,255,.55)' }}>Full campaign ID: {safe(campaign.id)}</small>
            </div>
            {(video?.voiceError || video?.renderError || video?.autoPublishNote) && <pre style={{ color: RED, whiteSpace: 'pre-wrap', background: 'rgba(0,0,0,.24)', borderRadius: 10, padding: 10, marginTop: 10 }}>{safe(video?.voiceError || video?.renderError || video?.autoPublishNote)}</pre>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              {finalReady && !campaign.approved_at && <button onClick={() => approveCampaign(campaign.id)} disabled={approvingId === campaign.id} style={approveButton}>{approvingId === campaign.id ? 'Approving...' : 'Approve and publish'}</button>}
              {finalReady && campaign.approved_at && <span style={{ color: GREEN, fontWeight: 900, alignSelf: 'center' }}>Approved</span>}
              <a href="/dashboard/cosa" style={{ ...ghost, textDecoration: 'none' }}>Open approval dashboard</a>
              {rawOnly && <button onClick={kickBranding} disabled={loading} style={cyanButton}>Kick branding worker</button>}
              {stuck && <button onClick={() => reset(campaign.id)} disabled={loading} style={ghost}>Reset and kick</button>}
            </div>
          </article>
        })}
      </div>
    </section>
  </main>
}
