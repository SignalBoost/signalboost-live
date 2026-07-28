'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useI18n } from '@/components/i18n/I18nProvider'
import { CosaCampaignConfigurator } from '@/components/enterprise'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


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
  title: uiCopy('u_352416938a2735f8'),
  intro: uiCopy('u_7928a3e02b4acf0c'),
  refresh: uiCopy('u_d85625836d00de56'),
  loading: uiCopy('u_dce3dd1a347f42d6'),
  noCampaigns: uiCopy('u_df82d0d2f1556eda'),
  created: uiCopy('u_7e4d7293a3e682b4'),
  draftDone: uiCopy('u_be3c324095c2c87e'),
  batchDone: uiCopy('u_e3e1e3d88b59bde7'),
  marked: uiCopy('u_d45f32bbd3a90fb8'),
  published: uiCopy('u_38b60122519c40ca'),
  rendering: uiCopy('u_14f9c526a2fa965a'),
  brandedPreview: uiCopy('u_86b5ebcbd73eeb01'),
  errorLoad: uiCopy('u_7f2b6ca2128bd883'),
  errorAuto: uiCopy('u_d1666a617898374e'),
  errorDraft: uiCopy('u_d76430060a4eb472'),
  errorBatch: uiCopy('u_a0088a679d7b8144'),
  errorMark: uiCopy('u_bf5dc8d5313a231a'),
  errorPublish: uiCopy('u_cf2d70645d218108'),
  errorRender: uiCopy('u_0cf25365b955b698'),
}

const panel: CSSProperties = { background: 'rgba(15,23,42,.72)', border: '1px solid rgba(255,255,255,.09)', borderRadius: 18, padding: 20, boxShadow: '0 20px 60px rgba(0,0,0,.28)' }
const primary: CSSProperties = { border: 'none', background: GOLD, color: '#000', borderRadius: 12, padding: '10px 14px', fontWeight: 900, cursor: 'pointer' }
const secondary: CSSProperties = { border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.06)', color: '#fff', borderRadius: 12, padding: '10px 14px', fontWeight: 800, cursor: 'pointer' }
const muted: CSSProperties = { color: 'rgba(255,255,255,.62)', lineHeight: 1.6 }

function hasDraft(campaign: CampaignRow) { return Boolean(campaign.work_items?.some(item => item.output)) }
function short(value?: string, fallback = '—') { const s = String(value || '').trim(); return s ? (s.length > 180 ? s.slice(0, 180).trim() + '…' : s) : fallback }
function fmt(value?: string) { if (!value) return '—'; try { return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) } catch { return value } }
function errorText(value: unknown, fallback: string) { const text = value instanceof Error ? value.message : String(value || ''); return text && text !== 'undefined' ? text : fallback }
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
  if (!video) return <button disabled={busy} onClick={() => onRenderVideo(campaign.id)} style={secondary}><LocalizedText fallback={uiCopy('u_9271168fc783b942')} /></button>
  const finalUrl = video.branded === true && video.voicedUrl ? String(video.voicedUrl) : ''
  return <div style={{ marginTop: 12, border: '1px solid rgba(26,240,255,.25)', borderRadius: 12, background: 'rgba(26,240,255,.06)', padding: 12 }}>
    {video.status === 'rendering' && <div><p style={{ color: CYAN, fontSize: 13, margin: 0 }}>{copy.rendering}</p><button disabled={busy} onClick={() => onCheckStatus(campaign.id)} style={{ ...secondary, marginTop: 8 }}><LocalizedText fallback={uiCopy('u_76522b005b5b0702')} /></button></div>}
    {video.status === 'ready' && finalUrl && <div><p style={{ color: CYAN, fontSize: 12, margin: '0 0 8px' }}>{copy.brandedPreview}</p><p style={{ color: 'rgba(255,255,255,.55)', fontSize: 11, margin: '0 0 8px' }}>{uiCopy('u_2252f7ecea02ebe0')}</p><video src={finalUrl} controls style={{ width: '100%', borderRadius: 10, maxHeight: 300, background: '#000' }} /></div>}
    {video.status === 'ready' && !finalUrl && <div><p style={{ color: GOLD, fontSize: 13, margin: 0, fontWeight: 900 }}><LocalizedText fallback={uiCopy('u_0bafec3551e8a9f2')} /></p><p style={{ color: 'rgba(255,255,255,.7)', fontSize: 12, margin: '8px 0 0' }}>{videoStatusText(video)}</p><p style={{ color: 'rgba(255,255,255,.5)', fontSize: 11, margin: '8px 0 0' }}>{uiCopy('u_95440922116b3323')}</p></div>}
    {video.status === 'failed' && <p style={{ color: '#fca5a5', fontSize: 13, margin: 0 }}>{uiCopy('u_30caa3ea31e2702f')}{String(video.error || uiCopy('u_5622dae220f44e3f'))}</p>}
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
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><div><strong style={{ color: '#fff' }}>{campaign.title || campaign.channel || uiCopy('u_51b76d7bd6914c68')}</strong><p style={{ color: 'rgba(255,255,255,.48)', margin: '4px 0 0', fontSize: 12 }}>{campaign.channel || uiCopy('u_a3f711769acca5f2')} · {fmt(campaign.created_at)}</p></div><span style={{ color: GOLD, fontSize: 12, fontWeight: 900 }}>{campaign.status || uiCopy('u_b61d0b50ec07c23f')}</span></div>
    <p style={muted}>{short(campaign.objective, uiCopy('u_f6904fdefb1c7248'))}</p>
    {drafts.map((item, idx) => <div key={item.id || idx} style={{ border: '1px solid rgba(255,195,0,.22)', borderRadius: 14, background: 'rgba(255,195,0,.06)', padding: 12, marginTop: 10 }}><p style={{ color: GOLD, fontSize: 11, fontWeight: 900, margin: 0 }}>{uiCopy('u_645a5377e32a7f1d')}{item.input?.language ? `· ${String(item.input.language).toUpperCase()}` : ''}</p><h3 style={{ color: '#fff', margin: '8px 0 0', fontSize: 15 }}>{item.output?.title || campaign.title}</h3>{item.output?.draft && <pre style={{ whiteSpace: 'pre-wrap', color: 'rgba(255,255,255,.78)', background: 'rgba(0,0,0,.25)', borderRadius: 12, padding: 10, fontSize: 12, lineHeight: 1.5, maxHeight: 220, overflow: 'auto' }}>{item.output.draft}</pre>}{item.output?.call_to_action && <p style={{ color: GOLD, fontWeight: 900 }}>{uiCopy('u_6ef68e9a19523370')}{item.output.call_to_action}</p>}{canPublish && <button disabled={busy} onClick={() => onPublish(campaign.id, item.input?.language)} style={secondary}>{uiCopy('u_691b51636cd2c5db')}</button>}</div>)}
    <VideoBox campaign={campaign} busy={busy} onRenderVideo={onRenderVideo} onCheckStatus={onCheckStatus} />
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.06)', flexWrap: 'wrap' }}>
      {waiting && <button disabled={busy} onClick={() => onPatch(campaign.id, 'rejected')} style={secondary}>{uiCopy('u_1156faaec270d83f')}</button>}
      {waiting && (!['youtube', 'short_video'].includes(campaign.channel || '') || finalVideoReady) && <button disabled={busy} onClick={() => onPatch(campaign.id, 'approved')} style={primary}><LocalizedText fallback={uiCopy('u_bc2eca3138fc1d5c')} /></button>}
      {waiting && ['youtube', 'short_video'].includes(campaign.channel || '') && !finalVideoReady && <span style={{ color: 'rgba(255,255,255,.55)', fontSize: 12, alignSelf: 'center' }}>{uiCopy('u_d446f4d24d58eee5')}</span>}
      {!hasDraft(campaign) && <button disabled={busy} onClick={() => onGenerateDraft(campaign.id)} style={primary}><LocalizedText fallback={uiCopy('u_93fe2e423a72db84')} /></button>}
      <button disabled={busy} onClick={() => onGenerateAll(campaign.id)} style={secondary}><LocalizedText fallback={uiCopy('u_3322b29ab4896848')} /></button>
    </div>
  </section>
}

export default function MarketingSalesCosaPage() {
  useI18n()
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([])
  const [outreach, setOutreach] = useState<OutreachRow[]>([])
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
    } catch { setMessage(copy.errorLoad) } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    let t: any = null
    const ping = () => { if (t) clearTimeout(t); t = setTimeout(() => load(true), 1200) }
    const channel = supabase.channel('cos-campaign-queue-rt').on('postgres_changes', { event: '*', schema: 'public', table: 'cos_campaign_queue' }, ping).subscribe()
    return () => { if (t) clearTimeout(t); supabase.removeChannel(channel) }
  }, [])

  const stats = useMemo(() => ({ waiting: campaigns.filter(row => row.status === 'waiting_approval' || row.status === 'draft').length, approved: campaigns.filter(row => row.status === 'approved').length, running: campaigns.filter(row => row.status === 'queued' || row.status === 'running').length, drafted: campaigns.filter(hasDraft).length }), [campaigns])

  async function generateDraft(id: string) { const res = await fetch('/api/cos/script-worker', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaign_id: id }) }); if (!res.ok) throw new Error(copy.errorDraft); return res.json().catch(() => null) }
  async function createStructuredCampaign(directive: string) {
    setBusy(true)
    try {
      const res = await fetch('/api/cos/campaign-queue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ directive }) })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(copy.errorAuto)
      if (json?.campaign?.id) await generateDraft(json.campaign.id)
      setMessage(copy.created)
      await load(true)
    } catch { setMessage(copy.errorAuto) } finally { setBusy(false) }
  }
  async function patchCampaign(id: string, status: 'approved' | 'rejected' | 'queued') { setBusy(true); try { const res = await fetch('/api/cos/campaign-queue', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) }); if (!res.ok) throw new Error(copy.errorMark); setMessage(`${copy.marked} ${status}.`); await load(true) } catch { setMessage(copy.errorMark) } finally { setBusy(false) } }
  async function generateDraftFromButton(id: string) { setBusy(true); try { await generateDraft(id); setMessage(copy.draftDone); await load(true) } catch { setMessage(copy.errorDraft) } finally { setBusy(false) } }
  async function generateAllFromButton(id: string) { setBusy(true); try { const res = await fetch('/api/cos/script-worker/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaign_id: id }) }); if (!res.ok) throw new Error(copy.errorBatch); setMessage(copy.batchDone); await load(true) } catch { setMessage(copy.errorBatch) } finally { setBusy(false) } }
  async function publishLanguage(id: string, language?: string) { setBusy(true); try { const res = await fetch('/api/cos/campaign-queue/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, language }) }); const j = await res.json().catch(() => null); if (!res.ok || !j?.ok) throw new Error(j?.error || j?.result?.error || j?.result?.mode || copy.errorPublish); setMessage(j?.result?.liveUrl ? `${copy.published} ${j.result.liveUrl}` : copy.published); await load(true) } catch (e) { setMessage(`${copy.errorPublish}: ${errorText(e, uiCopy('u_44d562d0740d03e3'))}`) } finally { setBusy(false) } }
  async function renderVideo(id: string) { setBusy(true); try { const res = await fetch('/api/cos/campaign-queue/render-video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }); const j = await res.json().catch(() => null); if (!res.ok || !j?.ok) throw new Error(j?.error || copy.errorRender); setMessage(copy.rendering); await load(true) } catch { setMessage(copy.errorRender) } finally { setBusy(false) } }
  async function checkVideoStatus(id: string) { setBusy(true); try { const res = await fetch(`/api/cos/campaign-queue/render-video?id=${encodeURIComponent(id)}`, { cache: 'no-store' }); const j = await res.json().catch(() => null); if (!res.ok || !j?.ok) throw new Error(j?.error || copy.errorRender); setMessage(uiCopy('u_155f9c4ae930a670')); await load(true) } catch { setMessage(copy.errorRender) } finally { setBusy(false) } }

  return <main style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gap: 18 }}>
    <section style={{ ...panel, background: 'linear-gradient(145deg, rgba(15,23,42,.95), rgba(2,6,23,.97))' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}><div><p style={{ margin: 0, color: GOLD, fontSize: 12, fontWeight: 950, letterSpacing: '.12em', textTransform: 'uppercase' }}><LocalizedText fallback={uiCopy('u_05a3b66d55f8c2e5')} /></p><h1 style={{ color: '#fff', margin: '10px 0 0', fontSize: 34 }}>{copy.title}</h1><p style={{ ...muted, maxWidth: 760 }}>{copy.intro}</p></div><button disabled={busy || loading} onClick={() => load()} style={secondary}>{loading ? copy.loading : copy.refresh}</button></div>
      <CosaCampaignConfigurator busy={busy} onSubmit={createStructuredCampaign} />
      <div style={{ color: 'rgba(255,255,255,.56)', fontSize: 12, marginTop: 12 }}>{uiCopy('u_3cd29bb6fc9db48c')}{stats.waiting}{uiCopy('u_86664fc5e813397b')}{stats.approved}{uiCopy('u_7e5c5cef4ebb4ecf')}{stats.running}{uiCopy('u_a7d3708532e90ffb')}{stats.drafted}{uiCopy('u_0eb5202e20d7e47f')}{outreach.length}</div>
      {message && <p style={{ color: message.includes('Could not') ? '#fca5a5' : CYAN, margin: '12px 0 0' }}>{message}</p>}
    </section>
    <section style={{ display: 'grid', gap: 14 }}>
      {loading && <div style={panel}><p style={muted}>{copy.loading}</p></div>}
      {!loading && campaigns.length === 0 && <div style={panel}><p style={muted}>{copy.noCampaigns}</p></div>}
      {campaigns.map(campaign => <CampaignCard key={campaign.id} campaign={campaign} busy={busy} onPatch={patchCampaign} onGenerateDraft={generateDraftFromButton} onGenerateAll={generateAllFromButton} onPublish={publishLanguage} onRenderVideo={renderVideo} onCheckStatus={checkVideoStatus} />)}
    </section>
  </main>
}
