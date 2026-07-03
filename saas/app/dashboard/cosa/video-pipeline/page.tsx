'use client'

import { useEffect, useState } from 'react'

const GOLD = '#ffc300'
const CYAN = '#1af0ff'
const panel = { background: 'rgba(15,23,42,.78)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 18, padding: 18 } as const
const button = { border: 'none', background: GOLD, color: '#000', borderRadius: 12, padding: '10px 14px', fontWeight: 900, cursor: 'pointer' } as const
const ghost = { border: '1px solid rgba(255,255,255,.18)', background: 'rgba(255,255,255,.06)', color: '#fff', borderRadius: 12, padding: '10px 14px', fontWeight: 800, cursor: 'pointer' } as const

function safe(value: any) {
  return value == null ? '—' : String(value)
}

export default function CosaVideoPipelinePage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  async function load(path = '/api/cos/video-pipeline-xray') {
    setLoading(true)
    setMessage('')
    try {
      const res = await fetch(path, { cache: 'no-store' })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Could not load video pipeline.')
      setData(json)
    } catch (e: any) {
      setMessage(e?.message || 'Could not load video pipeline.')
    } finally {
      setLoading(false)
    }
  }

  async function kick() {
    await load('/api/cos/video-pipeline-xray?kick=1')
  }

  async function reset(id: string) {
    await load(`/api/cos/video-pipeline-xray?reset=${encodeURIComponent(id)}&kick=1`)
  }

  useEffect(() => { load() }, [])

  const campaigns = Array.isArray(data?.campaigns) ? data.campaigns : []

  return <main style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gap: 18 }}>
    <section style={{ ...panel, background: 'linear-gradient(145deg, rgba(15,23,42,.96), rgba(2,6,23,.98))' }}>
      <p style={{ margin: 0, color: GOLD, fontSize: 12, fontWeight: 950, letterSpacing: '.12em', textTransform: 'uppercase' }}>COSA Video Pipeline</p>
      <h1 style={{ color: '#fff', margin: '10px 0 0', fontSize: 32 }}>Video render and approval diagnostics</h1>
      <p style={{ color: 'rgba(255,255,255,.68)', lineHeight: 1.65, maxWidth: 820 }}>This page shows the real stage for recent video campaigns. Use Kick missing renders when campaigns show only Render video or no preview.</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
        <button onClick={() => load()} disabled={loading} style={ghost}>{loading ? 'Loading...' : 'Refresh'}</button>
        <button onClick={kick} disabled={loading} style={button}>Kick missing renders</button>
        <a href="/dashboard/cosa" style={{ ...ghost, textDecoration: 'none' }}>Back to approval dashboard</a>
      </div>
      {message && <p style={{ color: '#fca5a5', marginTop: 12 }}>{message}</p>}
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
          const color = video?.previewable ? '#34d399' : stage === 'failed' ? '#fca5a5' : stage === 'rendering' ? CYAN : GOLD
          const stuck = String(campaign.eligibility || '').startsWith('STUCK') || stage === 'failed'
          return <article key={campaign.id} style={{ border: '1px solid rgba(255,255,255,.1)', borderRadius: 14, padding: 14, background: 'rgba(2,6,23,.45)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <strong style={{ color: '#fff' }}>{campaign.title || campaign.id}</strong>
                <p style={{ color: 'rgba(255,255,255,.5)', margin: '4px 0 0', fontSize: 12 }}>{campaign.channel} · {campaign.status} · {campaign.created_at}</p>
              </div>
              <span style={{ color, fontSize: 12, fontWeight: 900 }}>{stage}</span>
            </div>
            <p style={{ color: 'rgba(255,255,255,.72)', lineHeight: 1.55 }}>{campaign.eligibility}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
              <small style={{ color: 'rgba(255,255,255,.55)' }}>Request: {safe(video?.requestId)}</small>
              <small style={{ color: 'rgba(255,255,255,.55)' }}>Base video URL: {video?.hasKlingUrl ? 'yes' : 'no'}</small>
              <small style={{ color: 'rgba(255,255,255,.55)' }}>Voiced: {(video?.voicedLangs || []).join(', ') || 'none'}</small>
              <small style={{ color: 'rgba(255,255,255,.55)' }}>Branded: {(video?.brandedLangs || []).join(', ') || (video?.branded ? 'yes' : 'none')}</small>
            </div>
            {(video?.voiceError || video?.renderError || video?.autoPublishNote) && <pre style={{ color: '#fca5a5', whiteSpace: 'pre-wrap', background: 'rgba(0,0,0,.24)', borderRadius: 10, padding: 10, marginTop: 10 }}>{safe(video?.voiceError || video?.renderError || video?.autoPublishNote)}</pre>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <a href="/dashboard/cosa" style={{ ...ghost, textDecoration: 'none' }}>Open approval dashboard</a>
              {stuck && <button onClick={() => reset(campaign.id)} disabled={loading} style={ghost}>Reset and kick</button>}
            </div>
          </article>
        })}
      </div>
    </section>
  </main>
}
