'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

import { useEffect, useMemo, useRef, useState } from 'react'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


const GOLD = '#ffc300'
const CYAN = '#1af0ff'
const GREEN = '#34d399'
const RED = '#fca5a5'
const panel = { background: 'rgba(15,23,42,.78)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 18, padding: 18 } as const
const ghost = { border: '1px solid rgba(255,255,255,.18)', background: 'rgba(255,255,255,.06)', color: '#fff', borderRadius: 12, padding: '10px 14px', fontWeight: 800, cursor: 'pointer' } as const
const primary = { ...ghost, border: 'none', background: GREEN, color: '#001018', fontWeight: 950 } as const
const warning = { ...ghost, border: 'none', background: GOLD, color: '#000', fontWeight: 950 } as const
const PUBLISHED_STATUSES = new Set(['running', 'completed', 'measured', 'learned'])

type Tab = 'active' | 'published' | 'archived'
type CardState = 'working' | 'ready' | 'approved' | 'published' | 'problem'

function fmt(value: any) {
  if (!value) return '-'
  const d = new Date(String(value))
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function deriveState(campaign: any): { state: CardState; step: number; note: string } {
  const video = campaign?.video || {}
  const stage = String(video?.stage || '').toLowerCase()
  const status = String(campaign?.status || '').toLowerCase()
  const eligibility = String(campaign?.eligibility || '')
  const integrityKnown = video?.voiceStatus != null || video?.voiceEngine != null || video?.voiceFallback != null || video?.captionsBurned != null || video?.audioTrack != null
  const voiceVerified = video?.audioTrack === true && video?.captionsBurned === true
  const silentFallback = video?.voiceFallback === true && !voiceVerified
  const finalReady = video?.branded === true
    && Boolean(video?.finalUrl || video?.previewUrl)
    && video?.previewKind === 'branded final'
    && (!integrityKnown || voiceVerified)
  const hasBase = Boolean(video?.hasKlingUrl)
  const voiced = voiceVerified || (Array.isArray(video?.voicedLangs) && video.voicedLangs.length > 0)

  if (campaign?.approved_at && PUBLISHED_STATUSES.has(status)) return { state: 'published', step: 3, note: uiCopy('u_99a248688a8af728') }
  if (campaign?.approved_at) return { state: 'approved', step: 3, note: uiCopy('u_11a479c85a3ceb52') }
  if (silentFallback) return { state: 'working', step: 2, note: uiCopy('u_4b9b9c2d6ff16215') }
  if (finalReady) return { state: 'ready', step: 3, note: uiCopy('u_b9d22a00b60fa38c') }
  if (eligibility.startsWith('STUCK') || stage === 'failed') return { state: 'problem', step: hasBase ? 2 : 1, note: uiCopy('u_6c931ef9b685e1cd') }
  if (!hasBase) return { state: 'working', step: 1, note: uiCopy('u_f0b5663c63dd129a') }
  if (!voiced) return { state: 'working', step: 2, note: uiCopy('u_5839e3eb1af86a1a') }
  return { state: 'working', step: 3, note: uiCopy('u_cd6744e3f7b3d307') }
}

function Steps({ step, state }: { step: number; state: CardState }) {
  return <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
    {[uiCopy('u_47216c7d60710e0e'), uiCopy('u_7912bbe2dd9e37e5'), uiCopy('u_db775228a7544f12')].map((label, index) => {
      const n = index + 1
      const done = state === 'ready' || state === 'approved' || state === 'published' || n < step
      const active = state === 'working' && n === step
      const failed = state === 'problem' && n === step
      return <div key={label} style={{ display: 'flex', gap: 7, alignItems: 'center', padding: '6px 12px', borderRadius: 999, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(0,0,0,.25)' }}>
        <b style={{ color: done ? GREEN : failed ? RED : active ? CYAN : 'rgba(255,255,255,.35)' }}>{done ? '✓' : failed ? '!' : n}</b>
        <span style={{ color: done || active || failed ? '#fff' : 'rgba(255,255,255,.45)', fontSize: 13, fontWeight: 700 }}>{label}</span>
        {active && <small style={{ color: CYAN, fontWeight: 900 }}>{uiCopy('u_fccf59e431f9a269')}</small>}
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
      const [videoRes, archiveRes, integrityRes] = await Promise.all([
        fetch('/api/cos/video-pipeline-xray', { cache: 'no-store', credentials: 'include' }),
        fetch('/api/cos/video-archive', { cache: 'no-store', credentials: 'include' }),
        fetch('/api/cos/video-integrity', { cache: 'no-store', credentials: 'include' }),
      ])
      const videoJson = await videoRes.json().catch(() => null)
      const archiveJson = await archiveRes.json().catch(() => null)
      const integrityJson = await integrityRes.json().catch(() => null)
      if (!videoRes.ok || !videoJson?.ok) throw new Error(videoJson?.error || 'Could not load videos.')
      if (!archiveRes.ok || !archiveJson?.ok) throw new Error(archiveJson?.error || 'Could not load archive.')
      if (!integrityRes.ok || !integrityJson?.ok) throw new Error(integrityJson?.error || 'Could not verify video audio and captions.')

      const integrity = integrityJson.integrity || {}
      const campaigns = (videoJson.campaigns || []).map((campaign: any) => ({
        ...campaign,
        video: campaign.video ? { ...campaign.video, ...(integrity[String(campaign.id)] || {}) } : campaign.video,
      }))
      setData({ ...videoJson, campaigns })
      setArchived(Object.fromEntries((archiveJson.archived || []).map((x: any) => [String(x.id), String(x.archived_at || '')])))
      if (!quiet) setMessage('')

      // Final branded videos receive one owner approval email. The server stores a
      // durable success marker, so successful notifications are not duplicated;
      // failed email attempts remain eligible for the next refresh retry.
      void fetch('/api/cos/video-approval-notify', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'include',
      }).catch(() => null)
    } catch (e: any) {
      if (!quiet) setMessage(e?.message || uiCopy('u_2e79309763078f71'))
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

      const result = json?.autoPublish
      if (Number(result?.published || 0) > 0) {
        const liveResult = Array.isArray(result?.results) ? result.results.find((item: any) => item?.ok && item?.liveUrl) : null
        setMessage(liveResult?.liveUrl
          ? uiCopy('u_c1131ffada336295')
          : uiCopy('u_8d41ed8259dbc124'))
      } else if (Number(result?.attempted || 0) > 0) {
        const failed = Array.isArray(result?.results) ? result.results.find((item: any) => !item?.ok) : null
        setMessage(`Approved, but publishing needs attention: ${failed?.error || uiCopy('u_0fddb809a2a4c02a')}`)
      } else {
        setMessage(uiCopy('u_8d10b9c08dee6c6b'))
      }
      await load(true)
    } catch (e: any) { setMessage(e?.message || uiCopy('u_c407b0752eb73e8c')) } finally { setBusyId('') }
  }

  async function redo(id: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/cos/video-pipeline-xray?reset=${encodeURIComponent(id)}&kick=1`, { cache: 'no-store', credentials: 'include' })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Could not restart video.')
      setData(json)
      setMessage(uiCopy('u_658b4f408cb51924'))
    } catch (e: any) { setMessage(e?.message || uiCopy('u_f76519c758fc1775')) } finally { setBusyId('') }
  }

  async function crosspost(id: string, platform: string) {
    setBusyId(id); setMessage('')
    try {
      const res = await fetch('/api/cos/campaign-queue/crosspost', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ id, platform }) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(json.error || 'Cross-post failed.')
      setMessage(json.liveUrl ? `Posted. Live link: ${json.liveUrl}` : uiCopy('u_dfa14137c99b360f'))
    } catch (e: any) { setMessage(e?.message || uiCopy('u_038b456c8df94daf')) } finally { setBusyId('') }
  }

  async function republish(id: string) {
    setBusyId(id); setMessage('')
    try {
      const res = await fetch('/api/cos/campaign-queue/retry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ id }) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(json.error || 'Retry failed.')
      setMessage(json.liveUrl ? `Published. Live link: ${json.liveUrl}` : uiCopy('u_23a1d4f667741e66'))
      await load(true)
    } catch (e: any) { setMessage(e?.message || uiCopy('u_816fb2e334d79937')) } finally { setBusyId('') }
  }

  async function archiveAction(id: string, action: 'archive' | 'restore') {
    setBusyId(id)
    try {
      const res = await fetch('/api/cos/video-archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ id, action }) })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Archive action failed.')
      setMessage(action === 'archive' ? uiCopy('u_b8cf2bccb78ef87a') : uiCopy('u_74d3a4d4d2762128'))
      await load(true)
    } catch (e: any) { setMessage(e?.message || uiCopy('u_5c5d28dcaf071f0a')) } finally { setBusyId('') }
  }

  const all = Array.isArray(data?.campaigns) ? data.campaigns : []
  const isPublished = (campaign: any) => deriveState(campaign).state === 'published'
  const counts = useMemo(() => ({
    active: all.filter((c: any) => !archived[c.id] && !isPublished(c)).length,
    published: all.filter((c: any) => !archived[c.id] && isPublished(c)).length,
    archived: all.filter((c: any) => Boolean(archived[c.id])).length,
  }), [all, archived])
  const campaigns = all.filter((c: any) => tab === 'archived' ? Boolean(archived[c.id]) : tab === 'published' ? !archived[c.id] && isPublished(c) : !archived[c.id] && !isPublished(c))
  const messageIsError = /fail|could not|needs attention|not accept/i.test(message)

  return <main style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gap: 18 }}>
    <section style={{ ...panel, background: 'linear-gradient(145deg, rgba(15,23,42,.96), rgba(2,6,23,.98))' }}>
      <p style={{ margin: 0, color: GOLD, fontSize: 12, fontWeight: 950, letterSpacing: '.12em' }}><LocalizedText fallback={uiCopy('u_494965182f71b3f4')} /></p>
      <h1 style={{ color: '#fff', margin: '10px 0 0', fontSize: 32 }}><LocalizedText fallback={uiCopy('u_6d3522346151d1c3')} /></h1>
      <p style={{ color: 'rgba(255,255,255,.68)', lineHeight: 1.65 }}><LocalizedText fallback={uiCopy('u_33b7dc558824d800')} /></p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
        {([uiCopy('u_b0a3d7b387b09a68'), uiCopy('u_beb922fa92e81874'), uiCopy('u_db367d7f58a4ca67')] as Tab[]).map((name) => <button key={name} onClick={() => setTab(name)} style={{ ...ghost, background: tab === name ? 'rgba(255,195,0,.18)' : ghost.background, borderColor: tab === name ? GOLD : 'rgba(255,255,255,.18)' }}>{name[0].toUpperCase() + name.slice(1)} ({counts[name]})</button>)}
        <button onClick={() => load()} disabled={loading} style={ghost}>{loading ? uiCopy('u_2329b345c6150334') : uiCopy('u_9ee567d8de2dbe7f')}</button>
        <a href="/dashboard/cosa" style={{ ...ghost, textDecoration: 'none' }}><LocalizedText fallback={uiCopy('u_55ee240775f97a03')} /></a>
      </div>
      {message && <p style={{ color: messageIsError ? RED : GREEN, fontWeight: 800 }}>{message}</p>}
    </section>

    <section style={panel}>
      <h2 style={{ color: '#fff', margin: 0, fontSize: 20 }}>{tab === 'active' ? uiCopy('u_bbc7b97f5d7fb2eb') : tab === 'published' ? uiCopy('u_8979d1966334b11f') : uiCopy('u_448647c0bf349c7c')}</h2>
      <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
        {!campaigns.length && <p style={{ color: 'rgba(255,255,255,.62)' }}>{loading ? uiCopy('u_b16bdcf9a4981906') : `No ${tab} videos.`}</p>}
        {campaigns.map((campaign: any) => {
          const video = campaign.video || {}
          const { state, step, note } = deriveState(campaign)
          const previewUrl = state === 'ready' || state === 'approved' || state === 'published' ? String(video?.previewUrl || video?.finalUrl || '') : ''
          const badge = archived[campaign.id]
            ? { text: uiCopy('u_2c66da85b528a2e7'), color: GOLD }
            : state === 'ready'
              ? { text: uiCopy('u_88833d40ed210eb2'), color: GREEN }
              : state === 'published'
                ? { text: uiCopy('u_491bd1928d34a0c4'), color: GREEN }
                : state === 'approved'
                  ? { text: uiCopy('u_35ade4d4b151f72b'), color: CYAN }
                  : state === 'problem'
                    ? { text: uiCopy('u_98212d819b2a047d'), color: RED }
                    : { text: uiCopy('u_3358d34c2ffa4744'), color: CYAN }
          return <article key={campaign.id} style={{ border: '1px solid rgba(255,255,255,.1)', borderRadius: 14, padding: 14, background: 'rgba(2,6,23,.45)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div><strong style={{ color: '#fff' }}>{campaign.title || campaign.id}</strong><p style={{ color: 'rgba(255,255,255,.5)', margin: '4px 0 0', fontSize: 12 }}>{uiCopy('u_eec4282585c63806')}{fmt(campaign.created_at)}{campaign.approved_at ? ` · Approved ${fmt(campaign.approved_at)}` : ''}{archived[campaign.id] ? ` · Archived ${fmt(archived[campaign.id])}` : ''}</p></div>
              <span style={{ color: badge.color, fontSize: 12, fontWeight: 950 }}>{badge.text}</span>
            </div>
            <Steps step={step} state={state} />
            <p style={{ color: state === 'problem' ? RED : 'rgba(255,255,255,.75)', lineHeight: 1.6 }}>{note}</p>
            {previewUrl && <video src={previewUrl} controls style={{ width: '100%', maxHeight: 460, background: '#000', borderRadius: 12 }} />}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              {state === 'ready' && !archived[campaign.id] && <button onClick={() => approve(campaign.id)} disabled={busyId === campaign.id} style={primary}><LocalizedText fallback={uiCopy('u_fb1be944c054bbd7')} /></button>}
              {state === 'problem' && !archived[campaign.id] && <button onClick={() => redo(campaign.id)} disabled={busyId === campaign.id} style={warning}><LocalizedText fallback={uiCopy('u_b4fc7201fcad8f0f')} /></button>}
              {state === 'approved' && !archived[campaign.id] && <button onClick={() => republish(campaign.id)} disabled={busyId === campaign.id} style={primary}><LocalizedText fallback={uiCopy('u_8cdcd2740ba65242')} /></button>}
              {(state === 'approved' || state === 'published') && !archived[campaign.id] && <button onClick={() => crosspost(campaign.id, 'tiktok')} disabled={busyId === campaign.id} style={ghost}><LocalizedText fallback={uiCopy('u_4d25cb5e3e00b765')} /></button>}
              {(state === 'approved' || state === 'published') && !archived[campaign.id] && <button onClick={() => crosspost(campaign.id, 'instagram_business')} disabled={busyId === campaign.id} style={ghost}><LocalizedText fallback={uiCopy('u_31981264d9893f96')} /></button>}
              {!archived[campaign.id] && <button onClick={() => archiveAction(campaign.id, 'archive')} disabled={busyId === campaign.id} style={ghost}>{uiCopy('u_de0e0bb34ffc3498')}</button>}
              {archived[campaign.id] && <button onClick={() => archiveAction(campaign.id, 'restore')} disabled={busyId === campaign.id} style={primary}>{uiCopy('u_74a7b7090b212f45')}</button>}
            </div>
            <details style={{ marginTop: 12 }}><summary style={{ color: 'rgba(255,255,255,.45)', fontSize: 12, cursor: 'pointer' }}><LocalizedText fallback={uiCopy('u_ff10a80b36bb39d4')} /></summary><pre style={{ whiteSpace: 'pre-wrap', color: 'rgba(255,255,255,.6)', fontSize: 11 }}>{JSON.stringify({ campaignId: campaign.id, requestId: video.requestId, stage: video.stage, campaignStatus: campaign.status, eligibility: campaign.eligibility, voiceStatus: video.voiceStatus, voiceEngine: video.voiceEngine, audioTrack: video.audioTrack, captionsBurned: video.captionsBurned }, null, 2)}</pre></details>
          </article>
        })}
      </div>
    </section>
  </main>
}
