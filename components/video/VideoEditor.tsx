'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { defaultCaptionStyle, type CaptionCue, type CaptionStyle, type SupportedVideoLocale, type VideoQuota } from '@/lib/video/types'
import { calculateVideoQuota } from '@/lib/video/subscription'
import { useTranslation } from '@/lib/i18n/useTranslation'

type JobState = { jobId: string; status: string; result_url?: string | null; error?: string | null }
const sampleCaptions: CaptionCue[] = [
  { id: 'cue-1', start: 0, end: 2.8, text: 'SignalBoost captions stay synced to playback.' },
  { id: 'cue-2', start: 3, end: 6, text: 'Drag this overlay and export burned-in subtitles.' },
]

function activeCue(cues: CaptionCue[], time: number) { return cues.find((cue) => time >= cue.start && time <= cue.end) || null }

function QuotaStatusBar({ quota }: { quota: VideoQuota }) {
  const pct = Math.min(100, Math.round((quota.usedMinutes / Math.max(1, quota.includedMinutes)) * 100))
  return <div className="rounded-2xl border border-white/10 bg-white/[.04] p-4">
    <div className="flex items-center justify-between text-sm"><span>Quota</span><span>{quota.usedMinutes}/{quota.includedMinutes} min</span></div>
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-[#FFD700]" style={{ width: `${pct}%` }} /></div>
    {quota.demoOnly ? <p className="mt-2 text-sm text-amber-200">Free/demo users get short preview playback only.</p> : null}
  </div>
}

function BillingBanner({ quota }: { quota: VideoQuota }) {
  if (!quota.requiresOverageCharge) return null
  return <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
    Overage detected: {quota.overageMinutes} extra minute(s) at ${quota.overageRateUsd.toFixed(2)}/min. SignalBoost will create a {quota.overageProvider} charge before rendering.
  </div>
}

function CaptionTimeline({ cues, currentTime, onSeek }: { cues: CaptionCue[]; currentTime: number; onSeek: (seconds: number) => void }) {
  return <section className="rounded-3xl border border-white/10 bg-black/40 p-5">
    <h2 className="text-xl font-bold">Caption timeline</h2>
    <div className="mt-4 max-h-72 space-y-2 overflow-auto">
      {cues.map((cue) => <button key={cue.id} type="button" onClick={() => onSeek(cue.start)} className={`w-full rounded-2xl border p-3 text-left text-sm ${currentTime >= cue.start && currentTime <= cue.end ? 'border-[#FFD700] bg-[#FFD700]/10' : 'border-white/10 bg-white/[.03]'}`}>
        <span className="font-mono text-xs text-[#FFD700]">{cue.start.toFixed(1)}s → {cue.end.toFixed(1)}s</span><br />{cue.text}
      </button>)}
    </div>
  </section>
}

function StyleControls({ style, onChange }: { style: CaptionStyle; onChange: (style: CaptionStyle) => void }) {
  return <section className="rounded-3xl border border-white/10 bg-black/40 p-5">
    <h2 className="text-xl font-bold">Style controls</h2>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Font<input className="mt-1 w-full rounded-xl bg-white/10 p-2" value={style.fontFamily} onChange={(e) => onChange({ ...style, fontFamily: e.target.value })} /></label>
      <label className="text-sm">Size<input type="range" min="18" max="72" value={style.fontSize} onChange={(e) => onChange({ ...style, fontSize: Number(e.target.value) })} className="mt-3 w-full" /></label>
      <label className="text-sm">Color<input type="color" value={style.color} onChange={(e) => onChange({ ...style, color: e.target.value })} className="mt-1 block h-10 w-full" /></label>
      <label className="text-sm">Animation<select className="mt-1 w-full rounded-xl bg-white/10 p-2" value={style.animation} onChange={(e) => onChange({ ...style, animation: e.target.value as CaptionStyle['animation'] })}><option value="none">None</option><option value="fade">Fade</option><option value="slide">Slide</option><option value="pop">Pop</option></select></label>
    </div>
  </section>
}

function CanvasEditor({ videoUrl, cues, style, seekTime, onStyleChange, onTime }: { videoUrl: string; cues: CaptionCue[]; style: CaptionStyle; seekTime: number; onStyleChange: (style: CaptionStyle) => void; onTime: (time: number) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [time, setTime] = useState(0)
  const [dragging, setDragging] = useState(false)
  const cue = activeCue(cues, time)

  useEffect(() => {
    if (videoRef.current && Math.abs(videoRef.current.currentTime - seekTime) > 0.25) {
      videoRef.current.currentTime = seekTime
      setTime(seekTime)
    }
  }, [seekTime])

  useEffect(() => {
    let frame = 0
    const draw = () => {
      const canvas = canvasRef.current
      const video = videoRef.current
      if (canvas && video) {
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          if (video.readyState >= 2) ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          if (cue) {
            ctx.font = `700 ${style.fontSize}px ${style.fontFamily}`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            const x = canvas.width * style.x / 100
            const y = canvas.height * style.y / 100
            const metrics = ctx.measureText(cue.text)
            const padding = 18
            ctx.fillStyle = style.backgroundColor
            ctx.roundRect(x - metrics.width / 2 - padding, y - style.fontSize, metrics.width + padding * 2, style.fontSize * 1.8, 18)
            ctx.fill()
            ctx.fillStyle = style.color
            ctx.fillText(cue.text, x, y)
          }
        }
      }
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [cue, style])

  function setPosition(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    onStyleChange({ ...style, x: Math.round(((event.clientX - rect.left) / rect.width) * 100), y: Math.round(((event.clientY - rect.top) / rect.height) * 100) })
  }

  return <section className="rounded-3xl border border-white/10 bg-black/50 p-5">
    <div className="relative aspect-video overflow-hidden rounded-2xl bg-black">
      <video ref={videoRef} src={videoUrl} className="hidden" crossOrigin="anonymous" onTimeUpdate={(e) => { const next = e.currentTarget.currentTime; setTime(next); onTime(next) }} />
      <canvas ref={canvasRef} width={1280} height={720} onPointerDown={(e) => { setDragging(true); setPosition(e) }} onPointerMove={(e) => dragging && setPosition(e)} onPointerUp={() => setDragging(false)} className="h-full w-full cursor-move" />
    </div>
    <div className="mt-4 flex gap-3"><button className="rounded-full bg-[#FFD700] px-5 py-2 font-bold text-black" onClick={() => videoRef.current?.play()}>Play</button><button className="rounded-full border border-white/20 px-5 py-2" onClick={() => videoRef.current?.pause()}>Pause</button></div>
  </section>
}

export default function VideoEditor() {
  const { t } = useTranslation()
  const [locale, setLocale] = useState<SupportedVideoLocale>('en')
  const [tier, setTier] = useState('free')
  const [usedMinutes, setUsedMinutes] = useState(0)
  const [durationSec, setDurationSec] = useState(30)
  const [videoUrl, setVideoUrl] = useState('/demo/sample.mp4')
  const [filename, setFilename] = useState('sample.mp4')
  const [cues, setCues] = useState(sampleCaptions)
  const [style, setStyle] = useState(defaultCaptionStyle)
  const [currentTime, setCurrentTime] = useState(0)
  const [job, setJob] = useState<JobState | null>(null)
  const quota = useMemo(() => calculateVideoQuota(tier, usedMinutes + Math.ceil(durationSec / 60)), [tier, usedMinutes, durationSec])

  async function uploadVideo(file: File) {
    const form = new FormData(); form.set('video', file); form.set('tier', tier); form.set('durationSec', String(durationSec)); form.set('usedMinutes', String(usedMinutes)); form.set('locale', locale)
    const res = await fetch('/api/video/upload', { method: 'POST', body: form }); const json = await res.json(); if (json.ok) { setVideoUrl(json.data.publicUrl); setFilename(json.data.filename) }
  }
  async function uploadCaptions(file: File) {
    const form = new FormData(); form.set('captions', file); const res = await fetch(`/api/video/captions?locale=${locale}`, { method: 'POST', body: form }); const json = await res.json(); if (json.ok) setCues(json.data.cues)
  }
  async function exportVideo() {
    const res = await fetch('/api/video/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceUrl: videoUrl, filename, durationSec, captions: cues, style, locale, tier, usedMinutes }) })
    const json = await res.json(); if (json.ok) setJob({ jobId: json.data.jobId, status: json.data.status }); else setJob({ jobId: 'blocked', status: 'failed', error: json.error })
  }
  async function refreshJob() { if (!job || job.jobId === 'blocked') return; const res = await fetch(`/api/video/jobs/${job.jobId}`); const json = await res.json(); if (json.ok) setJob({ jobId: job.jobId, status: json.data.status, result_url: json.data.result_url, error: json.data.error }) }

  return <main className="min-h-screen bg-[#05070b] p-6 text-white">
    <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,215,0,.20),transparent_35%),linear-gradient(135deg,#101827,#05070b)] p-8"><p className="text-xs uppercase tracking-[0.35em] text-[#FFD700]">{t('video.kicker','Video Studio')}</p><h1 className="mt-4 text-4xl font-black">{t('video.title','Canvas video editor + caption exporter')}</h1><p className="mt-3 max-w-3xl text-white/70">{t('video.subtitle','Upload video, sync SRT/VTT captions, drag styled overlays on canvas, and enqueue FFmpeg renders for downloadable MP4 files.')}</p></section>
    <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_.35fr]"><QuotaStatusBar quota={quota} /><BillingBanner quota={quota} /></div>
    <section className="mt-6 grid gap-4 rounded-3xl border border-white/10 bg-white/[.03] p-5 md:grid-cols-5"><label className="text-sm">Video<input type="file" accept="video/*" onChange={(e) => e.target.files?.[0] && uploadVideo(e.target.files[0])} className="mt-2 w-full" /></label><label className="text-sm">Captions<input type="file" accept=".srt,.vtt,text/vtt" onChange={(e) => e.target.files?.[0] && uploadCaptions(e.target.files[0])} className="mt-2 w-full" /></label><label className="text-sm">Tier<select className="mt-2 w-full rounded-xl bg-black p-2" value={tier} onChange={(e) => setTier(e.target.value)}><option value="free">Free/demo</option><option value="launch">Launch</option><option value="growth">Growth</option><option value="command">Command</option></select></label><label className="text-sm">Locale<select className="mt-2 w-full rounded-xl bg-black p-2" value={locale} onChange={(e) => setLocale(e.target.value as SupportedVideoLocale)}><option>en</option><option>es</option><option>pt</option><option>pl</option><option>ru</option></select></label><label className="text-sm">Used minutes<input type="number" className="mt-2 w-full rounded-xl bg-black p-2" value={usedMinutes} onChange={(e) => setUsedMinutes(Number(e.target.value))} /></label></section>
    <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_.42fr]"><div className="space-y-6"><CanvasEditor videoUrl={videoUrl} cues={cues} style={style} seekTime={currentTime} onStyleChange={setStyle} onTime={setCurrentTime} /><StyleControls style={style} onChange={setStyle} /></div><div className="space-y-6"><CaptionTimeline cues={cues} currentTime={currentTime} onSeek={setCurrentTime} /><section className="rounded-3xl border border-white/10 bg-black/40 p-5"><h2 className="text-xl font-bold">Export panel</h2><button onClick={exportVideo} className="mt-4 w-full rounded-full bg-[#FFD700] px-5 py-3 font-bold text-black disabled:opacity-50" disabled={!quota.exportEnabled}>Export burned-caption MP4</button>{job ? <div className="mt-4 rounded-2xl bg-white/[.04] p-4 text-sm"><p>Job: {job.jobId}</p><p>Status: {job.status}</p>{job.error ? <p className="text-red-300">{job.error}</p> : null}<button onClick={refreshJob} className="mt-3 rounded-full border border-white/20 px-4 py-2">Refresh</button>{job.result_url ? <a className="ml-3 text-[#FFD700]" href={job.result_url} download>Download</a> : null}</div> : null}</section></div></div>
    <footer className="mt-8 rounded-2xl border border-white/10 bg-white/[.03] p-4 text-sm text-white/60">Sync health: canvas time {currentTime.toFixed(2)}s · {cues.length} captions · queue-backed exports require <code>npm run worker:video</code>.</footer>
  </main>
}
