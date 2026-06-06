'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { defaultCaptionStyle, type CaptionCue, type CaptionStyle, type SupportedVideoLocale, type VideoQuota } from '@/lib/video/types'
import { calculateVideoQuota } from '@/lib/video/subscription'
import { useTranslation } from '@/lib/i18n/useTranslation'

type JobState = { jobId: string; status: string; result_url?: string | null; error?: string | null }
type UploadState = { status: 'idle' | 'uploading' | 'ready' | 'failed'; message: string }
type CaptionGenerationState = { status: 'idle' | 'generating' | 'ready' | 'failed'; message: string }
type AspectRatio = '9:16' | '1:1' | '16:9'
type CaptionPreset = { id: string; label: string; description: string; style: CaptionStyle }

const starterCaptions: CaptionCue[] = [
  { id: 'cue-1', start: 0, end: 2.8, text: 'Upload a video, then click Generate Captions to create synced AI captions.' },
  { id: 'cue-2', start: 3, end: 6, text: 'Drag the caption on the canvas, style it, then export an MP4.' },
]

const captionPresets: CaptionPreset[] = [
  { id: 'signal', label: 'SignalBoost', description: 'Gold business captions.', style: defaultCaptionStyle },
  { id: 'tiktok', label: 'TikTok bold', description: 'Large white pop captions.', style: { ...defaultCaptionStyle, fontFamily: 'Arial Black, Inter, sans-serif', fontSize: 48, color: '#ffffff', backgroundColor: 'rgba(0,0,0,0.72)', animation: 'pop', x: 50, y: 76 } },
  { id: 'hormozi', label: 'Hormozi', description: 'High-contrast yellow captions.', style: { ...defaultCaptionStyle, fontFamily: 'Impact, Inter, sans-serif', fontSize: 52, color: '#FFD700', backgroundColor: 'rgba(0,0,0,0.86)', animation: 'pop', x: 50, y: 70 } },
  { id: 'minimal', label: 'Minimal', description: 'Clean lower-third captions.', style: { ...defaultCaptionStyle, fontFamily: 'Inter, Arial, sans-serif', fontSize: 32, color: '#ffffff', backgroundColor: 'rgba(15,23,42,0.52)', animation: 'fade', x: 50, y: 84 } },
]

const aspectClasses: Record<AspectRatio, string> = { '9:16': 'aspect-[9/16] max-h-[72vh]', '1:1': 'aspect-square max-h-[72vh]', '16:9': 'aspect-video' }
const canvasSizes: Record<AspectRatio, { width: number; height: number }> = { '9:16': { width: 720, height: 1280 }, '1:1': { width: 1080, height: 1080 }, '16:9': { width: 1280, height: 720 } }

function activeCue(cues: CaptionCue[], time: number) { return cues.find((cue) => time >= cue.start && time <= cue.end) || null }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)) }
function formatTime(seconds: number) { const safe = Math.max(0, Number(seconds) || 0); const mins = Math.floor(safe / 60); const secs = Math.floor(safe % 60); const tenths = Math.floor((safe - Math.floor(safe)) * 10); return `${mins}:${String(secs).padStart(2, '0')}.${tenths}` }

function wrapCaption(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (ctx.measureText(next).width <= maxWidth || !current) current = next
    else { lines.push(current); current = word }
  }
  if (current) lines.push(current)
  return lines.slice(0, 4)
}

function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const safeRadius = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + safeRadius, y)
  ctx.lineTo(x + width - safeRadius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius)
  ctx.lineTo(x + width, y + height - safeRadius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height)
  ctx.lineTo(x + safeRadius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius)
  ctx.lineTo(x, y + safeRadius)
  ctx.quadraticCurveTo(x, y, x + safeRadius, y)
  ctx.closePath()
}

function QuotaStatusBar({ quota }: { quota: VideoQuota }) {
  const pct = Math.min(100, Math.round((quota.usedMinutes / Math.max(1, quota.includedMinutes)) * 100))
  return <div className="rounded-2xl border border-white/10 bg-white/[.04] p-4">
    <div className="flex items-center justify-between text-sm"><span>Quota</span><span>{quota.usedMinutes}/{quota.includedMinutes} min</span></div>
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-[#FFD700]" style={{ width: `${pct}%` }} /></div>
    <p className="mt-2 text-xs text-white/55">Exports use queued FFmpeg workers so long renders never block the web request.</p>
    {quota.demoOnly ? <p className="mt-2 text-sm text-amber-200">Free/demo users get preview playback only. Upgrade to export final videos.</p> : null}
  </div>
}

function BillingBanner({ quota }: { quota: VideoQuota }) {
  if (!quota.requiresOverageCharge) return null
  return <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">Overage detected: {quota.overageMinutes} extra minute(s) at ${quota.overageRateUsd.toFixed(2)}/min. SignalBoost will create a {quota.overageProvider} billing session before rendering.</div>
}

function PresetPicker({ activePreset, onPreset }: { activePreset: string; onPreset: (preset: CaptionPreset) => void }) {
  return <section className="rounded-3xl border border-white/10 bg-black/40 p-5">
    <div className="flex items-center justify-between"><h2 className="text-xl font-bold">Templates</h2><span className="text-xs text-white/50">Canva-style starting points</span></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {captionPresets.map((preset) => <button key={preset.id} type="button" onClick={() => onPreset(preset)} className={`rounded-2xl border p-4 text-left transition ${activePreset === preset.id ? 'border-[#FFD700] bg-[#FFD700]/10' : 'border-white/10 bg-white/[.03] hover:border-white/25'}`}>
        <span className="font-bold">{preset.label}</span>
        <span className="mt-1 block text-xs text-white/55">{preset.description}</span>
      </button>)}
    </div>
  </section>
}

function CaptionTimeline({ cues, currentTime, selectedCueId, onSeek, onSelect, onUpdateText }: { cues: CaptionCue[]; currentTime: number; selectedCueId: string | null; onSeek: (seconds: number) => void; onSelect: (id: string) => void; onUpdateText: (id: string, text: string) => void }) {
  const selectedCue = cues.find((cue) => cue.id === selectedCueId) || activeCue(cues, currentTime) || cues[0]
  return <section className="rounded-3xl border border-white/10 bg-black/40 p-5">
    <div className="flex items-center justify-between"><h2 className="text-xl font-bold">Caption timeline</h2><span className="text-xs text-white/50">{cues.length} cues</span></div>
    {selectedCue ? <label className="mt-4 block text-sm">Edit selected caption<textarea className="mt-2 min-h-24 w-full rounded-2xl border border-white/10 bg-white/10 p-3" value={selectedCue.text} onChange={(e) => onUpdateText(selectedCue.id, e.target.value)} /><span className="mt-1 block font-mono text-xs text-[#FFD700]">{formatTime(selectedCue.start)} → {formatTime(selectedCue.end)}</span></label> : null}
    <div className="mt-4 max-h-72 space-y-2 overflow-auto">
      {cues.length === 0 ? <p className="rounded-2xl border border-dashed border-white/15 p-4 text-sm text-white/55">Generate AI captions or upload SRT/VTT captions to populate the timeline.</p> : null}
      {cues.map((cue) => <button key={cue.id} type="button" onClick={() => { onSelect(cue.id); onSeek(cue.start) }} className={`w-full rounded-2xl border p-3 text-left text-sm transition ${selectedCue?.id === cue.id || (currentTime >= cue.start && currentTime <= cue.end) ? 'border-[#FFD700] bg-[#FFD700]/10' : 'border-white/10 bg-white/[.03] hover:border-white/25'}`}><span className="font-mono text-xs text-[#FFD700]">{formatTime(cue.start)} → {formatTime(cue.end)}</span><br />{cue.text}</button>)}
    </div>
  </section>
}

function StyleControls({ style, aspectRatio, onChange, onAspectRatio }: { style: CaptionStyle; aspectRatio: AspectRatio; onChange: (style: CaptionStyle) => void; onAspectRatio: (ratio: AspectRatio) => void }) {
  return <section className="rounded-3xl border border-white/10 bg-black/40 p-5">
    <div className="flex items-center justify-between"><h2 className="text-xl font-bold">Caption style</h2><span className="text-xs text-white/50">x {style.x}% · y {style.y}%</span></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Format<select className="mt-1 w-full rounded-xl border border-white/10 bg-black p-2" value={aspectRatio} onChange={(e) => onAspectRatio(e.target.value as AspectRatio)}><option value="9:16">9:16 Shorts/Reels/TikTok</option><option value="1:1">1:1 Square</option><option value="16:9">16:9 YouTube</option></select></label>
      <label className="text-sm">Font family<input className="mt-1 w-full rounded-xl border border-white/10 bg-white/10 p-2" value={style.fontFamily} onChange={(e) => onChange({ ...style, fontFamily: e.target.value })} /></label>
      <label className="text-sm">Size: {style.fontSize}px<input type="range" min="18" max="84" value={style.fontSize} onChange={(e) => onChange({ ...style, fontSize: Number(e.target.value) })} className="mt-3 w-full" /></label>
      <label className="text-sm">Text color<input type="color" value={style.color} onChange={(e) => onChange({ ...style, color: e.target.value })} className="mt-1 block h-10 w-full rounded-xl" /></label>
      <label className="text-sm">Animation<select className="mt-1 w-full rounded-xl border border-white/10 bg-black p-2" value={style.animation} onChange={(e) => onChange({ ...style, animation: e.target.value as CaptionStyle['animation'] })}><option value="none">None</option><option value="fade">Fade</option><option value="slide">Slide</option><option value="pop">Pop</option></select></label>
      <label className="text-sm">Background<input className="mt-1 w-full rounded-xl border border-white/10 bg-white/10 p-2" value={style.backgroundColor} onChange={(e) => onChange({ ...style, backgroundColor: e.target.value })} /></label>
    </div>
  </section>
}

function CanvasEditor({ videoUrl, cues, style, aspectRatio, seekTime, durationSec, onStyleChange, onTime, onDuration }: { videoUrl: string | null; cues: CaptionCue[]; style: CaptionStyle; aspectRatio: AspectRatio; seekTime: number; durationSec: number; onStyleChange: (style: CaptionStyle) => void; onTime: (time: number) => void; onDuration: (seconds: number) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [time, setTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [dragging, setDragging] = useState(false)
  const cue = activeCue(cues, time)
  const size = canvasSizes[aspectRatio]

  useEffect(() => {
    if (videoRef.current && Math.abs(videoRef.current.currentTime - seekTime) > 0.08) {
      videoRef.current.currentTime = seekTime
      setTime(seekTime)
    }
  }, [seekTime])

  useEffect(() => {
    let frame = 0
    const draw = () => {
      const canvas = canvasRef.current
      const video = videoRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          ctx.fillStyle = '#05070b'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          if (video && video.readyState >= 2) {
            const videoRatio = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9
            const canvasRatio = canvas.width / canvas.height
            let drawWidth = canvas.width; let drawHeight = canvas.height; let x = 0; let y = 0
            if (videoRatio > canvasRatio) { drawHeight = canvas.height; drawWidth = drawHeight * videoRatio; x = (canvas.width - drawWidth) / 2 }
            else { drawWidth = canvas.width; drawHeight = drawWidth / videoRatio; y = (canvas.height - drawHeight) / 2 }
            ctx.drawImage(video, x, y, drawWidth, drawHeight)
          } else {
            ctx.fillStyle = 'rgba(255,255,255,.08)'
            drawRoundRect(ctx, canvas.width * 0.12, canvas.height * 0.42, canvas.width * 0.76, canvas.height * 0.16, 28)
            ctx.fill()
            ctx.fillStyle = 'rgba(255,255,255,.68)'
            ctx.font = `700 ${Math.max(22, canvas.width * 0.035)}px Inter, Arial, sans-serif`
            ctx.textAlign = 'center'
            ctx.fillText('Upload a source video to start editing', canvas.width / 2, canvas.height / 2)
          }
          if (cue) {
            const animationOffset = style.animation === 'slide' ? Math.max(0, 1 - ((time - cue.start) / 0.2)) * (canvas.height * 0.05) : 0
            const scale = style.animation === 'pop' ? 1 + Math.max(0, 1 - ((time - cue.start) / 0.18)) * 0.08 : 1
            const fontSize = style.fontSize * scale * (canvas.width / 1280)
            ctx.save()
            ctx.globalAlpha = style.animation === 'fade' ? clamp(Math.min(time - cue.start, cue.end - time) / 0.18, 0.25, 1) : 1
            ctx.font = `800 ${fontSize}px ${style.fontFamily}`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            const x = canvas.width * style.x / 100
            const y = (canvas.height * style.y / 100) + animationOffset
            const lines = wrapCaption(ctx, cue.text, canvas.width * 0.82)
            const lineHeight = fontSize * 1.18
            const textWidth = Math.max(...lines.map((line) => ctx.measureText(line).width), fontSize * 2)
            const boxWidth = Math.min(canvas.width - 48, textWidth + 48)
            const boxHeight = (lines.length * lineHeight) + 34
            ctx.fillStyle = style.backgroundColor
            drawRoundRect(ctx, x - boxWidth / 2, y - boxHeight / 2, boxWidth, boxHeight, 22)
            ctx.fill()
            ctx.fillStyle = style.color
            lines.forEach((line, index) => ctx.fillText(line, x, y + ((index - (lines.length - 1) / 2) * lineHeight)))
            ctx.restore()
          }
        }
      }
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [cue, style, time, aspectRatio])

  const setPosition = useCallback((event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    onStyleChange({ ...style, x: Math.round(clamp(((event.clientX - rect.left) / rect.width) * 100, 8, 92)), y: Math.round(clamp(((event.clientY - rect.top) / rect.height) * 100, 8, 92)) })
  }, [onStyleChange, style])

  const seek = (seconds: number) => {
    const next = clamp(seconds, 0, Math.max(0, durationSec || videoRef.current?.duration || 0))
    if (videoRef.current) videoRef.current.currentTime = next
    setTime(next)
    onTime(next)
  }

  return <section className="rounded-3xl border border-white/10 bg-black/50 p-5">
    <div className="flex items-center justify-between"><h2 className="text-xl font-bold">Canvas editor</h2><span className="font-mono text-xs text-white/50">{formatTime(time)} · {aspectRatio}</span></div>
    <div className={`relative mx-auto mt-4 w-full overflow-hidden rounded-2xl bg-black ring-1 ring-white/10 ${aspectClasses[aspectRatio]}`}>
      {videoUrl ? <video ref={videoRef} src={videoUrl} className="hidden" playsInline crossOrigin="anonymous" onLoadedMetadata={(e) => onDuration(Math.round(e.currentTarget.duration || 0))} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onTimeUpdate={(e) => { const next = e.currentTarget.currentTime; setTime(next); onTime(next) }} /> : null}
      <canvas ref={canvasRef} width={size.width} height={size.height} onPointerDown={(e) => { setDragging(true); e.currentTarget.setPointerCapture(e.pointerId); setPosition(e) }} onPointerMove={(e) => dragging && setPosition(e)} onPointerUp={(e) => { setDragging(false); e.currentTarget.releasePointerCapture(e.pointerId) }} className="h-full w-full cursor-move touch-none" aria-label="Video canvas with draggable caption overlay" />
    </div>
    <div className="mt-4 space-y-3"><input type="range" min="0" max={Math.max(1, durationSec)} step="0.05" value={Math.min(time, Math.max(1, durationSec))} disabled={!videoUrl} onChange={(e) => seek(Number(e.target.value))} className="w-full" />
      <div className="flex flex-wrap gap-3"><button className="rounded-full bg-[#FFD700] px-5 py-2 font-bold text-black disabled:opacity-50" disabled={!videoUrl} onClick={() => videoRef.current?.play()}>{isPlaying ? 'Playing' : 'Play'}</button><button className="rounded-full border border-white/20 px-5 py-2 disabled:opacity-50" disabled={!videoUrl} onClick={() => videoRef.current?.pause()}>Pause</button><button className="rounded-full border border-white/20 px-5 py-2 disabled:opacity-50" disabled={!videoUrl} onClick={() => seek(time - 0.1)}>− frame</button><button className="rounded-full border border-white/20 px-5 py-2 disabled:opacity-50" disabled={!videoUrl} onClick={() => seek(time + 0.1)}>+ frame</button><button className="rounded-full border border-white/20 px-5 py-2 disabled:opacity-50" disabled={!videoUrl} onClick={() => seek(0)}>Restart</button></div>
    </div>
  </section>
}

function ExportPanel({ canExport, hasSource, job, onExport, onRefresh }: { canExport: boolean; hasSource: boolean; job: JobState | null; onExport: () => void; onRefresh: () => void }) {
  return <section className="rounded-3xl border border-white/10 bg-black/40 p-5"><h2 className="text-xl font-bold">Export panel</h2><p className="mt-2 text-sm text-white/55">Renders are queued for the video worker, burned in with FFmpeg ASS subtitles, and stored as downloadable MP4s.</p><button onClick={onExport} className="mt-4 w-full rounded-full bg-[#FFD700] px-5 py-3 font-bold text-black disabled:opacity-50" disabled={!canExport || !hasSource}>Export burned-caption MP4</button>{job ? <div className="mt-4 rounded-2xl bg-white/[.04] p-4 text-sm"><p className="break-all">Job: {job.jobId}</p><p>Status: {job.status}</p>{job.error ? <p className="text-red-300">{job.error}</p> : null}<button onClick={onRefresh} className="mt-3 rounded-full border border-white/20 px-4 py-2 disabled:opacity-50" disabled={job.jobId === 'blocked'}>Refresh</button>{job.result_url ? <a className="ml-3 text-[#FFD700]" href={job.result_url} download>Download MP4</a> : null}</div> : null}</section>
}

export default function VideoEditor() {
  const { t } = useTranslation()
  const [locale, setLocale] = useState<SupportedVideoLocale>('en')
  const [tier, setTier] = useState('free')
  const [usedMinutes, setUsedMinutes] = useState(0)
  const [durationSec, setDurationSec] = useState(0)
  const [sourceVideoFile, setSourceVideoFile] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [filename, setFilename] = useState('source-video.mp4')
  const [cues, setCues] = useState(starterCaptions)
  const [style, setStyle] = useState(defaultCaptionStyle)
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16')
  const [activePreset, setActivePreset] = useState('signal')
  const [selectedCueId, setSelectedCueId] = useState<string | null>(starterCaptions[0]?.id || null)
  const [currentTime, setCurrentTime] = useState(0)
  const [job, setJob] = useState<JobState | null>(null)
  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle', message: 'Upload a source video to begin.' })
  const [captionState, setCaptionState] = useState<CaptionGenerationState>({ status: 'idle', message: 'Generate AI captions after uploading a video, or upload SRT/VTT captions manually.' })
  const quota = useMemo(() => calculateVideoQuota(tier, usedMinutes + Math.ceil(Math.max(1, durationSec) / 60)), [tier, usedMinutes, durationSec])

  async function uploadVideo(file: File) {
    setSourceVideoFile(file)
    setUploadState({ status: 'uploading', message: `Uploading ${file.name}…` })
    setCaptionState({ status: 'idle', message: 'Video selected. Click Generate Captions to create synced AI captions.' })
    const form = new FormData()
    form.set('video', file)
    form.set('tier', tier)
    form.set('durationSec', String(durationSec))
    form.set('usedMinutes', String(usedMinutes))
    form.set('locale', locale)
    const res = await fetch('/api/video/upload', { method: 'POST', body: form })
    const json = await res.json()
    if (json.ok) { setVideoUrl(json.data.publicUrl); setFilename(json.data.filename); setUploadState({ status: 'ready', message: `${json.data.filename} is stored and ready for canvas editing.` }) }
    else setUploadState({ status: 'failed', message: json.error || 'Upload failed.' })
  }

  async function generateCaptions() {
    if (!sourceVideoFile) {
      setCaptionState({ status: 'failed', message: 'Upload a video before generating captions.' })
      return
    }
    setCaptionState({ status: 'generating', message: 'Generating synced AI captions…' })
    const form = new FormData()
    form.set('video', sourceVideoFile)
    form.set('filename', filename)
    form.set('locale', locale)
    form.set('tier', tier)
    form.set('durationSec', String(durationSec))
    form.set('usedMinutes', String(usedMinutes))
    const res = await fetch('/api/video/transcribe', { method: 'POST', body: form })
    const json = await res.json()
    if (json.ok) {
      setCues(json.data.cues)
      setSelectedCueId(json.data.cues[0]?.id || null)
      setCurrentTime(json.data.cues[0]?.start || 0)
      setCaptionState({ status: 'ready', message: `${json.data.cueCount} AI captions generated${json.data.demoLimited ? ' for demo preview' : ''}.` })
    } else {
      setCaptionState({ status: 'failed', message: json.error || 'Caption generation failed.' })
    }
  }

  async function uploadCaptions(file: File) {
    const form = new FormData()
    form.set('captions', file)
    const res = await fetch(`/api/video/captions?locale=${locale}`, { method: 'POST', body: form })
    const json = await res.json()
    if (json.ok) { setCues(json.data.cues); setSelectedCueId(json.data.cues[0]?.id || null); setCurrentTime(json.data.cues[0]?.start || 0); setCaptionState({ status: 'ready', message: `${json.data.cueCount} captions imported from ${file.name}.` }) }
    else setCaptionState({ status: 'failed', message: json.error || 'Caption upload failed.' })
  }

  async function exportVideo() {
    if (!videoUrl) return
    const res = await fetch('/api/video/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceUrl: videoUrl, filename, durationSec: Math.max(1, durationSec), captions: cues, style, locale, tier, usedMinutes }) })
    const json = await res.json()
    if (json.ok) setJob({ jobId: json.data.jobId, status: json.data.status })
    else setJob({ jobId: 'blocked', status: 'failed', error: json.error })
  }

  async function refreshJob() {
    if (!job || job.jobId === 'blocked') return
    const res = await fetch(`/api/video/jobs/${job.jobId}`)
    const json = await res.json()
    if (json.ok) setJob({ jobId: job.jobId, status: json.data.status, result_url: json.data.result_url, error: json.data.error })
  }

  useEffect(() => {
    if (!job || job.jobId === 'blocked' || ['completed', 'failed'].includes(job.status)) return
    const timer = window.setInterval(refreshJob, 4000)
    return () => window.clearInterval(timer)
  }, [job?.jobId, job?.status])

  const updateCueText = (id: string, text: string) => setCues((items) => items.map((cue) => cue.id === id ? { ...cue, text } : cue))

  return <main className="min-h-screen bg-[#05070b] p-6 text-white">
    <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,215,0,.20),transparent_35%),linear-gradient(135deg,#101827,#05070b)] p-8"><p className="text-xs uppercase tracking-[0.35em] text-[#FFD700]">{t('video.kicker','Video Studio')}</p><h1 className="mt-4 text-4xl font-black">{t('video.title','AI caption video editor')}</h1><p className="mt-3 max-w-3xl text-white/70">{t('video.subtitle','Upload video, generate synced AI captions, choose a social template, drag styled overlays on canvas, and export MP4 files.')}</p></section>
    <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_.35fr]"><QuotaStatusBar quota={quota} /><BillingBanner quota={quota} /></div>
    <section className="mt-6 grid gap-4 rounded-3xl border border-white/10 bg-white/[.03] p-5 md:grid-cols-5"><label className="text-sm">Video<input type="file" accept="video/*" onChange={(e) => e.target.files?.[0] && uploadVideo(e.target.files[0])} className="mt-2 w-full" /></label><div className="text-sm"><span>AI captions</span><button type="button" onClick={generateCaptions} disabled={!sourceVideoFile || captionState.status === 'generating'} className="mt-2 w-full rounded-xl bg-[#FFD700] px-4 py-2 font-bold text-black disabled:opacity-50">{captionState.status === 'generating' ? 'Generating…' : 'Generate Captions'}</button></div><label className="text-sm">Optional SRT/VTT<input type="file" accept=".srt,.vtt,text/vtt" onChange={(e) => e.target.files?.[0] && uploadCaptions(e.target.files[0])} className="mt-2 w-full" /></label><label className="text-sm">Tier<select className="mt-2 w-full rounded-xl bg-black p-2" value={tier} onChange={(e) => setTier(e.target.value)}><option value="free">Free/demo</option><option value="launch">Launch</option><option value="growth">Growth</option><option value="command">Command</option></select></label><label className="text-sm">Locale<select className="mt-2 w-full rounded-xl bg-black p-2" value={locale} onChange={(e) => setLocale(e.target.value as SupportedVideoLocale)}><option>en</option><option>es</option><option>pt</option><option>pl</option><option>ru</option></select></label><p className="text-xs text-white/55 md:col-span-5">Storage: {uploadState.message}<br />Captions: {captionState.message}</p></section>
    <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_.42fr]"><div className="space-y-6"><CanvasEditor videoUrl={videoUrl} cues={cues} style={style} aspectRatio={aspectRatio} seekTime={currentTime} durationSec={durationSec} onStyleChange={setStyle} onTime={setCurrentTime} onDuration={setDurationSec} /><StyleControls style={style} aspectRatio={aspectRatio} onChange={setStyle} onAspectRatio={setAspectRatio} /><PresetPicker activePreset={activePreset} onPreset={(preset) => { setActivePreset(preset.id); setStyle(preset.style) }} /></div><div className="space-y-6"><CaptionTimeline cues={cues} currentTime={currentTime} selectedCueId={selectedCueId} onSeek={setCurrentTime} onSelect={setSelectedCueId} onUpdateText={updateCueText} /><ExportPanel canExport={quota.exportEnabled} hasSource={Boolean(videoUrl)} job={job} onExport={exportVideo} onRefresh={refreshJob} /></div></div>
    <footer className="mt-8 rounded-2xl border border-white/10 bg-white/[.03] p-4 text-sm text-white/60">Sync health: canvas time {currentTime.toFixed(2)}s · duration {durationSec || 0}s · {cues.length} captions · queue-backed exports require <code>npm run worker:video</code>.</footer>
  </main>
}
