'use client'

// saas/app/dashboard/cosa/video-pipeline/page.tsx
// Owner-first redesign. The pipeline self-heals (orphaned renders requeue,
// poisoned campaigns sanitize, watchdog restarts), so the owner's only job
// is: watch the final video, then Approve. Everything else is automatic.
//
// One status per video, in plain language. One button when action is
// possible. All plumbing (request IDs, eligibility strings, raw errors)
// lives in a collapsed "Technical details" per card.

import { useEffect, useRef, useState } from 'react'

const GOLD = '#ffc300'
const CYAN = '#1af0ff'
const GREEN = '#34d399'
const RED = '#fca5a5'
const panel = { background: 'rgba(15,23,42,.78)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 18, padding: 18 } as const
const approveButton = { border: 'none', background: GREEN, color: '#001018', borderRadius: 12, padding: '12px 18px', fontWeight: 950, cursor: 'pointer', fontSize: 15 } as const
const fixButton = { border: 'none', background: GOLD, color: '#000', borderRadius: 12, padding: '12px 18px', fontWeight: 900, cursor: 'pointer', fontSize: 15 } as const
const ghost = { border: '1px solid rgba(255,255,255,.18)', background: 'rgba(255,255,255,.06)', color: '#fff', borderRadius: 12, padding: '10px 14px', fontWeight: 800, cursor: 'pointer' } as const

function fmt(value: any) {
  if (!value) return '-'
  const d = new Date(String(value))
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

type CardState = 'working' | 'ready' | 'approved' | 'problem'

function deriveState(campaign: any): { state: CardState; step: number; note: string } {
  const video = campaign?.video || {}
  const stage = String(video?.stage || '').toLowerCase()
  const eligibility = String(campaign?.eligibility || '')
  const finalReady = video?.branded === true && Boolean(video?.finalUrl || video?.previewUrl) && video?.previewKind === 'branded final'
  const hasBase = Boolean(video?.hasKlingUrl)
  const voiced = Array.isArray(video?.voicedLangs) && video.voicedLangs.length > 0

  if (campaign?.approved_at) return { state: 'approved', step: 3, note: 'Approved and published. The YouTube link was emailed to you.' }
  if (finalReady) return { state: 'ready', step: 3, note: 'Your video is ready. Watch it below, then approve to publish.' }
  if (eligibility.startsWith('STUCK') || stage === 'failed') {
    return { state: 'problem', step: hasBase ? 2 : 1, note: 'Something went wrong. Press "Fix automatically" — the video will be redone from the start, no other action needed.' }
  }
  if (!hasBase) return { state: 'working', step: 1, note: 'Step 1 of 3 — creating your video. The render robot runs every 10 minutes, so this step usually takes 10–25 minutes.' }
  if (hasBase && !voiced) return { state: 'working', step: 2, note: 'Step 2 of 3 — adding voice and captions in your campaign language.' }
  return { state: 'working', step: 3, note: 'Step 3 of 3 — burning the SignalBoost banner into the final video. Almost done.' }
}

function Steps({ step, state }: { step: number; state: CardState }) {
  const labels = ['Create video', 'Voice & captions', 'Brand banner']
  return <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
    {labels.map((label, i) => {
      const n = i + 1
      const done = state === 'ready' || state === 'approved' || n < step
      const active = state === 'working' && n === step
      const failed = state === 'problem' && n === step
      const color = done ? GREEN : failed ? RED : active ? CYAN : 'rgba(255,255,255,.35)'
      return <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, border: `1px solid ${done ? 'rgba(52,211,153,.4)' : failed ? 'rgba(252,165,165,.4)' : 'rgba(255,255,255,.12)'}`, borderRadius: 999, padding: '6px 12px', background: 'rgba(0,0,0,.25)' }}>
        <span style={{ color, fontWeight: 950, fontSize: 13 }}>{done ? '✓' : failed ? '!' : n}</span>
        <span style={{ color: done || active || failed ? '#fff' : 'rgba(255,255,255,.45)', fontSize: 13, fontWeight: 700 }}>{label}</span>
        {active && <span style={{ color: CYAN, fontSize: 11, fontWeight: 900 }}>· in progress</span>}
      </div>
    })}
  </div>
}

export default function CosaVideoPipelinePage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [message, setMessage] = useState('')
  const timer = useRef<any>(null)

  async function load(path = '/api/cos/video-pipeline-xray', quiet = false) {
    if (!quiet) setLoading(true)
    try {
      const res = await fetch(path, { cache: 'no-store', credentials: 'include' })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Could not load your videos.')
      setData(json)
      if (!quiet) setMessage('')
    } catch (e: any) {
      if (!quiet) setMessage(e?.message || 'Could not load your videos.')
    } finally {
      if (!quiet) setLoading(false)
    }
  }

  // Auto-refresh every 30s while anything is still working, so the owner
  // never has to press Refresh to see progress.
  useEffect(() => {
    load()
    timer.current = setInterval(() => {
      setData((prev: any) => {
        const anyWorking = (prev?.campaigns || []).some((c: any) => {
          const s = deriveState(c).state
          return s === 'working' || s === 'problem'
        })
        if (anyWorking || !prev) load(undefined, true)
        return prev
      })
    }, 30_000)
    return () => clearInterval(timer.current)
  }, [])

  async function approve(id: string) {
    setBusyId(id)
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
      setMessage(json.autoPublish?.published ? 'Approved and published. Check your email for the YouTube link.' : 'Approved. Publishing runs automatically — the result will appear here.')
      await load()
    } catch (e: any) {
      setMessage(e?.message || 'Approval failed.')
    } finally {
      setBusyId('')
    }
  }

  async function redo(id: string) {
    setBusyId(id)
    await load(`/api/cos/video-pipeline-xray?reset=${encodeURIComponent(id)}&kick=1`)
    setBusyId('')
  }

  const campaigns = Array.isArray(data?.campaigns) ? data.campaigns : []

  return <main style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gap: 18 }}>
    <section style={{ ...panel, background: 'linear-gradient(145deg, rgba(15,23,42,.96), rgba(2,6,23,.98))' }}>
      <p style={{ margin: 0, color: GOLD, fontSize: 12, fontWeight: 950, letterSpacing: '.12em', textTransform: 'uppercase' }}>COSA Video Pipeline</p>
      <h1 style={{ color: '#fff', margin: '10px 0 0', fontSize: 32 }}>Your videos</h1>
      <p style={{ color: 'rgba(255,255,255,.68)', lineHeight: 1.65, maxWidth: 820 }}>
        Videos are made, voiced, and branded automatically. When one is ready, watch it here and press Approve — that publishes it to YouTube and emails you the link. This page updates itself every 30 seconds.
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
        <button onClick={() => load()} disabled={loading} style={ghost}>{loading ? 'Loading...' : 'Refresh now'}</button>
        <a href="/dashboard/cosa" style={{ ...ghost, textDecoration: 'none' }}>Back to campaigns</a>
      </div>
      {message && <p style={{ color: message.toLowerCase().includes('fail') || message.toLowerCase().includes('could not') ? RED : GREEN, marginTop: 12, fontWeight: 700 }}>{message}</p>}
    </section>

    <section style={panel}>
      <h2 style={{ color: '#fff', margin: 0, fontSize: 20 }}>Recent videos</h2>
      <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
        {campaigns.length === 0 && <p style={{ color: 'rgba(255,255,255,.62)' }}>{loading ? 'Loading...' : 'No videos yet. Create a campaign from the COSA console and the video will appear here.'}</p>}
        {campaigns.map((campaign: any) => {
          const video = campaign.video || {}
          const { state, step, note } = deriveState(campaign)
          const previewUrl = state === 'ready' || state === 'approved' ? String(video?.previewUrl || video?.finalUrl || '') : ''
          const borderColor = state === 'ready' ? 'rgba(52,211,153,.4)' : state === 'problem' ? 'rgba(252,165,165,.4)' : state === 'approved' ? 'rgba(52,211,153,.25)' : 'rgba(255,255,255,.1)'
          const badge = state === 'ready' ? { text: 'READY TO APPROVE', color: GREEN } : state === 'approved' ? { text: 'PUBLISHED', color: GREEN } : state === 'problem' ? { text: 'NEEDS A FIX', color: RED } : { text: 'IN PROGRESS', color: CYAN }
          return <article key={campaign.id} style={{ border: `1px solid ${borderColor}`, borderRadius: 14, padding: 14, background: state === 'ready' ? 'rgba(52,211,153,.06)' : 'rgba(2,6,23,.45)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <strong style={{ color: '#fff', fontSize: 15 }}>{campaign.title || campaign.id}</strong>
                <p style={{ color: 'rgba(255,255,255,.5)', margin: '4px 0 0', fontSize: 12 }}>Created {fmt(campaign.created_at)}{campaign.approved_at ? ` · Approved ${fmt(campaign.approved_at)}` : ''}</p>
              </div>
              <span style={{ color: badge.color, fontSize: 12, fontWeight: 950, letterSpacing: '.06em' }}>{badge.text}</span>
            </div>

            <Steps step={step} state={state} />
            <p style={{ color: state === 'problem' ? RED : 'rgba(255,255,255,.75)', lineHeight: 1.6, margin: '12px 0 0', fontSize: 14 }}>{note}</p>

            {previewUrl && <div style={{ margin: '12px 0 0', border: '1px solid rgba(52,211,153,.35)', borderRadius: 14, padding: 12, background: 'rgba(52,211,153,.08)' }}>
              <video src={previewUrl} controls style={{ width: '100%', maxHeight: 460, background: '#000', borderRadius: 12 }} />
            </div>}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              {state === 'ready' && <button onClick={() => approve(campaign.id)} disabled={busyId === campaign.id} style={approveButton}>{busyId === campaign.id ? 'Approving...' : 'Approve and publish'}</button>}
              {state === 'ready' && <button onClick={() => redo(campaign.id)} disabled={busyId === campaign.id} style={ghost}>Redo video</button>}
              {state === 'problem' && <button onClick={() => redo(campaign.id)} disabled={busyId === campaign.id} style={fixButton}>{busyId === campaign.id ? 'Fixing...' : 'Fix automatically'}</button>}
              {state === 'approved' && <span style={{ color: GREEN, fontWeight: 900, alignSelf: 'center' }}>✓ Done — published to YouTube</span>}
            </div>

            <details style={{ marginTop: 12 }}>
              <summary style={{ color: 'rgba(255,255,255,.45)', fontSize: 12, cursor: 'pointer' }}>Technical details</summary>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginTop: 10 }}>
                <small style={{ color: 'rgba(255,255,255,.55)' }}>Campaign ID: {String(campaign.id || '-')}</small>
                <small style={{ color: 'rgba(255,255,255,.55)' }}>Request: {String(video?.requestId || '-').slice(0, 8)}</small>
                <small style={{ color: 'rgba(255,255,255,.55)' }}>Stage: {String(video?.stage || '-')}</small>
                <small style={{ color: 'rgba(255,255,255,.55)' }}>Base video: {video?.hasKlingUrl ? 'yes' : 'no'}</small>
                <small style={{ color: 'rgba(255,255,255,.55)' }}>Voiced pending: {(video?.voicedLangs || []).join(', ') || 'none'}</small>
                <small style={{ color: 'rgba(255,255,255,.55)' }}>Branded: {(video?.brandedLangs || []).join(', ') || (video?.branded ? 'yes' : 'none')}</small>
                <small style={{ color: 'rgba(255,255,255,.55)' }}>Render started: {fmt(video?.started_at)}</small>
              </div>
              <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 12, lineHeight: 1.6 }}>{String(campaign.eligibility || '')}</p>
              {(video?.voiceError || video?.renderError || video?.autoPublishNote) && <pre style={{ color: RED, whiteSpace: 'pre-wrap', background: 'rgba(0,0,0,.24)', borderRadius: 10, padding: 10, fontSize: 12 }}>{String(video?.voiceError || video?.renderError || video?.autoPublishNote)}</pre>}
              {video?.renderJob && <pre style={{ color: 'rgba(255,255,255,.6)', whiteSpace: 'pre-wrap', background: 'rgba(0,0,0,.24)', borderRadius: 10, padding: 10, fontSize: 12 }}>{JSON.stringify(video.renderJob, null, 2)}</pre>}
            </details>
          </article>
        })}
      </div>
    </section>
  </main>
}
