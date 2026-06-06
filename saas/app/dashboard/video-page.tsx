'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { defaultCaptionStyle, type CaptionCue, type CaptionStyle, type SupportedVideoLocale, type VideoQuota } from '@/lib/video/types'
import { calculateVideoQuota } from '@/lib/video/subscription'
import { useTranslation } from '@/lib/i18n/useTranslation'

// ── Types ──────────────────────────────────────────────────────────────────────
type ExportState = { status: 'idle' | 'recording' | 'ready' | 'failed'; message: string; url?: string }
type UploadState = { status: 'idle' | 'uploading' | 'ready' | 'failed'; message: string }
type CaptionGenerationState = { status: 'idle' | 'generating' | 'ready' | 'failed'; message: string }
type AspectRatio = '9:16' | '1:1' | '16:9'
type CaptionPreset = { id: string; label: string; description: string; style: CaptionStyle }
type CanvasEditorHandle = { startExport: () => Promise<string> }
type CanvasEditorProps = {
  videoUrl: string | null; cues: CaptionCue[]; style: CaptionStyle; aspectRatio: AspectRatio
  seekTime: number; durationSec: number; onStyleChange: (s: CaptionStyle) => void
  onTime: (t: number) => void; onDuration: (s: number) => void
}

// ── Constants ──────────────────────────────────────────────────────────────────
const starterCaptions: CaptionCue[] = [
  { id: 'cue-1', start: 0, end: 2.8, text: 'Upload a video, then click Generate Captions to create synced AI captions.' },
  { id: 'cue-2', start: 3, end: 6, text: 'Drag the caption on the canvas, style it, then export your video.' },
]
const captionPresets: CaptionPreset[] = [
  { id: 'signal', label: 'SignalBoost', description: 'Gold business captions.', style: defaultCaptionStyle },
  { id: 'tiktok', label: 'TikTok bold', description: 'Large white pop captions.', style: { ...defaultCaptionStyle, fontFamily: 'Arial Black, Inter, sans-serif', fontSize: 48, color: '#ffffff', backgroundColor: 'rgba(0,0,0,0.72)', animation: 'pop', x: 50, y: 76 } },
  { id: 'hormozi', label: 'Hormozi', description: 'High-contrast yellow captions.', style: { ...defaultCaptionStyle, fontFamily: 'Impact, Inter, sans-serif', fontSize: 52, color: '#FFD700', backgroundColor: 'rgba(0,0,0,0.86)', animation: 'pop', x: 50, y: 70 } },
  { id: 'minimal', label: 'Minimal', description: 'Clean lower-third captions.', style: { ...defaultCaptionStyle, fontFamily: 'Inter, Arial, sans-serif', fontSize: 32, color: '#ffffff', backgroundColor: 'rgba(15,23,42,0.52)', animation: 'fade', x: 50, y: 84 } },
]
const aspectClasses: Record<AspectRatio, string> = { '9:16': 'aspect-[9/16] max-h-[72vh]', '1:1': 'aspect-square max-h-[72vh]', '16:9': 'aspect-video' }
const canvasSizes: Record<AspectRatio, { width: number; height: number }> = { '9:16': { width: 720, height: 1280 }, '1:1': { width: 1080, height: 1080 }, '16:9': { width: 1280, height: 720 } }

// ── Helpers ────────────────────────────────────────────────────────────────────
function activeCue(cues: CaptionCue[], time: number) { return cues.find((c) => time >= c.start && time <= c.end) || null }
function clamp(v: number, min: number, max: number) { return Math.min(max, Math.max(min, v)) }
function formatTime(s: number) { const safe = Math.max(0, Number(s) || 0); const m = Math.floor(safe / 60); const sec = Math.floor(safe % 60); const t = Math.floor((safe - Math.floor(safe)) * 10); return `${m}:${String(sec).padStart(2, '0')}.${t}` }

function wrapCaption(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(/\s+/).filter(Boolean); const lines: string[] = []; let cur = ''
  for (const w of words) { const next = cur ? `${cur} ${w}` : w; if (ctx.measureText(next).width <= maxWidth || !cur) cur = next; else { lines.push(cur); cur = w } }
  if (cur) lines.push(cur)
  return lines.slice(0, 4)
}

function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const sr = Math.min(r, w / 2, h / 2)
  ctx.beginPath(); ctx.moveTo(x + sr, y); ctx.lineTo(x + w - sr, y); ctx.quadraticCurveTo(x + w, y, x + w, y + sr)
  ctx.lineTo(x + w, y + h - sr); ctx.quadraticCurveTo(x + w, y + h, x + w - sr, y + h)
  ctx.lineTo(x + sr, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - sr)
  ctx.lineTo(x, y + sr); ctx.quadraticCurveTo(x, y, x + sr, y); ctx.closePath()
}

/** Parse SRT or VTT caption files entirely in the browser — no server call needed. */
function parseCaptionFile(text: string): CaptionCue[] {
  const parseTime = (s: string) => { const t = s.trim().replace(',', '.'); const p = t.split(':'); return p.length === 3 ? +p[0] * 3600 + +p[1] * 60 + +p[2] : 0 }
  const body = text.replace(/^WEBVTT[^\n]*\n?/, '').trim()
  const cues: CaptionCue[] = []
  for (const block of body.split(/\n{2,}/)) {
    const lines = block.trim().split('\n')
    const ti = lines.findIndex(l => l.includes('-->'))
    if (ti < 0) continue
    const [a, b] = lines[ti].split('-->')
    const txt = lines.slice(ti + 1).join(' ').replace(/<[^>]+>/g, '').trim()
    if (!txt) continue
    cues.push({ id: `cue-${cues.length + 1}`, start: parseTime(a), end: parseTime(b), text: txt })
  }
  return cues
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function QuotaStatusBar({ quota }: { quota: VideoQuota }) {
  const pct = Math.min(100, Math.round((quota.usedMinutes / Math.max(1, quota.includedMinutes)) * 100))
  return <div className="rounded-2xl border border-white/10 bg-white/[.04] p-4">
    <div className="flex items-center justify-between text-sm"><span>Quota</span><span>{quota.usedMinutes}/{quota.includedMinutes} min</span></div>
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-[#FFD700]" style={{ width: `${pct}%` }} /></div>
    <p className="mt-2 text-xs text-white/55">Exports record live in your browser — no server required. Export time equals video duration.</p>
    {quota.demoOnly ? <p className="mt-2 text-sm text-amber-200">Free/demo users get preview playback only. Upgrade to export final videos.</p> : null}
  </div>
}

function BillingBanner({ quota }: { quota: VideoQuota }) {
  if (!quota.requiresOverageCharge) return null
  return <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">Overage: {quota.overageMinutes} extra minute(s) at ${quota.overageRateUsd.toFixed(2)}/min. SignalBoost will open a {quota.overageProvider} billing session before rendering.</div>
}

function PresetPicker({ activePreset, onPreset }: { activePreset: string; onPreset: (p: CaptionPreset) => void }) {
  return <section className="rounded-3xl border border-white/10 bg-black/40 p-5">
    <div className="flex items-center justify-between"><h2 className="text-xl font-bold">Templates</h2><span className="text-xs text-white/50">Canva-style starting points</span></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {captionPresets.map((p) => <button key={p.id} type="button" onClick={() => onPreset(p)} className={`rounded-2xl border p-4 text-left transition ${activePreset === p.id ? 'border-[#FFD700] bg-[#FFD700]/10' : 'border-white/10 bg-white/[.03] hover:border-white/25'}`}>
        <span className="font-bold">{p.label}</span><span className="mt-1 block text-xs text-white/55">{p.description}</span>
      </button>)}
    </div>
  </section>
}

function CaptionTimeline({ cues, currentTime, selectedCueId, onSeek, onSelect, onUpdateText }: { cues: CaptionCue[]; currentTime: number; selectedCueId: string | null; onSeek: (s: number) => void; onSelect: (id: string) => void; onUpdateText: (id: string, text: string) => void }) {
  const sel = cues.find((c) => c.id === selectedCueId) || activeCue(cues, currentTime) || cues[0]
  return <section className="rounded-3xl border border-white/10 bg-black/40 p-5">
    <div className="flex items-center justify-between"><h2 className="text-xl font-bold">Caption timeline</h2><span className="text-xs text-white/50">{cues.length} cues</span></div>
    {sel ? <label className="mt-4 block text-sm">Edit selected caption<textarea className="mt-2 min-h-24 w-full rounded-2xl border border-white/10 bg-white/10 p-3" value={sel.text} onChange={(e) => onUpdateText(sel.id, e.target.value)} /><span className="mt-1 block font-mono text-xs text-[#FFD700]">{formatTime(sel.start)} → {formatTime(sel.end)}</span></label> : null}
    <div className="mt-4 max-h-72 space-y-2 overflow-auto">
      {cues.length === 0 ? <p className="rounded-2xl border border-dashed border-white/15 p-4 text-sm text-white/55">Generate AI captions or upload SRT/VTT to populate the timeline.</p> : null}
      {cues.map((c) => <button key={c.id} type="button" onClick={() => { onSelect(c.id); onSeek(c.start) }} className={`w-full rounded-2xl border p-3 text-left text-sm transition ${sel?.id === c.id || (currentTime >= c.start && currentTime <= c.end) ? 'border-[#FFD700] bg-[#FFD700]/10' : 'border-white/10 bg-white/[.03] hover:border-white/25'}`}><span className="font-mono text-xs text-[#FFD700]">{formatTime(c.start)} → {formatTime(c.end)}</span><br />{c.text}</button>)}
    </div>
  </section>
}

function StyleControls({ style, aspectRatio, onChange, onAspectRatio }: { style: CaptionStyle; aspectRatio: AspectRatio; onChange: (s: CaptionStyle) => void; onAspectRatio: (r: AspectRatio) => void }) {
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

const CanvasEditor = forwardRef<CanvasEditorHandle, CanvasEditorProps>(
  function CanvasEditor({ videoUrl, cues, style, aspectRatio, seekTime, durationSec, onStyleChange, onTime, onDuration }, ref) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [time, setTime] = useState(0)
    const [isPlaying, setIsPlaying] = useState(false)
    const [dragging, setDragging] = useState(false)
    const durationRef = useRef(durationSec)
    useEffect(() => { durationRef.current = durationSec }, [durationSec])
    const cue = activeCue(cues, time)
    const size = canvasSizes[aspectRatio]

    useEffect(() => {
      if (videoRef.current && Math.abs(videoRef.current.currentTime - seekTime) > 0.08) {
        videoRef.current.currentTime = seekTime; setTime(seekTime)
      }
    }, [seekTime])

    useEffect(() => {
      let frame = 0
      const draw = () => {
        const canvas = canvasRef.current; const video = videoRef.current
        if (canvas) {
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#05070b'; ctx.fillRect(0, 0, canvas.width, canvas.height)
            if (video && video.readyState >= 2) {
              const vr = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9
              const cr = canvas.width / canvas.height
              let dw = canvas.width; let dh = canvas.height; let ox = 0; let oy = 0
              if (vr > cr) { dh = canvas.height; dw = dh * vr; ox = (canvas.width - dw) / 2 } else { dw = canvas.width; dh = dw / vr; oy = (canvas.height - dh) / 2 }
              ctx.drawImage(video, ox, oy, dw, dh)
            } else {
              ctx.fillStyle = 'rgba(255,255,255,.08)'; drawRoundRect(ctx, canvas.width * 0.12, canvas.height * 0.42, canvas.width * 0.76, canvas.height * 0.16, 28); ctx.fill()
              ctx.fillStyle = 'rgba(255,255,255,.68)'; ctx.font = `700 ${Math.max(22, canvas.width * 0.035)}px Inter, Arial, sans-serif`; ctx.textAlign = 'center'
              ctx.fillText('Upload a source video to start editing', canvas.width / 2, canvas.height / 2)
            }
            if (cue) {
              const ao = style.animation === 'slide' ? Math.max(0, 1 - ((time - cue.start) / 0.2)) * (canvas.height * 0.05) : 0
              const sc = style.animation === 'pop' ? 1 + Math.max(0, 1 - ((time - cue.start) / 0.18)) * 0.08 : 1
              const fs = style.fontSize * sc * (canvas.width / 1280)
              ctx.save()
              ctx.globalAlpha = style.animation === 'fade' ? clamp(Math.min(time - cue.start, cue.end - time) / 0.18, 0.25, 1) : 1
              ctx.font = `800 ${fs}px ${style.fontFamily}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
              const cx = canvas.width * style.x / 100; const cy = (canvas.height * style.y / 100) + ao
              const lines = wrapCaption(ctx, cue.text, canvas.width * 0.82)
              const lh = fs * 1.18
              const tw = Math.max(...lines.map((l) => ctx.measureText(l).width), fs * 2)
              const bw = Math.min(canvas.width - 48, tw + 48); const bh = (lines.length * lh) + 34
              ctx.fillStyle = style.backgroundColor; drawRoundRect(ctx, cx - bw / 2, cy - bh / 2, bw, bh, 22); ctx.fill()
              ctx.fillStyle = style.color; lines.forEach((l, i) => ctx.fillText(l, cx, cy + ((i - (lines.length - 1) / 2) * lh)))
              ctx.restore()
            }
          }
        }
        frame = requestAnimationFrame(draw)
      }
      frame = requestAnimationFrame(draw)
      return () => cancelAnimationFrame(frame)
    }, [cue, style, time, aspectRatio])

    const setPos = useCallback((e: PointerEvent<HTMLCanvasElement>) => {
      const r = e.currentTarget.getBoundingClientRect()
      onStyleChange({ ...style, x: Math.round(clamp(((e.clientX - r.left) / r.width) * 100, 8, 92)), y: Math.round(clamp(((e.clientY - r.top) / r.height) * 100, 8, 92)) })
    }, [onStyleChange, style])

    const seek = (s: number) => {
      const next = clamp(s, 0, Math.max(0, durationSec || videoRef.current?.duration || 0))
      if (videoRef.current) videoRef.current.currentTime = next; setTime(next); onTime(next)
    }

    useImperativeHandle(ref, () => ({
      async startExport(): Promise<string> {
        const canvas = canvasRef.current; const video = videoRef.current
        if (!canvas || !video) throw new Error('Canvas or video not ready.')
        if (!('MediaRecorder' in window)) throw new Error('Video export requires Chrome, Edge, or Firefox. Safari is not yet supported.')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const canvasStream: MediaStream = (canvas as any).captureStream(30)
        const tracks = [...canvasStream.getVideoTracks()]
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const vStream: MediaStream = (video as any).captureStream()
          const at = vStream.getAudioTracks(); if (at.length) tracks.push(at[0])
        } catch {}
        const combined = new MediaStream(tracks)
        let mimeType = 'video/webm'
        try { if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) mimeType = 'video/webm;codecs=vp9,opus' } catch {}
        const recorder = new MediaRecorder(combined, { mimeType })
        const chunks: BlobPart[] = []
        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
        return new Promise<string>((resolve, reject) => {
          let timeout: ReturnType<typeof setTimeout> | null = null
          let started = false
          recorder.onstop = () => { if (timeout) clearTimeout(timeout); resolve(URL.createObjectURL(new Blob(chunks, { type: mimeType }))) }
          const begin = () => {
            if (started) return; started = true; video.onseeked = null
            recorder.start(100); video.play().catch(reject)
            video.onended = () => recorder.stop()
            timeout = setTimeout(() => { if (recorder.state === 'recording') recorder.stop() }, (Math.max(10, durationRef.current) + 30) * 1000)
          }
          video.onseeked = begin; video.currentTime = 0
          if (video.readyState >= 3 && video.currentTime <= 0.01) begin()
        })
      }
    }))

    return <section className="rounded-3xl border border-white/10 bg-black/50 p-5">
      <div className="flex items-center justify-between"><h2 className="text-xl font-bold">Canvas editor</h2><span className="font-mono text-xs text-white/50">{formatTime(time)} · {aspectRatio}</span></div>
      <div className={`relative mx-auto mt-4 w-full overflow-hidden rounded-2xl bg-black ring-1 ring-white/10 ${aspectClasses[aspectRatio]}`}>
        {videoUrl ? <video ref={videoRef} src={videoUrl} className="hidden" playsInline crossOrigin="anonymous" onLoadedMetadata={(e) => onDuration(Math.round(e.currentTarget.duration || 0))} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onTimeUpdate={(e) => { const n = e.currentTarget.currentTime; setTime(n); onTime(n) }} /> : null}
        <canvas ref={canvasRef} width={size.width} height={size.height} onPointerDown={(e) => { setDragging(true); e.currentTarget.setPointerCapture(e.pointerId); setPos(e) }} onPointerMove={(e) => dragging && setPos(e)} onPointerUp={(e) => { setDragging(false); e.currentTarget.releasePointerCapture(e.pointerId) }} className="h-full w-full cursor-move touch-none" aria-label="Video canvas with draggable caption overlay" />
      </div>
      <div className="mt-4 space-y-3">
        <input type="range" min="0" max={Math.max(1, durationSec)} step="0.05" value={Math.min(time, Math.max(1, durationSec))} disabled={!videoUrl} onChange={(e) => seek(Number(e.target.value))} className="w-full" />
        <div className="flex flex-wrap gap-3">
          <button className="rounded-full bg-[#FFD700] px-5 py-2 font-bold text-black disabled:opacity-50" disabled={!videoUrl} onClick={() => videoRef.current?.play()}>{isPlaying ? 'Playing' : 'Play'}</button>
          <button className="rounded-full border border-white/20 px-5 py-2 disabled:opacity-50" disabled={!videoUrl} onClick={() => videoRef.current?.pause()}>Pause</button>
          <button className="rounded-full border border-white/20 px-5 py-2 disabled:opacity-50" disabled={!videoUrl} onClick={() => seek(time - 0.1)}>− frame</button>
          <button className="rounded-full border border-white/20 px-5 py-2 disabled:opacity-50" disabled={!videoUrl} onClick={() => seek(time + 0.1)}>+ frame</button>
          <button className="rounded-full border border-white/20 px-5 py-2 disabled:opacity-50" disabled={!videoUrl} onClick={() => seek(0)}>Restart</button>
        </div>
      </div>
    </section>
  }
)
// ── Export Panel ───────────────────────────────────────────────────────────────
function ExportPanel({ canExport, hasSource, exportState, onExport }: { canExport: boolean; hasSource: boolean; exportState: ExportState; onExport: () => void }) {
  const isRecording = exportState.status === 'recording'
  const isDone = exportState.status === 'ready'
  return <section className="rounded-3xl border border-white/10 bg-black/40 p-5">
    <h2 className="text-xl font-bold">Export panel</h2>
    <p className="mt-2 text-sm text-white/55">Click export then let the video play all the way through. Your browser records the canvas with captions burned in and produces a downloadable .webm file. No server required.</p>
    <button onClick={onExport} disabled={!canExport || !hasSource || isRecording} className="mt-4 w-full rounded-full bg-[#FFD700] px-5 py-3 font-bold text-black disabled:opacity-50">
      {isRecording ? '● Recording — let video play through…' : 'Export captioned video'}
    </button>
    {exportState.message ? <p className={`mt-3 text-sm ${exportState.status === 'failed' ? 'text-red-300' : 'text-white/70'}`}>{exportState.message}</p> : null}
    {isDone && exportState.url ? <a href={exportState.url} download="captioned-video.webm" className="mt-3 block rounded-full border border-[#FFD700] px-5 py-2 text-center font-bold text-[#FFD700]">↓ Download captioned video (.webm)</a> : null}
    <p className="mt-3 text-xs text-white/40">.webm plays in Chrome, Edge, and Firefox. To convert to MP4, use HandBrake (free) or cloudconvert.com.</p>
  </section>
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function VideoEditor() {
  const { t } = useTranslation()
  const canvasEditorRef = useRef<CanvasEditorHandle>(null)

  const [locale, setLocale] = useState<SupportedVideoLocale>('en')
  const [tier, setTier] = useState('free')
  const [durationSec, setDurationSec] = useState(0)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [storagePath, setStoragePath] = useState<string | null>(null)
  const [transcriptId, setTranscriptId] = useState<string | null>(null)
  const [cues, setCues] = useState(starterCaptions)
  const [style, setStyle] = useState(defaultCaptionStyle)
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16')
  const [activePreset, setActivePreset] = useState('signal')
  const [selectedCueId, setSelectedCueId] = useState<string | null>(starterCaptions[0]?.id || null)
  const [currentTime, setCurrentTime] = useState(0)
  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle', message: 'Upload a source video to begin.' })
  const [captionState, setCaptionState] = useState<CaptionGenerationState>({ status: 'idle', message: 'Generate AI captions after uploading a video, or upload SRT/VTT manually.' })
  const [exportState, setExportState] = useState<ExportState>({ status: 'idle', message: '' })

  const quota = useMemo(() => calculateVideoQuota(tier, Math.ceil(Math.max(1, durationSec) / 60)), [tier, durationSec])

  // ── Poll AssemblyAI until transcription is complete ────────────────────────
  useEffect(() => {
    if (!transcriptId) return
    let cancelled = false
    const poll = async () => {
      if (cancelled) return
      try {
        const res = await fetch(`/api/video/transcribe?id=${encodeURIComponent(transcriptId)}`)
        const json = await res.json()
        if (!json.ok) {
          setCaptionState({ status: 'failed', message: json.error || 'Transcription failed.' }); setTranscriptId(null); return
        }
        const { status, cues: newCues, cueCount } = json.data
        if (status === 'completed' && newCues) {
          setCues(newCues); setSelectedCueId(newCues[0]?.id || null); setCurrentTime(newCues[0]?.start || 0)
          setCaptionState({ status: 'ready', message: `${cueCount} AI captions ready.` }); setTranscriptId(null)
        }
        // else still processing — keep polling
      } catch { /* network hiccup — keep polling */ }
    }
    const timer = setInterval(poll, 3000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [transcriptId])

  // ── Upload: get signed URL → PUT file directly to Supabase Storage ─────────
  async function uploadVideo(file: File) {
    setVideoUrl(URL.createObjectURL(file)) // local preview immediately, no wait
    setUploadState({ status: 'uploading', message: `Uploading ${file.name} to secure storage…` })
    setCaptionState({ status: 'idle', message: 'Video selected. Click Generate Captions after upload completes.' })
    try {
      const urlRes = await fetch('/api/video/upload-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file.name }) })
      const urlJson = await urlRes.json()
      if (!urlJson.ok) { setUploadState({ status: 'failed', message: urlJson.error || 'Could not get upload URL.' }); return }
      const { path, token } = urlJson.data
      // PUT directly to Supabase Storage — bypasses Vercel's 4.5 MB body limit entirely
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
      const putRes = await fetch(`${supabaseUrl}/storage/v1/object/upload/sign/video-uploads/${path}?token=${encodeURIComponent(token)}`, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'video/mp4' } })
      if (!putRes.ok) { setUploadState({ status: 'failed', message: `Storage upload failed (${putRes.status}). Check Supabase bucket permissions.` }); return }
      setStoragePath(path)
      setUploadState({ status: 'ready', message: `${file.name} stored — ready to generate captions.` })
    } catch (e) {
      setUploadState({ status: 'failed', message: e instanceof Error ? e.message : 'Upload failed.' })
    }
  }

  // ── Submit video to AssemblyAI for transcription ───────────────────────────
  async function generateCaptions() {
    if (!storagePath) { setCaptionState({ status: 'failed', message: 'Wait for the video upload to finish before generating captions.' }); return }
    setCaptionState({ status: 'generating', message: 'Submitting to AI transcription (30–90 seconds)…' })
    try {
      const res = await fetch('/api/video/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: storagePath }) })
      const json = await res.json()
      if (!json.ok) { setCaptionState({ status: 'failed', message: json.error || 'Caption generation failed.' }); return }
      setTranscriptId(json.data.transcriptId)
      setCaptionState({ status: 'generating', message: 'Transcribing… checking every 3 seconds.' })
    } catch (e) {
      setCaptionState({ status: 'failed', message: e instanceof Error ? e.message : 'Caption generation failed.' })
    }
  }

  // ── Import SRT / VTT captions entirely in-browser (no server call) ─────────
  async function uploadCaptions(file: File) {
    try {
      const newCues = parseCaptionFile(await file.text())
      if (!newCues.length) { setCaptionState({ status: 'failed', message: 'Could not parse captions — verify the file is valid SRT or VTT.' }); return }
      setCues(newCues); setSelectedCueId(newCues[0]?.id || null); setCurrentTime(newCues[0]?.start || 0)
      setCaptionState({ status: 'ready', message: `${newCues.length} captions imported from ${file.name}.` })
    } catch { setCaptionState({ status: 'failed', message: 'Could not read captions file.' }) }
  }

  // ── Export: MediaRecorder records the live canvas → downloadable .webm ─────
  async function exportVideo() {
    if (!canvasEditorRef.current) return
    setExportState({ status: 'recording', message: 'Recording — let the video play all the way through. Do not close this tab.' })
    try {
      const url = await canvasEditorRef.current.startExport()
      setExportState({ status: 'ready', message: 'Done! Captions are burned in. Download your video below.', url })
    } catch (e) {
      setExportState({ status: 'failed', message: e instanceof Error ? e.message : 'Export failed.' })
    }
  }

  const updateCueText = (id: string, text: string) => setCues((items) => items.map((c) => c.id === id ? { ...c, text } : c))

  return <main className="min-h-screen bg-[#05070b] p-6 text-white">
    <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,215,0,.20),transparent_35%),linear-gradient(135deg,#101827,#05070b)] p-8">
      <p className="text-xs uppercase tracking-[0.35em] text-[#FFD700]">{t('video.kicker', 'Video Studio')}</p>
      <h1 className="mt-4 text-4xl font-black">{t('video.title', 'AI caption video editor')}</h1>
      <p className="mt-3 max-w-3xl text-white/70">{t('video.subtitle', 'Upload a video, generate synced AI captions, drag styled overlays on canvas, and export a captioned video file.')}</p>
    </section>
    <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_.35fr]"><QuotaStatusBar quota={quota} /><BillingBanner quota={quota} /></div>
    <section className="mt-6 grid gap-4 rounded-3xl border border-white/10 bg-white/[.03] p-5 md:grid-cols-5">
      <label className="text-sm">Video<input type="file" accept="video/*" onChange={(e) => e.target.files?.[0] && uploadVideo(e.target.files[0])} className="mt-2 w-full" /></label>
      <div className="text-sm"><span>AI captions</span><button type="button" onClick={generateCaptions} disabled={!storagePath || captionState.status === 'generating'} className="mt-2 w-full rounded-xl bg-[#FFD700] px-4 py-2 font-bold text-black disabled:opacity-50">{captionState.status === 'generating' ? 'Transcribing…' : 'Generate Captions'}</button></div>
      <label className="text-sm">Optional SRT/VTT<input type="file" accept=".srt,.vtt,text/vtt" onChange={(e) => e.target.files?.[0] && uploadCaptions(e.target.files[0])} className="mt-2 w-full" /></label>
      <label className="text-sm">Tier<select className="mt-2 w-full rounded-xl bg-black p-2" value={tier} onChange={(e) => setTier(e.target.value)}><option value="free">Free/demo</option><option value="launch">Launch</option><option value="growth">Growth</option><option value="command">Command</option></select></label>
      <label className="text-sm">Locale<select className="mt-2 w-full rounded-xl bg-black p-2" value={locale} onChange={(e) => setLocale(e.target.value as SupportedVideoLocale)}><option>en</option><option>es</option><option>pt</option><option>pl</option><option>ru</option></select></label>
      <p className="text-xs text-white/55 md:col-span-5">Storage: {uploadState.message}<br />Captions: {captionState.message}</p>
    </section>
    <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_.42fr]">
      <div className="space-y-6">
        <CanvasEditor ref={canvasEditorRef} videoUrl={videoUrl} cues={cues} style={style} aspectRatio={aspectRatio} seekTime={currentTime} durationSec={durationSec} onStyleChange={setStyle} onTime={setCurrentTime} onDuration={setDurationSec} />
        <StyleControls style={style} aspectRatio={aspectRatio} onChange={setStyle} onAspectRatio={setAspectRatio} />
        <PresetPicker activePreset={activePreset} onPreset={(p) => { setActivePreset(p.id); setStyle(p.style) }} />
      </div>
      <div className="space-y-6">
        <CaptionTimeline cues={cues} currentTime={currentTime} selectedCueId={selectedCueId} onSeek={setCurrentTime} onSelect={setSelectedCueId} onUpdateText={updateCueText} />
        <ExportPanel canExport={quota.exportEnabled} hasSource={Boolean(videoUrl)} exportState={exportState} onExport={exportVideo} />
      </div>
    </div>
    <footer className="mt-8 rounded-2xl border border-white/10 bg-white/[.03] p-4 text-sm text-white/60">Canvas time {currentTime.toFixed(2)}s · duration {durationSec || 0}s · {cues.length} captions · exports record from canvas in real time.</footer>
  </main>
}
