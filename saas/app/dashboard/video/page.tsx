'use client'

import { useEffect, useRef, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

type CaptionResult = { lang: string; langName: string; srtUrl?: string; vttUrl?: string; assUrl?: string }
type CaptionCue = { id: string; index: number; start: number; end: number; text: string; x: number; y: number; width: number }
type CaptionStyle = { fontFamily: string; fontSize: number; color: string; backgroundColor: string; animation: 'none' | 'fade' | 'pop' | 'slide' }
type VideoResult = { jobId: string; status: string; fileName: string; sourcePath: string; sourceSizeMb: number; duration: number; captions: CaptionResult[]; transcriptExcerpt?: string; langs: string[]; formats: string[] }
type ExportJob = { jobId: string; status: 'queued' | 'processing' | 'completed' | 'failed'; resultUrl?: string | null; error?: string | null }
type Phase = null | 'preparing' | 'uploading' | 'processing'

const LANGS = [
  { code: 'en', label: 'English' }, { code: 'pt', label: 'Português' }, { code: 'es', label: 'Español' }, { code: 'pl', label: 'Polski' }, { code: 'ru', label: 'Русский' },
]
const FORMATS = [{ code: 'srt', label: 'SRT' }, { code: 'vtt', label: 'WebVTT' }, { code: 'ass', label: 'ASS' }]
const ACCEPT = '.mp4,.mov,.avi,.mkv,.webm,video/*'
const DEFAULT_STYLE: CaptionStyle = { fontFamily: 'Arial', fontSize: 44, color: '#ffffff', backgroundColor: '#000000', animation: 'fade' }

function fmtDuration(secs: number): string {
  if (!secs || secs < 0) return '0:00'
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = Math.floor(secs % 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}
function fmtBytes(bytes: number): string {
  if (!bytes) return '0 B'; const u = ['B', 'KB', 'MB', 'GB']; const i = Math.min(u.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${u[i]}`
}
async function safeJson(res: Response): Promise<any> { try { return await res.json() } catch { return { error: `Unexpected server response (${res.status}).` } } }
function secondsFromStamp(stamp: string): number {
  const match = stamp.trim().match(/(?:(\d+):)?(\d{2}):(\d{2})[,.](\d{1,3})/)
  if (!match) return 0
  const [, hh = '0', mm, ss, ms] = match
  return Number(hh) * 3600 + Number(mm) * 60 + Number(ss) + Number(ms.padEnd(3, '0')) / 1000
}
function parseCaptionText(text: string): CaptionCue[] {
  return text.replace(/^WEBVTT[\s\S]*?\n\n/, '').split(/\n\s*\n/).map((block, blockIndex) => {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean)
    const timingIndex = lines.findIndex(l => /-->/.test(l))
    if (timingIndex < 0) return null
    const [startRaw, endRaw] = lines[timingIndex].split('-->').map(part => part.trim().split(/\s+/)[0])
    return { id: `cue-${blockIndex}`, index: Number(lines[0]) || blockIndex + 1, start: secondsFromStamp(startRaw), end: secondsFromStamp(endRaw), text: lines.slice(timingIndex + 1).join(' '), x: 12, y: 72, width: 76 }
  }).filter(Boolean) as CaptionCue[]
}

function QuotaStatusBar({ entitlement, tr }: { entitlement: any; tr: (k: string, f: string) => string }) {
  if (!entitlement) return null
  const minPct = Math.min(100, (Number(entitlement.projectedMinutes || entitlement.usedMinutes || 0) / Math.max(1, Number(entitlement.quotaMinutes || 1))) * 100)
  const gbPct = Math.min(100, (Number(entitlement.projectedStorageGb || entitlement.usedStorageGb || 0) / Math.max(0.1, Number(entitlement.quotaStorageGb || 0.1))) * 100)
  return <div className="sb-card" style={{ padding: 16, display: 'grid', gap: 10 }}>
    <strong>{tr('video.quota.title', 'Quota status')}</strong>
    <div className="sb-caption">{entitlement.message}</div>
    {[{ label: tr('video.quota.minutes', 'Minutes'), pct: minPct }, { label: tr('video.quota.storage', 'Storage'), pct: gbPct }].map(item => <div key={item.label}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span>{item.label}</span><span>{Math.round(item.pct)}%</span></div>
      <div style={{ height: 7, borderRadius: 99, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}><div style={{ width: `${item.pct}%`, height: '100%', background: item.pct >= 100 ? '#f97316' : 'var(--cyan,#1af0ff)' }} /></div>
    </div>)}
  </div>
}

function BillingBanner({ entitlement, tr }: { entitlement: any; tr: (k: string, f: string) => string }) {
  if (!entitlement?.overQuota && !entitlement?.demoOnly) return null
  return <div style={{ padding: 14, borderRadius: 16, border: '1px solid rgba(249,115,22,.45)', background: 'rgba(249,115,22,.12)', color: '#fed7aa' }}>
    <strong>{entitlement.demoOnly ? tr('video.billing.demo', 'Demo playback only') : tr('video.billing.over', 'Overage billing applies')}</strong>
    <div style={{ marginTop: 4 }}>{entitlement.demoOnly ? tr('video.billing.upgrade', 'Free/demo users can preview short clips. Upgrade for full editing and export.') : `${tr('video.billing.estimate', 'Estimated overage')}: $${entitlement.estimatedOverageUsd} (${(entitlement.billingProviders || []).join(' / ') || 'Stripe/PayPal'})`}</div>
  </div>
}

function CanvasEditor({ videoUrl, cues, setCues, style, setStyle, demoLimitSec, tr }: { videoUrl: string; cues: CaptionCue[]; setCues: (c: CaptionCue[]) => void; style: CaptionStyle; setStyle: (s: CaptionStyle) => void; demoLimitSec: number; tr: (k: string, f: string) => string }) {
  const videoRef = useRef<HTMLVideoElement>(null), canvasRef = useRef<HTMLCanvasElement>(null)
  const [time, setTime] = useState(0), [duration, setDuration] = useState(0), [dragId, setDragId] = useState<string | null>(null)
  const activeCue = cues.find(c => time >= c.start && time <= c.end) || null

  useEffect(() => {
    let raf = 0
    const draw = () => {
      const video = videoRef.current, canvas = canvasRef.current, ctx = canvas?.getContext('2d')
      if (video && canvas && ctx) {
        const w = canvas.width, h = canvas.height
        ctx.fillStyle = '#050816'; ctx.fillRect(0, 0, w, h)
        if (video.readyState >= 2) ctx.drawImage(video, 0, 0, w, h)
        const cue = cues.find(c => video.currentTime >= c.start && video.currentTime <= c.end)
        if (cue) drawCaption(ctx, cue, style, w, h, video.currentTime)
        setTime(video.currentTime); setDuration(video.duration || 0)
        if (demoLimitSec > 0 && video.currentTime > demoLimitSec) video.pause()
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw); return () => cancelAnimationFrame(raf)
  }, [cues, style, demoLimitSec])

  function updateCue(id: string, patch: Partial<CaptionCue>) { setCues(cues.map(c => c.id === id ? { ...c, ...patch } : c)) }
  function onPointer(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!activeCue) return
    const rect = e.currentTarget.getBoundingClientRect(); const x = ((e.clientX - rect.left) / rect.width) * 100; const y = ((e.clientY - rect.top) / rect.height) * 100
    if (e.type === 'pointerdown') { setDragId(activeCue.id); e.currentTarget.setPointerCapture(e.pointerId) }
    if (e.type === 'pointermove' && dragId) updateCue(dragId, { x: Math.max(0, Math.min(90, x - activeCue.width / 2)), y: Math.max(0, Math.min(90, y)) })
    if (e.type === 'pointerup') setDragId(null)
  }

  return <div className="sb-card" style={{ padding: 18 }}>
    <video ref={videoRef} src={videoUrl} playsInline style={{ display: 'none' }} onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)} />
    <canvas ref={canvasRef} width={1280} height={720} onPointerDown={onPointer} onPointerMove={onPointer} onPointerUp={onPointer} style={{ width: '100%', borderRadius: 18, border: '1px solid rgba(255,255,255,.12)', cursor: activeCue ? 'grab' : 'default', background: '#050816' }} />
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
      <button className="sb-button-primary" onClick={() => videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause()}>{tr('video.editor.playPause', 'Play / pause')}</button>
      <input aria-label={tr('video.editor.scrub', 'Scrub timeline')} type="range" min={0} max={duration || 1} step={0.05} value={time} onChange={e => { if (videoRef.current) videoRef.current.currentTime = Number(e.target.value) }} style={{ flex: 1 }} />
      <span className="sb-caption">{fmtDuration(time)} / {fmtDuration(demoLimitSec > 0 ? Math.min(duration, demoLimitSec) : duration)}</span>
    </div>
    <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12 }}>
      <label className="sb-caption">{tr('video.style.font', 'Font')}<select value={style.fontFamily} onChange={e => setStyle({ ...style, fontFamily: e.target.value })} className="sb-input"><option>Arial</option><option>Inter</option><option>Georgia</option><option>Impact</option></select></label>
      <label className="sb-caption">{tr('video.style.size', 'Size')}<input className="sb-input" type="number" min={18} max={96} value={style.fontSize} onChange={e => setStyle({ ...style, fontSize: Number(e.target.value) })} /></label>
      <label className="sb-caption">{tr('video.style.color', 'Color')}<input className="sb-input" type="color" value={style.color} onChange={e => setStyle({ ...style, color: e.target.value })} /></label>
      <label className="sb-caption">{tr('video.style.background', 'Background')}<input className="sb-input" type="color" value={style.backgroundColor} onChange={e => setStyle({ ...style, backgroundColor: e.target.value })} /></label>
      <label className="sb-caption">{tr('video.style.animation', 'Animation')}<select className="sb-input" value={style.animation} onChange={e => setStyle({ ...style, animation: e.target.value as CaptionStyle['animation'] })}><option value="none">{tr('video.anim.none', 'None')}</option><option value="fade">{tr('video.anim.fade', 'Fade')}</option><option value="pop">{tr('video.anim.pop', 'Pop')}</option><option value="slide">{tr('video.anim.slide', 'Slide')}</option></select></label>
    </div>
  </div>
}

function drawCaption(ctx: CanvasRenderingContext2D, cue: CaptionCue, style: CaptionStyle, w: number, h: number, time: number) {
  ctx.save(); const alpha = style.animation === 'fade' ? Math.min(1, Math.max(0.2, (time - cue.start) / 0.4)) : 1; ctx.globalAlpha = alpha
  const x = (cue.x / 100) * w, y = (cue.y / 100) * h, maxWidth = (cue.width / 100) * w
  ctx.font = `700 ${style.fontSize}px ${style.fontFamily}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  const lines = wrapText(ctx, cue.text, maxWidth - 40); const lineHeight = style.fontSize * 1.22; const boxH = lines.length * lineHeight + 28; const cx = x + maxWidth / 2
  ctx.fillStyle = `${style.backgroundColor}cc`; roundRect(ctx, x, y - boxH / 2, maxWidth, boxH, 18); ctx.fill()
  ctx.fillStyle = style.color; lines.forEach((line, i) => ctx.fillText(line, cx, y + (i - (lines.length - 1) / 2) * lineHeight, maxWidth - 28)); ctx.restore()
}
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) { const words = text.split(/\s+/); const lines: string[] = []; let line = ''; for (const word of words) { const test = `${line} ${word}`.trim(); if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word } else line = test } if (line) lines.push(line); return lines }
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r) }

function CaptionTimeline({ cues, activeTime, tr }: { cues: CaptionCue[]; activeTime: number; tr: (k: string, f: string) => string }) {
  return <div className="sb-card" style={{ padding: 18, maxHeight: 420, overflow: 'auto' }}><h3>{tr('video.timeline.title', 'Caption timeline')}</h3>{cues.map(c => <div key={c.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,.08)', color: activeTime >= c.start && activeTime <= c.end ? 'var(--gold,#ffc300)' : undefined }}><div className="sb-caption">{fmtDuration(c.start)} → {fmtDuration(c.end)}</div><div>{c.text}</div></div>)}</div>
}

function ExportPanel({ result, cues, style, entitlement, tr }: { result: VideoResult | null; cues: CaptionCue[]; style: CaptionStyle; entitlement: any; tr: (k: string, f: string) => string }) {
  const [job, setJob] = useState<ExportJob | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!job || job.status === 'completed' || job.status === 'failed') return
    const timer = setInterval(async () => { const res = await fetch(`/api/video/jobs/${job.jobId}`); const data = await safeJson(res); if (res.ok) setJob(data) }, 3500)
    return () => clearInterval(timer)
  }, [job])
  async function exportVideo() {
    if (!result) return; setBusy(true); setError(null)
    const caption = result.captions?.find(c => c.vttUrl || c.srtUrl) || result.captions?.[0]
    const res = await fetch('/api/video/export', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sourceJobId: result.jobId, sourcePath: result.sourcePath, sourceSizeMb: result.sourceSizeMb, durationSec: result.duration, captionUrl: caption?.vttUrl || caption?.srtUrl, captionLang: caption?.lang || 'en', style: { ...style, x: cues[0]?.x ?? 12, y: cues[0]?.y ?? 72, width: cues[0]?.width ?? 76 }, overlays: cues }) })
    const data = await safeJson(res); setBusy(false); if (!res.ok) { setError(data.error || 'Export failed'); return } setJob(data)
  }
  return <div className="sb-card" style={{ padding: 18 }}><h3>{tr('video.export.title', 'Export MP4')}</h3><p className="sb-caption">{tr('video.export.help', 'Exports are queued for a dedicated FFmpeg worker so heavy caption burns do not run inside serverless functions.')}</p><button className="sb-button-primary" disabled={!result || busy || entitlement?.demoOnly} onClick={exportVideo}>{busy ? tr('video.export.queueing', 'Queueing…') : tr('video.export.button', 'Burn captions and export')}</button>{job && <p className="sb-body" style={{ marginTop: 12 }}>{tr('video.export.status', 'Job status')}: {job.status}</p>}{job?.resultUrl && <a className="sb-button-secondary" href={job.resultUrl} style={{ display: 'inline-flex', marginTop: 10 }}>{tr('video.export.download', 'Download final .mp4')}</a>}{error && <p style={{ color: '#fca5a5' }}>{error}</p>}</div>
}

export default function VideoEditorPage() {
  const i18n: any = useI18n(); const dict = i18n?.dict ?? i18n ?? {}; const tr = (key: string, fallback: string) => t(dict, key, fallback)
  const [file, setFile] = useState<File | null>(null), [videoUrl, setVideoUrl] = useState(''), [langs, setLangs] = useState(['en']), [formats, setFormats] = useState(['srt', 'vtt'])
  const [phase, setPhase] = useState<Phase>(null), [error, setError] = useState<string | null>(null), [result, setResult] = useState<VideoResult | null>(null), [cues, setCues] = useState<CaptionCue[]>([]), [style, setStyle] = useState(DEFAULT_STYLE), [entitlement, setEntitlement] = useState<any>(null), [activeTime] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null); const busy = phase !== null
  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl) }, [videoUrl])
  function pickFiles(list: FileList | null) { const next = list?.[0]; if (!next) return; if (videoUrl) URL.revokeObjectURL(videoUrl); setFile(next); setVideoUrl(URL.createObjectURL(next)); setResult(null); setCues([]); setError(null) }
  function toggle(arr: string[], set: (v: string[]) => void, code: string) { set(arr.includes(code) ? (arr.length > 1 ? arr.filter(x => x !== code) : arr) : [...arr, code]) }
  async function generate() {
    if (!file || busy) return; setPhase('preparing'); setError(null)
    try {
      const prep = await fetch('/api/video/upload-url', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fileName: file.name, fileSize: file.size, langs, formats }) }); const prepData = await safeJson(prep); setEntitlement(prepData.entitlement)
      if (!prep.ok) throw new Error(prepData.error || 'Could not prepare upload')
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (!supabaseUrl || !supabaseAnon) throw new Error('Supabase browser client is not configured.')
      const supabase = createBrowserClient(supabaseUrl, supabaseAnon)
      setPhase('uploading'); const { error: upErr } = await supabase.storage.from('video-jobs').uploadToSignedUrl(prepData.path, prepData.token, file); if (upErr) throw new Error(upErr.message)
      setPhase('processing'); const res = await fetch('/api/video', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jobId: prepData.jobId, path: prepData.path, langs, formats }) }); const data = await safeJson(res); if (!res.ok) throw new Error(data.error || 'Caption generation failed')
      setResult(data); const first = data.captions?.find((c: CaptionResult) => c.vttUrl || c.srtUrl); if (first) { const cap = await fetch(first.vttUrl || first.srtUrl); setCues(parseCaptionText(await cap.text())) }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setPhase(null) }
  }
  const demoLimit = entitlement?.demoOnly ? Number(entitlement.maxDemoSeconds || 30) : 0
  return <div style={{ maxWidth: 1220, margin: '0 auto', padding: '32px 20px 80px' }}>
    <p className="sb-eyebrow">{tr('video.editor.eyebrow', 'Video Studio')}</p><h2 className="sb-h2">{tr('video.editor.title', 'Canvas Caption Editor')}</h2><p className="sb-body">{tr('video.editor.subtitle', 'Upload a source video, generate timed captions, drag styled overlays on the canvas, and queue an FFmpeg burn-in export.')}</p>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(280px,.6fr)', gap: 18, marginTop: 20 }}>
      <div style={{ display: 'grid', gap: 18 }}>
        <div className="sb-card" style={{ padding: 18 }}><input ref={inputRef} type="file" accept={ACCEPT} onChange={e => pickFiles(e.target.files)} /><div className="sb-caption" style={{ marginTop: 8 }}>{file ? `${file.name} · ${fmtBytes(file.size)}` : tr('video.upload.help', 'Choose MP4, MOV, MKV, AVI, or WEBM.')}</div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>{LANGS.map(l => <button key={l.code} className="sb-button-secondary" data-on={langs.includes(l.code)} onClick={() => toggle(langs, setLangs, l.code)}>{l.label}</button>)}{FORMATS.map(f => <button key={f.code} className="sb-button-secondary" onClick={() => toggle(formats, setFormats, f.code)}>{f.label}</button>)}</div><button className="sb-button-primary" disabled={!file || busy} style={{ marginTop: 14 }} onClick={generate}>{busy ? tr('video.working', 'Working…') : tr('video.generate', 'Generate captions')}</button>{phase && <p className="sb-caption">{phase === 'preparing' ? tr('video.phase.prep', 'Preparing upload…') : phase === 'uploading' ? tr('video.phase.upload', 'Uploading your file…') : tr('video.phase.process', 'Transcribing and syncing captions…')}</p>}{error && <p style={{ color: '#fca5a5' }}>{error}</p>}</div>
        {videoUrl && <CanvasEditor videoUrl={videoUrl} cues={cues} setCues={setCues} style={style} setStyle={setStyle} demoLimitSec={demoLimit} tr={tr} />}
        <ExportPanel result={result} cues={cues} style={style} entitlement={entitlement} tr={tr} />
      </div>
      <div style={{ display: 'grid', gap: 18, alignContent: 'start' }}><QuotaStatusBar entitlement={entitlement} tr={tr} /><BillingBanner entitlement={entitlement} tr={tr} /><CaptionTimeline cues={cues} activeTime={activeTime} tr={tr} /><footer className="sb-caption">{tr('video.footer.sync', 'Status: captions stay synced to playback time; exports are processed by the video worker queue.')}</footer></div>
    </div>
  </div>
}
