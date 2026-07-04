'use client'

import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useI18n } from '@/components/i18n/I18nProvider'

const GOLD = '#ffc300'
const CYAN = '#1af0ff'

type CampaignRow = {
  id: string
  title?: string
  objective?: string
  audience?: string
  channel?: string
  status?: string
  created_at?: string
  approved_at?: string | null
  metadata?: Record<string, any>
  work_items?: Array<{ id?: string; input?: { language?: string }; output?: { title?: string; opening?: string; draft?: string; call_to_action?: string } }>
}
type OutreachRow = { id: string; status?: string }

const copy = {
  title: 'COSA Campaign Console',
  intro: 'Create, review, approve, render, and publish governed marketing campaigns.',
  command: 'Campaign command',
  placeholder: 'Create a YouTube promotional video campaign for SignalBoostAi. Feature www.saas.signalboostapp.com.',
  run: 'Run COSA campaign command',
  refresh: 'Refresh',
  loading: 'Loading...',
  working: 'Working...',
  noCampaigns: 'No campaigns queued yet.',
  requiredCommand: 'Add a campaign command first.',
  created: 'COSA created the campaign and started preparing the draft video.',
  draftDone: 'Review draft generated.',
  batchDone: 'Generating drafts for all requested languages.',
  marked: 'Campaign marked',
  published: 'Published to the platform. Live now.',
  rendering: 'Rendering video… check again shortly.',
  brandedPreview: 'Final branded video preview.',
  errorLoad: 'Could not load Marketing/Sales data.',
  errorAuto: 'Could not run the campaign command.',
  errorDraft: 'Could not generate the draft.',
  errorBatch: 'Could not start multilingual generation.',
  errorMark: 'Could not update this item.',
  errorPublish: 'Could not publish',
  errorRender: 'Could not start/check the video render.',
}

const panel: CSSProperties = { background: 'rgba(15,23,42,.72)', border: '1px solid rgba(255,255,255,.09)', borderRadius: 18, padding: 20, boxShadow: '0 20px 60px rgba(0,0,0,.28)' }
const primary: CSSProperties = { border: 'none', background: GOLD, color: '#000', borderRadius: 12, padding: '10px 14px', fontWeight: 900, cursor: 'pointer' }
const secondary: CSSProperties = { border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.06)', color: '#fff', borderRadius: 12, padding: '10px 14px', fontWeight: 800, cursor: 'pointer' }
const muted: CSSProperties = { color: 'rgba(255,255,255,.62)', lineHeight: 1.6 }

function hasDraft(campaign: CampaignRow) {
  return Boolean(campaign.work_items?.some(item => item.output))
}

function short(value?: string, fallback = '—') {
  const s = String(value || '').trim()
  return s ? (s.length > 180 ? s.slice(0, 180).trim() + '…' : s) : fallback
}

function fmt(value?: string) {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
  } catch {
    return value
  }
}

function errorText(value: unknown, fallback: string) {
  const text = value instanceof Error ? value.message : String(value || '')
  return text && text !== 'undefined' ? text : fallback
}

function videoStatusText(video: any) {
  if (!video) return 'No video render has started yet.'
  if (video.status === 'rendering') return 'Base render is still running.'
  if (video.status === 'failed') return `Base render failed: ${String(video.error || 'unknown error')}`
  if (video.status === 'ready' && video.branded === true && video.voicedUrl) return 'Final branded video is ready.'
  if (video.status === 'ready' && video.unbrandedVoiced && Object.keys(video.unbrandedVoiced).length) return 'Voice/captions are ready. Waiting for the SignalBoostAi banner worker.'
  if (video.status === 'ready' && video.url) return 'Raw base video exists. Waiting for voice, captions, and SignalBoostAi banner. The raw 5-second draft is intentionally hidden.'
  return 'Waiting for final video preparation.'
}

function VideoBox({ campaign, busy, onRenderVideo, onCheckStatus }: { campaign: CampaignRow; busy: boolean; onRenderVideo: (id: string) => void; onCheckStatus: (id: string) => void }) {
  const video = (campaign.metadata as any)?.video || null
  if (!['youtube', 'short_video'].includes(campaign.channel || '')) return null
  if (!video) return <button disabled={busy} onClick={() => onRenderVideo(campaign.id)} style={secondary}>Render video</button>

  const finalUrl = video.branded === true && video.voicedUrl ? String(video.voicedUrl) : ''
  return <div style={{ marginTop: 12, border: '1px solid rgba(26,240,255,.25)', borderRadius: 12, background: 'rgba(26,240,255,.06)', padding: 12 }}>
    {video.status === 'rendering' && <div><p style={{ color: CYAN, fontSize: 13, margin: 0 }}>{copy.rendering}</p><button disabled={busy} onClick={() => onCheckStatus(campaign.id)} style={{ ...secondary, marginTop: 8 }}>Check status</button></div>}
    {video.status === 'ready' && finalUrl && <div><p style={{ color: CYAN, fontSize: 12, margin: '0 0 8px' }}>{copy.brandedPreview}</p><p style={{ color: 'rgba(255,255,255,.55)', fontSize: 11, margin: '0 0 8px' }}>Displaying: branded final · Branded: yes · Captions/voice included</p><video src={finalUrl} controls style={{ width: '100%', borderRadius: 10, maxHeight: 300, background: '#000' }} /></div>}
    {video.status === 'ready' && !finalUrl && <div><p style={{ color: GOLD, fontSize: 13, margin: 0, fontWeight: 900 }}>Final branded video is not ready yet.</p><p style={{ color: 'rgba(255,255,255,.7)', fontSize: 12, margin: '8px 0 0' }}>{videoStatusText(video)}</p><p style={{ color: 'rgba(255,255,255,.5)', fontSize: 11, margin: '8px 0 0' }}>The raw 5-second base render is hidden because it is not the campaign video.</p></div>}
    {video.status === 'failed' && <p style={{ color: '#fca5a5', fontSize: 13, margin: 0 }}>Video render failed: {String(video.error || 'unknown error')}</p>}
    {video.voiceError && <p style={{ color: '#fca5a5', fontSize: 12, margin: '10px 0 0' }}>⚠ {String(video.voiceError)}</p>}
  </div>
}

function CampaignCard({ campaign, busy, onPatch, onGenerateDraft, onGenerateAll, onPublish, onRenderVideo, onCheckStatus }: { campaign: CampaignRow; busy: boolean; onPatch: (id: string, status: 'approved' | 'rejected' | 'queued') => void; onGenerateDraft: (id: string) => void; onGenerateAll: (id: string) => void; onPublish: (id: string, language?: string) => void; onRenderVideo: (id: string) => void; onCheckStatus: (id: string) => void }) {
  const drafts = (campaign.work_items || []).filter(item => item.output)
  const waiting = campaign.status === 'waiting_approval' || campaign.status === 'draft'
  const canPublish = ['youtube', 'short_video', 'linkedin'].includes(campaign.channel || '') && (campaign.status === 'approved' || campaign.status === 'queued') && Boolean(campaign.approved_at)
  const video = (campaign.metadata as any)?.video || null
  const finalVideoReady = video?.branded === true && Boolean(video?.voicedUrl)

  return <section style={{ ...panel, position: 'relative', overflow: 'hidden' }}>
    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: campaign.status === 'approved' ? '#34d399' : campaign.status === 'rejected' ? '#f87171' : GOLD }} />
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><div><strong style={{ color: '#fff' }}>{campaign.title || campaign.channel || 'Campaign'}</strong><p style={{ color: 'rgba(255,255,255,.48)', margin: '4px 0 0', fontSize: 12 }}>{campaign.channel || 'campaign'} · {fmt(campaign.created_at)}</p></div><span style={{ color: GOLD, fontSize: 12, fontWeight: 900 }}>{campaign.status || 'pending'}</span></div>
    <p style={muted}>{short(campaign.objective, 'No objective attached.')}</p>
    {drafts.map((item, idx) => <div key={item.id || idx} style={{ border: '1px solid rgba(255,195,0,.22)', borderRadius: 14, background: 'rgba(255,195,0,.06)', padding: 12, marginTop: 10 }}><p style={{ color: GOLD, fontSize: 11, fontWeight: 900, margin: 0 }}>Review draft {item.input?.language ? `· ${String(item.input.language).toUpperCase()}` : ''}</p><h3 style={{ color: '#fff', margin: '8px 0 0', fontSize: 15 }}>{item.output?.title || campaign.title}</h3>{item.output?.draft && <pre style={{ whiteSpace: 'pre-wrap', color: 'rgba(255,255,255,.78)', background: 'rgba(0,0,0,.25)', borderRadius: 12, padding: 10, fontSize: 12, lineHeight: 1.5, maxHeight: 220, overflow: 'auto' }}>{item.output.draft}</pre>}{item.output?.call_to_action && <p style={{ color: GOLD, fontWeight: 900 }}>CTA: {item.output.call_to_action}</p>}{canPublish && <button disabled={busy} onClick={() => onPublish(campaign.id, item.input?.language)} style={secondary}>Publish</button>}</div>)}
    <VideoBox campaign={campaign} busy={busy} onRenderVideo={onRenderVideo} onCheckStatus={onCheckStatus} />
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.06)', flexWrap: 'wrap' }}>
      {waiting && <button disabled={busy} onClick={() => onPatch(campaign.id, 'rejected')} style={secondary}>Reject</button>}
      {waiting && (!['youtube', 'short_video'].includes(campaign.channel || '') || finalVideoReady) && <button disabled={busy} onClick={() => onPatch(campaign.id, 'approved')} style={primary}>Approve campaign</button>}
      {waiting && ['youtube', 'short_video'].includes(campaign.channel || '') && !finalVideoReady && <span style={{ color: 'rgba(255,255,255,.55)', fontSize: 12, alignSelf: 'center' }}>Approval locked — waiting for final branded video with voice, captions, SignalBoostAi, and www.saas.signalboostapp.com.</span>}
      {!hasDraft(campaign) && <button disabled={busy} onClick={() => onGenerateDraft(campaign.id)} style={primary}>Generate review draft</button>}
      <button disabled={busy} onClick={() => onGenerateAll(campaign.id)} style={secondary}>Generate all languages</button>
    </div>
  </section>
}

export default function MarketingSalesCosaPage() {
  useI18n()
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([])
  const [outreach, setOutreach] = useState<OutreachRow[]>([])
  const [autonomousDirective, setAutonomousDirective] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function load(keepMessage = false) {
    setLoading(true)
    if (!keepMessage) setMessage('')
    try {
      const [admRes, campaignRes] = await Promise.all([fetch('/api/admin/adm', { cache: 'no-store' }), fetch('/api/cos/campaign-queue', { cache: 'no-store' })])
      const admJson = await admRes.json().catch(() => null)
      const campaignJson = await campaignRes.json().catch(() => null)
      if (!admRes.ok || !campaignRes.ok) throw new Error(copy.errorLoad)
      setOutreach(Array.isArray(admJson?.recentOutreach) ? admJson.recentOutreach : [])
      setCampaigns(Array.isArray(campaignJson?.campaigns) ? campaignJson.campaigns : [])
    } catch {
      setMessage(copy.errorLoad)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    let t: any = null
    const ping = () => { if (t) clearTimeout(t); t = setTimeout(() => load(true), 1200) }
    const channel = supabase.channel('cos-campaign-queue-rt').on('postgres_changes', { event: '*', schema: 'public', table: 'cos_campaign_queue' }, ping).subscribe()
    return () => { if (t) clearTimeout(t); supabase.removeChannel(channel) }
  }, [])

  const stats = useMemo(() => ({
    waiting: campaigns.filter(row => row.status === 'waiting_approval' || row.status === 'draft').length,
    approved: campaigns.filter(row => row.status === 'approved').length,
    running: campaigns.filter(row => row.status === 'queued' || row.status === 'running').length,
    drafted: campaigns.filter(hasDraft).length,
  }), [campaigns])

  async function generateDraft(id: string) {
    const res = await fetch('/api/cos/script-worker', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaign_id: id }) })
    if (!res.ok) throw new Error(copy.errorDraft)
    return res.json().catch(() => null)
  }

  async function createAutonomousCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!autonomousDirective.trim()) { setMessage(copy.requiredCommand); return }
    setBusy(true)
    try {
      const res = await fetch('/api/cos/campaign-queue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ directive: autonomousDirective }) })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(copy.errorAuto)
      if (json?.campaign?.id) await generateDraft(json.campaign.id)
      setMessage(copy.created)
      await load(true)
    } catch {
      setMessage(copy.errorAuto)
    } finally {
      setBusy(false)
    }
  }

  async function patchCampaign(id: string, status: 'approved' | 'rejected' | 'queued') {
    setBusy(true)
    try {
      const res = await fetch('/api/cos/campaign-queue', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) })
      if (!res.ok) throw new Error(copy.errorMark)
      setMessage(`${copy.marked} ${status}.`)
      await load(true)
    } catch {
      setMessage(copy.errorMark)
    } finally {
      setBusy(false)
    }
  }

  async function generateDraftFromButton(id: string) {
    setBusy(true)
    try { await generateDraft(id); setMessage(copy.draftDone); await load(true) } catch { setMessage(copy.errorDraft) } finally { setBusy(false) }
  }

  async function generateAllFromButton(id: string) {
    setBusy(true)
    try {
      const res = await fetch('/api/cos/script-worker/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaign_id: id }) })
      if (!res.ok) throw new Error(copy.errorBatch)
      setMessage(copy.batchDone)
      await load(true)
    } catch { setMessage(copy.errorBatch) } finally { setBusy(false) }
  }

  async function publishLanguage(id: string, language?: string) {
    setBusy(true)
    try {
      const res = await fetch('/api/cos/campaign-queue/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, language }) })
      const j = await res.json().catch(() => null)
      if (!res.ok || !j?.ok) throw new Error(j?.error || j?.result?.error || j?.result?.mode || copy.errorPublish)
      setMessage(j?.result?.liveUrl ? `${copy.published} ${j.result.liveUrl}` : copy.published)
      await load(true)
    } catch (e) {
      setMessage(`${copy.errorPublish}: ${errorText(e, 'Unknown publish error')}`)
    } finally {
      setBusy(false)
    }
  }

  async function renderVideo(id: string) {
    setBusy(true)
    try {
      const res = await fetch('/api/cos/campaign-queue/render-video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      const j = await res.json().catch(() => null)
      if (!res.ok || !j?.ok) throw new Error(j?.error || copy.errorRender)
      setMessage(copy.rendering)
      await load(true)
    } catch { setMessage(copy.errorRender) } finally { setBusy(false) }
  }

  async function checkVideoStatus(id: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/cos/campaign-queue/render-video?id=${encodeURIComponent(id)}`, { cache: 'no-store' })
      const j = await res.json().catch(() => null)
      if (!res.ok || !j?.ok) throw new Error(j?.error || copy.errorRender)
      setMessage('Video status refreshed.')
      await load(true)
    } catch { setMessage(copy.errorRender) } finally { setBusy(false) }
  }

  return <main style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gap: 18 }}>
    <section style={{ ...panel, background: 'linear-gradient(145deg, rgba(15,23,42,.95), rgba(2,6,23,.97))' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: 0, color: GOLD, fontSize: 12, fontWeight: 950, letterSpacing: '.12em', textTransform: 'uppercase' }}>Marketing / Sales Console</p>
          <h1 style={{ color: '#fff', margin: '10px 0 0', fontSize: 34 }}>{copy.title}</h1>
          <p style={{ ...muted, maxWidth: 760 }}>{copy.intro}</p>
        </div>
        <button disabled={busy || loading} onClick={() => load()} style={secondary}>{loading ? copy.loading : copy.refresh}</button>
      </div>
      <form onSubmit={createAutonomousCampaign} style={{ display: 'grid', gap: 10, marginTop: 16 }}>
        <label style={{ color: '#fff', fontWeight: 900 }}>{copy.command}</label>
        <textarea value={autonomousDirective} onChange={(e) => setAutonomousDirective(e.target.value)} placeholder={copy.placeholder} rows={4} style={{ width: '100%', border: '1px solid rgba(255,255,255,.14)', background: 'rgba(2,6,23,.78)', color: '#fff', borderRadius: 14, padding: 14, resize: 'vertical' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ color: 'rgba(255,255,255,.56)', fontSize: 12 }}>Waiting {stats.waiting} · Approved {stats.approved} · Running {stats.running} · Drafted {stats.drafted} · Outreach {outreach.length}</div>
          <button disabled={busy} style={primary}>{busy ? copy.working : copy.run}</button>
        </div>
      </form>
      {message && <p style={{ color: message.includes('Could not') ? '#fca5a5' : CYAN, margin: '12px 0 0' }}>{message}</p>}
    </section>

    <section style={{ display: 'grid', gap: 14 }}>
      {loading && <div style={panel}><p style={muted}>{copy.loading}</p></div>}
      {!loading && campaigns.length === 0 && <div style={panel}><p style={muted}>{copy.noCampaigns}</p></div>}
      {campaigns.map(campaign => <CampaignCard key={campaign.id} campaign={campaign} busy={busy} onPatch={patchCampaign} onGenerateDraft={generateDraftFromButton} onGenerateAll={generateAllFromButton} onPublish={publishLanguage} onRenderVideo={renderVideo} onCheckStatus={checkVideoStatus} />)}
    </section>
  </main>
}
