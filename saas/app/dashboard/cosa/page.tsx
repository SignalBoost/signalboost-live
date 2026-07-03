'use client'

import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useI18n } from '@/components/i18n/I18nProvider'

const GOLD = '#ffc300'
const CYAN = '#1af0ff'

type CampaignRow = { id: string; title?: string; objective?: string; audience?: string; channel?: string; status?: string; created_at?: string; approved_at?: string | null; metadata?: Record<string, any>; work_items?: Array<{ id?: string; input?: { language?: string }; output?: { title?: string; opening?: string; draft?: string; call_to_action?: string } }> }
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
  ready: 'Video ready for review.',
  draftPreview: 'Draft video preview — final voice/brand banner is still processing.',
  brandedPreview: 'Final branded video preview.',
  errorLoad: 'Could not load Marketing/Sales data.',
  errorAuto: 'Could not run the campaign command.',
  errorDraft: 'Could not generate the draft.',
  errorBatch: 'Could not start multilingual generation.',
  errorMark: 'Could not update this item.',
  errorPublish: 'Could not publish. Check the connected account.',
  errorRender: 'Could not start/check the video render.',
}

const panel: CSSProperties = { background: 'rgba(15,23,42,.72)', border: '1px solid rgba(255,255,255,.09)', borderRadius: 18, padding: 20, boxShadow: '0 20px 60px rgba(0,0,0,.28)' }
const primary: CSSProperties = { border: 'none', background: GOLD, color: '#000', borderRadius: 12, padding: '10px 14px', fontWeight: 900, cursor: 'pointer' }
const secondary: CSSProperties = { border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.06)', color: '#fff', borderRadius: 12, padding: '10px 14px', fontWeight: 800, cursor: 'pointer' }
const muted: CSSProperties = { color: 'rgba(255,255,255,.62)', lineHeight: 1.6 }

function hasDraft(campaign: CampaignRow) { return Boolean(campaign.work_items?.some(item => item.output)) }
function short(value?: string, fallback = '—') { const s = String(value || '').trim(); return s ? (s.length > 180 ? s.slice(0, 180).trim() + '…' : s) : fallback }
function fmt(value?: string) { if (!value) return '—'; try { return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) } catch { return value } }

function VideoBox({ campaign, busy, onRenderVideo, onCheckStatus }: { campaign: CampaignRow; busy: boolean; onRenderVideo: (id: string) => void; onCheckStatus: (id: string) => void }) {
  const video = (campaign.metadata as any)?.video || null
  if (!['youtube', 'short_video'].includes(campaign.channel || '')) return null
  if (!video) return <button disabled={busy} onClick={() => onRenderVideo(campaign.id)} style={secondary}>Render video</button>
  const finalUrl = video.branded === true && video.voicedUrl ? String(video.voicedUrl) : ''
  const draftUrl = !finalUrl && video.url ? String(video.url) : ''
  const src = finalUrl || draftUrl
  return <div style={{ marginTop: 12, border: '1px solid rgba(26,240,255,.25)', borderRadius: 12, background: 'rgba(26,240,255,.06)', padding: 12 }}>
    {video.status === 'rendering' && <div><p style={{ color: CYAN, fontSize: 13, margin: 0 }}>{copy.rendering}</p><button disabled={busy} onClick={() => onCheckStatus(campaign.id)} style={{ ...secondary, marginTop: 8 }}>Check status</button></div>}
    {video.status === 'ready' && src && <div><p style={{ color: CYAN, fontSize: 12, margin: '0 0 8px' }}>{finalUrl ? copy.brandedPreview : copy.draftPreview}</p><p style={{ color: 'rgba(255,255,255,.55)', fontSize: 11, margin: '0 0 8px' }}>Displaying: {finalUrl ? 'branded final' : 'base draft'} · Branded: {finalUrl ? 'yes' : 'no'}</p><video src={src} controls style={{ width: '100%', borderRadius: 10, maxHeight: 300, background: '#000' }} /></div>}
    {video.status === 'ready' && !src && <p style={{ color: CYAN, fontSize: 12, margin: 0 }}>Video metadata is ready but no URL is available yet. Click Check status.</p>}
    {video.status === 'failed' && <p style={{ color: '#fca5a5', fontSize: 13, margin: 0 }}>Video render failed: {String(video.error || 'unknown error')}</p>}
    {video.voiceError && <p style={{ color: '#fca5a5', fontSize: 12, margin: '10px 0 0' }}>⚠ {String(video.voiceError)}</p>}
  </div>
}

function CampaignCard({ campaign, busy, onPatch, onGenerateDraft, onGenerateAll, onPublish, onRenderVideo, onCheckStatus }: { campaign: CampaignRow; busy: boolean; onPatch: (id: string, status: 'approved' | 'rejected' | 'queued') => void; onGenerateDraft: (id: string) => void; onGenerateAll: (id: string) => void; onPublish: (id: string, language?: string) => void; onRenderVideo: (id: string) => void; onCheckStatus: (id: string) => void }) {
  const drafts = (campaign.work_items || []).filter(item => item.output)
  const waiting = campaign.status === 'waiting_approval' || campaign.status === 'draft'
  const canPublish = ['youtube', 'short_video', 'linkedin'].includes(campaign.channel || '') && (campaign.status === 'approved' || campaign.status === 'queued') && Boolean(campaign.approved_at)
  return <section style={{ ...panel, position: 'relative', overflow: 'hidden' }}>
    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: campaign.status === 'approved' ? '#34d399' : campaign.status === 'rejected' ? '#f87171' : GOLD }} />
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><div><strong style={{ color: '#fff' }}>{campaign.title || campaign.channel || 'Campaign'}</strong><p style={{ color: 'rgba(255,255,255,.48)', margin: '4px 0 0', fontSize: 12 }}>{campaign.channel || 'campaign'} · {fmt(campaign.created_at)}</p></div><span style={{ color: GOLD, fontSize: 12, fontWeight: 900 }}>{campaign.status || 'pending'}</span></div>
    <p style={muted}>{short(campaign.objective, 'No objective attached.')}</p>
    {drafts.map((item, idx) => <div key={item.id || idx} style={{ border: '1px solid rgba(255,195,0,.22)', borderRadius: 14, background: 'rgba(255,195,0,.06)', padding: 12, marginTop: 10 }}><p style={{ color: GOLD, fontSize: 11, fontWeight: 900, margin: 0 }}>Review draft {item.input?.language ? `· ${String(item.input.language).toUpperCase()}` : ''}</p><h3 style={{ color: '#fff', margin: '8px 0 0', fontSize: 15 }}>{item.output?.title || campaign.title}</h3>{item.output?.draft && <pre style={{ whiteSpace: 'pre-wrap', color: 'rgba(255,255,255,.78)', background: 'rgba(0,0,0,.25)', borderRadius: 12, padding: 10, fontSize: 12, lineHeight: 1.5, maxHeight: 220, overflow: 'auto' }}>{item.output.draft}</pre>}{item.output?.call_to_action && <p style={{ color: GOLD, fontWeight: 900 }}>CTA: {item.output.call_to_action}</p>}{canPublish && <button disabled={busy} onClick={() => onPublish(campaign.id, item.input?.language)} style={secondary}>Publish</button>}</div>)}
    <VideoBox campaign={campaign} busy={busy} onRenderVideo={onRenderVideo} onCheckStatus={onCheckStatus} />
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.06)', flexWrap: 'wrap' }}>{waiting && <button disabled={busy} onClick={() => onPatch(campaign.id, 'rejected')} style={secondary}>Reject</button>}{waiting && <button disabled={busy} onClick={() => onPatch(campaign.id, 'approved')} style={primary}>Approve campaign</button>}{!hasDraft(campaign) && <button disabled={busy} onClick={() => onGenerateDraft(campaign.id)} style={primary}>Generate review draft</button>}<button disabled={busy} onClick={() => onGenerateAll(campaign.id)} style={secondary}>Generate all languages</button></div>
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
  async function load(keepMessage = false) { setLoading(true); if (!keepMessage) setMessage(''); try { const [admRes, campaignRes] = await Promise.all([fetch('/api/admin/adm', { cache: 'no-store' }), fetch('/api/cos/campaign-queue', { cache: 'no-store' })]); const admJson = await admRes.json().catch(() => null); const campaignJson = await campaignRes.json().catch(() => null); if (!admRes.ok || !campaignRes.ok) throw new Error(copy.errorLoad); setOutreach(Array.isArray(admJson?.recentOutreach) ? admJson.recentOutreach : []); setCampaigns(Array.isArray(campaignJson?.campaigns) ? campaignJson.campaigns : []) } catch { setMessage(copy.errorLoad) } finally { setLoading(false) } }
  useEffect(() => { load() }, [])
  useEffect(() => { let t: any = null; const ping = () => { if (t) clearTimeout(t); t = setTimeout(() => load(true), 1200) }; const channel = supabase.channel('cos-campaign-queue-rt').on('postgres_changes', { event: '*', schema: 'public', table: 'cos_campaign_queue' }, ping).subscribe(); return () => { if (t) clearTimeout(t); supabase.removeChannel(channel) } }, [])
  const stats = useMemo(() => ({ waiting: campaigns.filter(row => row.status === 'waiting_approval' || row.status === 'draft').length, approved: campaigns.filter(row => row.status === 'approved').length, running: campaigns.filter(row => row.status === 'queued' || row.status === 'running').length, drafted: campaigns.filter(hasDraft).length }), [campaigns])
  const featured = useMemo(() => campaigns.find((cm) => (cm.metadata as any)?.video), [campaigns])
  async function generateDraft(id: string) { const res = await fetch('/api/cos/script-worker', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaign_id: id }) }); if (!res.ok) throw new Error(copy.errorDraft); return res.json().catch(() => null) }
  async function createAutonomousCampaign(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!autonomousDirective.trim()) { setMessage(copy.requiredCommand); return } setBusy(true); try { const res = await fetch('/api/cos/campaign-queue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ directive: autonomousDirective }) }); const json = await res.json().catch(() => null); if (!res.ok) throw new Error(copy.errorAuto); if (json?.campaign?.id) await generateDraft(json.campaign.id); setMessage(copy.created); await load(true) } catch { setMessage(copy.errorAuto) } finally { setBusy(false) } }
  async function patchCampaign(id: string, status: 'approved' | 'rejected' | 'queued') { setBusy(true); try { const res = await fetch('/api/cos/campaign-queue', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) }); if (!res.ok) throw new Error(copy.errorMark); setMessage(`${copy.marked} ${status}.`); await load(true) } catch { setMessage(copy.errorMark) } finally { setBusy(false) } }
  async function generateDraftFromButton(id: string) { setBusy(true); try { await generateDraft(id); setMessage(copy.draftDone); await load(true) } catch { setMessage(copy.errorDraft) } finally { setBusy(false) } }
  async function generateAllFromButton(id: string) { setBusy(true); try { const res = await fetch('/api/cos/script-worker/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaign_id: id }) }); if (!res.ok) throw new Error(copy.errorBatch); setMessage(copy.batchDone); await load(true) } catch { setMessage(copy.errorBatch) } finally { setBusy(false) } }
  async function publishLanguage(id: string, language?: string) { setBusy(true); try { const res = await fetch('/api/cos/campaign-queue/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, language }) }); const j = await res.json().catch(() => null); if (!res.ok || !j?.ok) throw new Error(j?.error || copy.errorPublish); setMessage(copy.published); await load(true) } catch { setMessage(copy.errorPublish) } finally { setBusy(false) } }
  async function renderVideo(id: string) { setBusy(true); try { const res = await fetch('/api/cos/campaign-queue/render-video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }); const j = await res.json().catch(() => null); if (!res.ok || !j?.ok) throw new Error(j?.error || copy.errorRender); setMessage(copy.rendering); await load(true) } catch { setMessage(copy.errorRender) } finally { setBusy(false) } }
  async function checkRenderStatus(id: string) { setBusy(true); try { const res = await fetch('/api/cos/campaign-queue/render-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }); const j = await res.json().catch(() => null); if (!res.ok || !j?.ok) throw new Error(j?.error || copy.errorRender); setMessage(j.status === 'ready' ? copy.ready : j.status === 'failed' ? (j.error || 'Video failed') : copy.rendering); await load(true) } catch (e: any) { setMessage(e?.message || copy.errorRender) } finally { setBusy(false) } }
  return <main style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}><section style={{ background: 'linear-gradient(145deg, rgba(15,23,42,0.96), rgba(2,6,23,0.98))', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 24, padding: 28, boxShadow: '0 28px 80px rgba(0,0,0,0.38)' }}><div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}><div><p style={{ margin: 0, color: GOLD, fontSize: 12, fontWeight: 950, letterSpacing: '.12em', textTransform: 'uppercase' }}>Marketing & Sales Department</p><h1 style={{ color: '#fff', fontSize: 34, lineHeight: 1.05, letterSpacing: '-0.04em', margin: '10px 0 0', fontWeight: 950 }}>COSA Campaign Console</h1><p style={{ color: 'rgba(255,255,255,0.68)', maxWidth: 820, lineHeight: 1.7, marginTop: 14 }}>{copy.intro}</p></div><button onClick={() => load()} disabled={loading || busy} style={secondary}>{loading ? copy.loading : copy.refresh}</button></div></section>{message && <div style={{ border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(15,23,42,0.75)', color: '#fff', padding: '12px 16px', borderRadius: 14 }}>{message}</div>}<section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>{[['Campaigns', campaigns.length], ['Awaiting approval', stats.waiting], ['Approved', stats.approved], ['Running', stats.running], ['Drafted', stats.drafted], ['Outreach approvals', outreach.filter(row => row.status === 'pending').length]].map(([label, value]) => <section key={String(label)} style={{ ...panel, padding: 16 }}><p style={{ margin: 0, color: 'rgba(255,255,255,.55)', fontSize: 12, fontWeight: 800 }}>{label}</p><strong style={{ display: 'block', color: '#fff', marginTop: 6, fontSize: 28 }}>{String(value)}</strong></section>)}</section><section style={{ ...panel, background: 'linear-gradient(145deg, rgba(255,195,0,0.11), rgba(15,23,42,0.72))', border: '1px solid rgba(255,195,0,0.24)' }}><p style={{ margin: 0, color: GOLD, fontSize: 12, fontWeight: 950, letterSpacing: '.12em', textTransform: 'uppercase' }}>{copy.command}</p><h2 style={{ color: '#fff', margin: '8px 0 0', fontSize: 20 }}>Tell COSA what to create</h2><p style={muted}>COSA creates a governed campaign draft. Public publishing stays locked until approval.</p><form onSubmit={createAutonomousCampaign} style={{ display: 'grid', gap: 12, marginTop: 16 }}><label style={{ display: 'grid', gap: 8, color: 'rgba(255,255,255,.72)', fontSize: 12, fontWeight: 800 }}>{copy.command}<textarea value={autonomousDirective} onChange={e => setAutonomousDirective(e.target.value)} placeholder={copy.placeholder} rows={4} style={{ width: '100%', resize: 'vertical', borderRadius: 14, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(2,6,23,.65)', color: '#fff', padding: 12, outline: 'none' }} /></label><button type="submit" disabled={busy} style={primary}>{busy ? copy.working : copy.run}</button></form></section>{featured && <section style={{ ...panel, border: '1px solid rgba(26,240,255,.28)', background: 'linear-gradient(145deg, rgba(26,240,255,.08), rgba(15,23,42,.72))' }}><p style={{ margin: 0, color: CYAN, fontSize: 12, fontWeight: 950, letterSpacing: '.12em', textTransform: 'uppercase' }}>Latest video</p><h2 style={{ color: '#fff', margin: '8px 0 0', fontSize: 20 }}>{featured.title || ''}</h2><p style={{ color: 'rgba(255,255,255,.55)', fontSize: 12, margin: '4px 0 0' }}>{featured.channel || 'video'} · {featured.status || 'pending'}</p><VideoBox campaign={featured} busy={busy} onRenderVideo={renderVideo} onCheckStatus={checkRenderStatus} /></section>}<section style={panel}><h2 style={{ color: '#fff', margin: 0, fontSize: 20 }}>Campaign repository</h2><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14, marginTop: 14 }}>{loading && <p style={muted}>{copy.loading}</p>}{!loading && campaigns.length === 0 && <p style={muted}>No campaigns queued yet.</p>}{campaigns.map(campaign => <CampaignCard key={campaign.id} campaign={campaign} busy={busy} onPatch={patchCampaign} onGenerateDraft={generateDraftFromButton} onGenerateAll={generateAllFromButton} onPublish={publishLanguage} onRenderVideo={renderVideo} onCheckStatus={checkRenderStatus} />)}</div></section></main>
}
