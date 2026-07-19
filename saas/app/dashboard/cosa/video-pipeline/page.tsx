'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

const GOLD = '#ffc300'
const CYAN = '#1af0ff'
const GREEN = '#34d399'
const RED = '#fca5a5'
const panel = { background: 'rgba(15,23,42,.78)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 18, padding: 18 } as const
const ghost = { border: '1px solid rgba(255,255,255,.18)', background: 'rgba(255,255,255,.06)', color: '#fff', borderRadius: 12, padding: '10px 14px', fontWeight: 800, cursor: 'pointer' } as const
const primary = { ...ghost, border: 'none', background: GREEN, color: '#001018', fontWeight: 950 } as const
const warning = { ...ghost, border: 'none', background: GOLD, color: '#000', fontWeight: 950 } as const

type Tab = 'active' | 'published' | 'archived'
type CardState = 'working' | 'ready' | 'approved' | 'problem'

function fmt(value: any) {
  if (!value) return '-'
  const d = new Date(String(value))
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function deriveState(campaign: any): { state: CardState; step: number; note: string } {
  const video = campaign?.video || {}
  const stage = String(video?.stage || '').toLowerCase()
  const eligibility = String(campaign?.eligibility || '')
  const finalReady = video?.branded === true && Boolean(video?.finalUrl || video?.previewUrl) && video?.previewKind === 'branded final'
  const hasBase = Boolean(video?.hasKlingUrl)
  const voiced = Array.isArray(video?.voicedLangs) && video.voicedLangs.length > 0
  if (campaign?.approved_at) return { state: 'approved', step: 3, note: 'Approved and published. The YouTube link was emailed to you.' }
  if (finalReady) return { state: 'ready', step: 3, note: 'Your video is ready. Watch it below, then approve to publish.' }
  if (eligibility.startsWith('STUCK') || stage === 'failed') return { state: 'problem', step: hasBase ? 2 : 1, note: 'Something went wrong. Press Fix automatically to restart this video.' }
  if (!hasBase) return { state: 'working', step: 1, note: 'Step 1 of 3 — creating your base video.' }
  if (!voiced) return { state: 'working', step: 2, note: 'Step 2 of 3 — adding voice and captions.' }
  return { state: 'working', step: 3, note: 'Step 3 of 3 — adding the SignalBoost brand banner.' }
}

function Steps({ step, state }: { step: number; state: CardState }) {
  return <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
    {['Create video', 'Voice & captions', 'Brand banner'].map((label, index) => {
      const n = index + 1
      const done = state === 'ready' || state === 'approved' || n < step
      const active = state === 'working' && n === step
      const failed = state === 'problem' && n === step
      return <div key={label} style={{ display: 'flex', gap: 7, alignItems: 'center', padding: '6px 12px', borderRadius: 999, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(0,0,0,.25)' }}>
        <b style={{ color: done ? GREEN : failed ? RED : active ? CYAN : 'rgba(255,255,255,.35)' }}>{done ? '✓' : failed ? '!' : n}</b>
        <span style={{ color: done || active || failed ? '#fff' : 'rgba(255,255,255,.45)', fontSize: 13, fontWeight: 700 }}>{label}</span>
        {active && <small style={{ color: CYAN, fontWeight: 900 }}>· in progress</small>}
      </div>
    })}
  </div>
}

export default function CosaVideoPipelinePage() {
  const [data, setData] = useState<any>(null)
  const [archived, setArchived] = useState<Record<string, string>>({})
  const [tab, setTab] = useState<Tab>('active')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [message, setMessage] = useState('')
  const timer = useRef<any>(null)

  async function load(quiet = false) {
    if (!quiet) setLoading(true)
    try {
      const [videoRes, archiveRes] = await Promise.all([
        fetch('/api/cos/video-pipeline-xray', { cache: 'no-store', credentials: 'include' }),
        fetch('/api/cos/video-archive', { cache: 'no-store', credentials: 'include' }),
      ])
      const videoJson = await videoRes.json().catch(() => null)
      const archiveJson = await archiveRes.json().catch(() => null)
      if (!videoRes.ok || !videoJson?.ok) throw new Error(videoJson?.error || 'Could not load videos.')
      if (!archiveRes.ok || !archiveJson?.ok) throw new Error(archiveJson?.error || 'Could not load archive.')
      setData(videoJson)
      setArchived(Object.fromEntries((archiveJson.archived || []).map((x: any) => [String(x.id), String(x.archived_at || '')])))
      if (!quiet) setMessage('')
    } catch (e: any) {
      if (!quiet) setMessage(e?.message || 'Could not load videos.')
    } finally {
      if (!quiet) setLoading(false)
    }
  }

  useEffect(() => {
    load()
    timer.current = setInterval(() => load(true), 30_000)
    return () => clearInterval(timer.current)
  }, [])

  async function approve(id: string) {
    setBusyId(id)
    try {
      const res = await fetch('/api/cos/campaign-queue', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ id, status: 'approved' }) })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Approval failed.')
      setMessage('Approved. Publishing continues automatically.')
      await load(true)
    } catch (e: any) { setMessage(e?.message || 'Approval failed.') } finally { setBusyId('') }
  }

  async function redo(id: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/cos/video-pipeline-xray?reset=${encodeURIComponent(id)}&kick=1`, { cache: 'no-store', credentials: 'include' })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Could not restart video.')
      setData(json)
      setMessage('Video restarted automatically.')
    } catch (e: any) { setMessage(e?.message || 'Could not restart video.') } finally { setBusyId('') }
  }

  async function archiveAction(id: string, action: 'archive' | 'restore') {
    setBusyId(id)
    try {
      const res = await fetch('/api/cos/video-archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ id, action }) })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Archive action failed.')
      setMessage(action === 'archive' ? 'Video archived.' : 'Video restored.')
      await load(true)
    } catch (e: any) { setMessage(e?.message || 'Archive action failed.') } finally { setBusyId('') }
  }

  const all = Array.isArray(data?.campaigns) ? data.campaigns : []
  const counts = useMemo(() => ({
    active: all.filter((c: any) => !archived[c.id] && !c.approved_at).length,
    published: all.filter((c: any) => !archived[c.id] && Boolean(c.approved_at)).length,
    archived: all.filter((c: any) => Boolean(archived[c.id])).length,
  }), [all, archived])
  const campaigns = all.filter((c: any) => tab === 'archived' ? Boolean(archived[c.id]) : tab === 'published' ? !archived[c.id] && Boolean(c.approved_at) : !archived[c.id] && !c.approved_at)

  return <main style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gap: 18 }}>
    <section style={{ ...panel, background: 'linear-gradient(145deg, rgba(15,23,42,.96), rgba(2,6,23,.98))' }}>
      <p style={{ margin: 0, color: GOLD, fontSize: 12, fontWeight: 950, letterSpacing: '.12em' }}>COSA VIDEO STUDIO</p>
      <h1 style={{ color: '#fff', margin: '10px 0 0', fontSize: 32 }}>Your videos</h1>
      <p style={{ color: 'rgba(255,255,255,.68)', lineHeight: 1.65 }}>Active work stays clean. Published videos have their own view, and archived videos remain stored and can be restored.</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
        {(['active', 'published', 'archived'] as Tab[]).map((name) => <button key={name} onClick={() => setTab(name)} style={{ ...ghost, background: tab === name ? 'rgba(255,195,0,.18)' : ghost.background, borderColor: tab === name ? GOLD : 'rgba(255,255,255,.18)' }}>{name[0].toUpperCase() + name.slice(1)} ({counts[name]})</button>)}
        <button onClick={() => load()} disabled={loading} style={ghost}>{loading ? 'Loading...' : 'Refresh now'}</button>
        <a href="/dashboard/cosa" style={{ ...ghost, textDecoration: 'none' }}>Back to campaigns</a>
      </div>
      {message && <p style={{ color: message.toLowerCase().includes('fail') || message.toLowerCase().includes('could not') ? RED : GREEN, fontWeight: 800 }}>{message}</p>}
    </section>

    <section style={panel}>
      <h2 style={{ color: '#fff', margin: 0, fontSize: 20 }}>{tab === 'active' ? 'Active production' : tab === 'published' ? 'Published videos' : 'Archived library'}</h2>
      <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
        {!campaigns.length && <p style={{ color: 'rgba(255,255,255,.62)' }}>{loading ? 'Loading...' : `No ${tab} videos.`}</p>}
        {campaigns.map((campaign: any) => {
          const video = campaign.video || {}
          const { state, step, note } = deriveState(campaign)
          const previewUrl = state === 'ready' || state === 'approved' ? String(video?.previewUrl || video?.finalUrl || '') : ''
          const badge = archived[campaign.id] ? { text: 'ARCHIVED', color: GOLD } : state === 'ready' ? { text: 'READY TO APPROVE', color: GREEN } : state === 'approved' ? { text: 'PUBLISHED', color: GREEN } : state === 'problem' ? { text: 'NEEDS A FIX', color: RED } : { text: 'IN PROGRESS', color: CYAN }
          return <article key={campaign.id} style={{ border: '1px solid rgba(255,255,255,.1)', borderRadius: 14, padding: 14, background: 'rgba(2,6,23,.45)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div><strong style={{ color: '#fff' }}>{campaign.title || campaign.id}</strong><p style={{ color: 'rgba(255,255,255,.5)', margin: '4px 0 0', fontSize: 12 }}>Created {fmt(campaign.created_at)}{campaign.approved_at ? ` · Approved ${fmt(campaign.approved_at)}` : ''}{archived[campaign.id] ? ` · Archived ${fmt(archived[campaign.id])}` : ''}</p></div>
              <span style={{ color: badge.color, fontSize: 12, fontWeight: 950 }}>{badge.text}</span>
            </div>
            <Steps step={step} state={state} />
            <p style={{ color: state === 'problem' ? RED : 'rgba(255,255,255,.75)', lineHeight: 1.6 }}>{note}</p>
            {previewUrl && <video src={previewUrl} controls style={{ width: '100%', maxHeight: 460, background: '#000', borderRadius: 12 }} />}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              {state === 'ready' && !archived[campaign.id] && <button onClick={() => approve(campaign.id)} disabled={busyId === campaign.id} style={primary}>Approve and publish</button>}
              {state === 'problem' && !archived[campaign.id] && <button onClick={() => redo(campaign.id)} disabled={busyId === campaign.id} style={warning}>Fix automatically</button>}
              {!archived[campaign.id] && <button onClick={() => archiveAction(campaign.id, 'archive')} disabled={busyId === campaign.id} style={ghost}>Archive</button>}
              {archived[campaign.id] && <button onClick={() => archiveAction(campaign.id, 'restore')} disabled={busyId === campaign.id} style={primary}>Restore</button>}
            </div>
            <details style={{ marginTop: 12 }}><summary style={{ color: 'rgba(255,255,255,.45)', fontSize: 12, cursor: 'pointer' }}>Technical details</summary><pre style={{ whiteSpace: 'pre-wrap', color: 'rgba(255,255,255,.6)', fontSize: 11 }}>{JSON.stringify({ campaignId: campaign.id, requestId: video.requestId, stage: video.stage, eligibility: campaign.eligibility }, null, 2)}</pre></details>
          </article>
        })}
      </div>
    </section>
  </main>
}
