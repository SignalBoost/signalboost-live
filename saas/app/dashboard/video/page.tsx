'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

const BLUE = '#3b82f6'
const GOLD = '#ffc300'
const GREEN = '#4ade80'

const LANGS = [
  { code: 'en', flag: '🇺🇸', name: 'English' },
  { code: 'pt', flag: '🇧🇷', name: 'Português' },
  { code: 'es', flag: '🇪🇸', name: 'Español' },
  { code: 'pl', flag: '🇵🇱', name: 'Polski' },
  { code: 'ru', flag: '🇷🇺', name: 'Русский' },
]

const CAPTION_FORMATS = [
  { id: 'srt', name: 'SRT', desc: 'Standard subtitle format. Works on most platforms.' },
  { id: 'vtt', name: 'VTT', desc: 'Web Video Text Tracks. Best for web players.' },
  { id: 'ass', name: 'ASS', desc: 'Advanced styling. Best for burned-in captions.' },
]

const CLIP_FORMATS = [
  { id: 'tiktok',   icon: '🎵', name: 'TikTok',         size: '9:16 · 60s max' },
  { id: 'reels',    icon: '📱', name: 'Instagram Reels', size: '9:16 · 90s max' },
  { id: 'shorts',   icon: '▶️', name: 'YouTube Shorts',  size: '9:16 · 60s max' },
  { id: 'twitter',  icon: '🐦', name: 'X / Twitter',     size: '16:9 · 2:20 max' },
  { id: 'linkedin', icon: '💼', name: 'LinkedIn',        size: '1:1 · 10min max' },
]

type CaptionResult = {
  lang: string
  langName: string
  srtUrl?: string
  vttUrl?: string
  assUrl?: string
}

type Chapter = {
  gist: string
  headline: string
  summary: string
  start: number
  end: number
}

type Job = {
  id: string
  fileName: string
  status: 'uploading' | 'transcribing' | 'generating' | 'done' | 'error'
  langs: string[]
  formats: string[]
  captions: CaptionResult[]
  chapters: Chapter[] | null
  transcriptExcerpt: string
  duration: number
  created: string
  error?: string
  aspectRatio: '9:16' | '16:9' | '1:1'
}

// ── TikTok Phone Overlay ──────────────────────────────────────────────────────

function TikTokOverlay({
  jobs,
  initialIndex,
  onClose,
}: {
  jobs: Job[]
  initialIndex: number
  onClose: () => void
}) {
  const [index, setIndex] = useState(initialIndex)
  const [captionsOn, setCaptionsOn] = useState(true)
  const [activeLang, setActiveLang] = useState<string>('')
  const [activeFormat, setActiveFormat] = useState<'srt' | 'vtt' | 'ass'>('srt')
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9' | '1:1'>('9:16')
  const [slideIn, setSlideIn] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  const job = jobs[index]

  useEffect(() => {
    // Slide up animation
    requestAnimationFrame(() => setSlideIn(true))
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    if (!job) return
    setAspectRatio(job.aspectRatio ?? '9:16')
    const firstLang = job.captions?.[0]?.lang ?? 'en'
    setActiveLang(firstLang)
  }, [index, job])

  const activeCaptions = job?.captions?.find(c => c.lang === activeLang)
  const downloadUrl = activeFormat === 'srt'
    ? activeCaptions?.srtUrl
    : activeFormat === 'vtt'
    ? activeCaptions?.vttUrl
    : activeCaptions?.assUrl

  function handleClose() {
    setSlideIn(false)
    setTimeout(onClose, 300)
  }

  function prev() {
    if (index > 0) setIndex(i => i - 1)
  }

  function next() {
    if (index < jobs.length - 1) setIndex(i => i + 1)
  }

  // Phone frame aspect ratio dimensions
  const phoneWidth = aspectRatio === '16:9' ? 320 : aspectRatio === '1:1' ? 260 : 200
  const phoneAR = aspectRatio === '9:16' ? '9/16' : aspectRatio === '16:9' ? '16/9' : '1/1'

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) handleClose() }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        transition: 'background 0.3s ease',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 560,
          background: '#0a0a0f',
          borderRadius: '24px 24px 0 0',
          padding: '16px 20px 32px',
          transform: slideIn ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
          maxHeight: '96vh',
          overflowY: 'auto',
        }}
      >
        {/* Handle + close */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ width: 40, height: 4, background: 'rgba(255,255,255,0.2)', borderRadius: 999, margin: '0 auto' }} />
          <button
            onClick={handleClose}
            style={{ position: 'absolute', right: 20, top: 16, background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: 32, height: 32, color: '#fff', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            aria-label="Close"
          >✕</button>
        </div>

        {/* File name + nav */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <button onClick={prev} disabled={index === 0}
            style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '50%', width: 36, height: 36, color: index === 0 ? 'rgba(255,255,255,0.2)' : '#fff', cursor: index === 0 ? 'default' : 'pointer', fontSize: 18 }}>
            ‹
          </button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {job?.fileName}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
              {index + 1} of {jobs.length}
            </div>
          </div>
          <button onClick={next} disabled={index === jobs.length - 1}
            style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '50%', width: 36, height: 36, color: index === jobs.length - 1 ? 'rgba(255,255,255,0.2)' : '#fff', cursor: index === jobs.length - 1 ? 'default' : 'pointer', fontSize: 18 }}>
            ›
          </button>
        </div>

        {/* Phone frame */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <div style={{
            width: phoneWidth,
            background: '#111',
            borderRadius: aspectRatio === '9:16' ? 32 : 16,
            border: '3px solid #2a2a2a',
            overflow: 'hidden',
            position: 'relative',
          }}>
            {/* Notch (only for 9:16) */}
            {aspectRatio === '9:16' && (
              <div style={{ background: '#111', height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 60, height: 7, background: '#222', borderRadius: 4 }} />
              </div>
            )}

            {/* Video area */}
            <div style={{ aspectRatio: phoneAR, background: '#0d1b2a', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <div style={{ fontSize: 40, opacity: 0.3 }}>🎬</div>

              {/* Caption overlay */}
              {captionsOn && activeCaptions && (
                <div style={{ position: 'absolute', bottom: aspectRatio === '9:16' ? 40 : 20, left: 12, right: 12, textAlign: 'center' }}>
                  <span style={{ background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: aspectRatio === '9:16' ? 13 : 11, padding: '4px 10px', borderRadius: 6, lineHeight: 1.5, display: 'inline-block' }}>
                    {job?.transcriptExcerpt?.slice(0, 80) ?? 'Captions will appear here'}...
                  </span>
                </div>
              )}

              {/* TikTok-style right side actions (9:16 only) */}
              {aspectRatio === '9:16' && (
                <div style={{ position: 'absolute', right: 10, bottom: 80, display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
                  {[
                    { icon: '♥', label: 'Like' },
                    { icon: '↗', label: 'Share' },
                    { icon: '⤓', label: 'Save' },
                  ].map(a => (
                    <div key={a.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                      <div style={{ fontSize: 20, color: '#fff' }}>{a.icon}</div>
                      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)' }}>{a.label}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Progress bar */}
              <div style={{ position: 'absolute', bottom: aspectRatio === '9:16' ? 8 : 4, left: 10, right: 10, height: 2, background: 'rgba(255,255,255,0.15)', borderRadius: 999 }}>
                <div style={{ width: '35%', height: '100%', background: '#fff', borderRadius: 999 }} />
              </div>
            </div>

            {/* Home bar (9:16 only) */}
            {aspectRatio === '9:16' && (
              <div style={{ background: '#111', height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 48, height: 4, background: '#2a2a2a', borderRadius: 999 }} />
              </div>
            )}
          </div>
        </div>

        {/* Format toggle */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 16 }}>
          {(['9:16', '16:9', '1:1'] as const).map(f => (
            <button key={f} onClick={() => setAspectRatio(f)}
              style={{ padding: '6px 14px', borderRadius: 999, fontSize: 11, fontWeight: 700, border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', background: aspectRatio === f ? 'rgba(255,255,255,0.15)' : 'transparent', color: aspectRatio === f ? '#fff' : 'rgba(255,255,255,0.4)', transition: 'all 0.15s' }}>
              {f}
            </button>
          ))}
        </div>

        {/* Language tabs */}
        {job?.captions?.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 16 }}>
            {job.captions.map(c => {
              const lang = LANGS.find(l => l.code === c.lang)
              return (
                <button key={c.lang} onClick={() => setActiveLang(c.lang)}
                  style={{ padding: '6px 12px', borderRadius: 999, fontSize: 11, fontWeight: 600, border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', background: activeLang === c.lang ? BLUE : 'transparent', color: activeLang === c.lang ? '#fff' : 'rgba(255,255,255,0.5)', transition: 'all 0.15s' }}>
                  {lang?.flag} {c.langName}
                </button>
              )
            })}
          </div>
        )}

        {/* Caption format + toggle */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
          <button onClick={() => setCaptionsOn(v => !v)}
            style={{ padding: '7px 16px', borderRadius: 999, fontSize: 11, fontWeight: 700, border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', background: captionsOn ? 'rgba(59,130,246,0.2)' : 'transparent', color: captionsOn ? BLUE : 'rgba(255,255,255,0.4)', transition: 'all 0.15s' }}>
            💬 Captions {captionsOn ? 'on' : 'off'}
          </button>

          {(['srt', 'vtt', 'ass'] as const).map(f => (
            <button key={f} onClick={() => setActiveFormat(f)}
              style={{ padding: '7px 14px', borderRadius: 999, fontSize: 11, fontWeight: 600, border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', background: activeFormat === f ? 'rgba(255,255,255,0.1)' : 'transparent', color: activeFormat === f ? '#fff' : 'rgba(255,255,255,0.35)', transition: 'all 0.15s' }}>
              {f.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Chapters */}
        {job?.chapters && job.chapters.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Chapters</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {job.chapters.slice(0, 4).map((ch, i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '8px 12px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 2 }}>{ch.headline}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{ch.gist}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Download button */}
        {downloadUrl ? (
          <a href={downloadUrl} download
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '13px', borderRadius: 14, background: GOLD, color: '#000', fontWeight: 800, fontSize: 14, textDecoration: 'none', marginBottom: 8 }}>
            ⤓ Download {activeFormat.toUpperCase()} · {activeLang.toUpperCase()}
          </a>
        ) : (
          <div style={{ padding: '13px', borderRadius: 14, background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', marginBottom: 8 }}>
            No download available for this format
          </div>
        )}

        {/* Transcript excerpt */}
        {job?.transcriptExcerpt && (
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Transcript</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
              {job.transcriptExcerpt.slice(0, 200)}...
            </div>
          </div>
        )}
      </div>
    </div>
  )
}// ── Main Page ─────────────────────────────────────────────────────────────────

export default function VideoPage() {
  const { dict } = useI18n()
  const [tab, setTab] = useState<'captions' | 'clips' | 'jobs'>('captions')
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [selectedLangs, setSelectedLangs] = useState<string[]>(['en'])
  const [selectedFormats, setSelectedFormats] = useState<string[]>(['srt'])
  const [selectedClipFormats, setSelectedClipFormats] = useState<string[]>(['tiktok'])
  const [processing, setProcessing] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [statusMsg, setStatusMsg] = useState('')
  const [jobs, setJobs] = useState<Job[]>([])
  const [overlayIndex, setOverlayIndex] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const doneJobs = jobs.filter(j => j.status === 'done')

  function toggleLang(code: string) {
    setSelectedLangs(prev =>
      prev.includes(code) && prev.length > 1
        ? prev.filter(l => l !== code)
        : prev.includes(code) ? prev : [...prev, code]
    )
  }

  function toggleFormat(id: string) {
    setSelectedFormats(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    )
  }

  function toggleClipFormat(id: string) {
    setSelectedClipFormats(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    )
  }

  async function processFile() {
    if (!uploadedFile) return
    setError(null)
    setProcessing(true)
    setUploadProgress(10)
    setStatusMsg('Uploading...')

    // Create a placeholder job while processing
    const tempId = Date.now().toString()
    const newJob: Job = {
      id: tempId,
      fileName: uploadedFile.name,
      status: 'uploading',
      langs: selectedLangs,
      formats: selectedFormats,
      captions: [],
      chapters: null,
      transcriptExcerpt: '',
      duration: 0,
      created: new Date().toISOString().split('T')[0],
      aspectRatio: '9:16',
    }
    setJobs(prev => [newJob, ...prev])
    setTab('jobs')

    try {
      const formData = new FormData()
      formData.append('file', uploadedFile)
      formData.append('langs', selectedLangs.join(','))
      formData.append('formats', selectedFormats.join(','))

      setUploadProgress(20)
      setStatusMsg('Transcribing... this may take a minute')

      const res = await fetch('/api/video', {
        method: 'POST',
        body: formData,
      })

      setUploadProgress(80)

      const data = await res.json()

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error(t(dict, 'video_page.authExpired', 'Your session expired. Please sign in again and try once more.'))
        }
        throw new Error(data.error ?? t(dict, 'video_page.processingFailed', 'Processing failed'))
      }

      setUploadProgress(100)
      setStatusMsg('Done!')

      // Replace placeholder with real job
      const completedJob: Job = {
        id: data.jobId,
        fileName: uploadedFile.name,
        status: 'done',
        langs: data.langs,
        formats: data.formats,
        captions: data.captions ?? [],
        chapters: data.chapters ?? null,
        transcriptExcerpt: data.transcriptExcerpt ?? '',
        duration: data.duration ?? 0,
        created: new Date().toISOString().split('T')[0],
        aspectRatio: '9:16',
      }

      setJobs(prev => {
        const updated = prev.map(j => j.id === tempId ? completedJob : j)
        return updated
      })

      // Auto-open the TikTok overlay on completion
      setJobs(prev => {
        const idx = prev.findIndex(j => j.id === completedJob.id || j.id === tempId)
        if (idx !== -1) {
          setTimeout(() => setOverlayIndex(0), 400)
        }
        return prev
      })

      setUploadedFile(null)
    } catch (err: any) {
      const safeMessage = err?.message ?? t(dict, 'video_page.genericError', 'Something went wrong')
      setError(safeMessage)
      setJobs(prev => {
        const updated: Job[] = prev
          .map((j): Job => (j.id === tempId ? { ...j, status: 'error', error: safeMessage } : j))
          .filter(j => !(j.id === tempId && safeMessage.toLowerCase().includes('session expired')))

        return updated
      })
    } finally {
      setProcessing(false)
      setUploadProgress(0)
      setStatusMsg('')
    }
  }

  const FileUpload = useCallback(() => (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept=".mp4,.mov,.avi,.mkv,.webm,.mp3,.wav,.m4a"
        style={{ display: 'none' }}
        onChange={e => setUploadedFile(e.target.files?.[0] ?? null)}
      />
      <div
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2px dashed ${uploadedFile ? 'rgba(74,222,128,0.4)' : 'rgba(255,255,255,0.15)'}`,
          borderRadius: 12, padding: '28px 24px', textAlign: 'center',
          cursor: 'pointer', marginBottom: 20, transition: 'border-color 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(59,130,246,0.4)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = uploadedFile ? 'rgba(74,222,128,0.4)' : 'rgba(255,255,255,0.15)')}
      >
        <div style={{ fontSize: 32, marginBottom: 10 }}>{uploadedFile ? '✅' : '🎬'}</div>
        {uploadedFile ? (
          <div style={{ fontSize: 14, fontWeight: 600, color: GREEN }}>{uploadedFile.name}</div>
        ) : (
          <>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
              {t(dict, 'video_page.dropVideo', 'Drop your video here or click to browse')}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
              {t(dict, 'video_page.supports', 'Supports MP4, MOV, AVI, MKV, WebM · Also MP3, WAV')}
            </div>
          </>
        )}
      </div>
    </div>
  ), [uploadedFile, dict])

  return (
    <div style={{ color: '#fff', fontFamily: 'system-ui' }}>

      {/* TikTok overlay */}
      {overlayIndex !== null && doneJobs.length > 0 && (
        <TikTokOverlay
          jobs={doneJobs}
          initialIndex={overlayIndex}
          onClose={() => setOverlayIndex(null)}
        />
      )}

      {/* Header */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: 20, marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0, letterSpacing: '-0.02em' }}>
          🎬 {t(dict, 'video_page.title', 'Video editor')}
        </h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>
          {t(dict, 'video_page.subtitle', 'Generate multilingual captions and social media clips from your videos.')}
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: '#f87171', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 4, width: 'fit-content' }}>
        {[
          { id: 'captions', label: `💬 ${t(dict, 'video_page.tabCaptions', 'Captions')}` },
          { id: 'clips',    label: `✂️ ${t(dict, 'video_page.tabClips', 'Social clips')}` },
          { id: 'jobs',     label: `📁 ${t(dict, 'video_page.tabFiles', 'My files')} ${jobs.length > 0 ? `(${jobs.length})` : ''}` },
        ].map(tb => (
          <button key={tb.id} onClick={() => setTab(tb.id as any)}
            style={{ padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', background: tab === tb.id ? BLUE : 'transparent', color: tab === tb.id ? '#fff' : 'rgba(255,255,255,0.45)' }}>
            {tb.label}
          </button>
        ))}
      </div>

      {/* ── Captions tab ── */}
      {tab === 'captions' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>
              {t(dict, 'video_page.generateCaptions', 'Generate captions')}
            </h2>
            <FileUpload />

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 10 }}>
                {t(dict, 'video_page.languages', 'Languages')}
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {LANGS.map(lang => (
                  <button key={lang.code} onClick={() => toggleLang(lang.code)}
                    style={{ padding: '7px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', background: selectedLangs.includes(lang.code) ? BLUE : 'rgba(255,255,255,0.06)', color: selectedLangs.includes(lang.code) ? '#fff' : 'rgba(255,255,255,0.5)', transition: 'all 0.15s' }}>
                    {lang.flag} {lang.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Upload progress */}
            {processing && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
                  <span>{statusMsg}</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 999 }}>
                  <div style={{ height: '100%', background: BLUE, borderRadius: 999, width: `${uploadProgress}%`, transition: 'width 0.6s ease' }} />
                </div>
              </div>
            )}

            <button onClick={processFile} disabled={!uploadedFile || processing}
              style={{ background: uploadedFile && !processing ? GOLD : 'rgba(255,255,255,0.05)', color: uploadedFile && !processing ? '#000' : 'rgba(255,255,255,0.4)', fontWeight: 800, fontSize: 14, padding: '13px 32px', borderRadius: 12, border: 'none', cursor: uploadedFile && !processing ? 'pointer' : 'default', transition: 'all 0.15s' }}>
              {processing
                ? `⏳ ${statusMsg || t(dict, 'video_page.processing', 'Processing...')}`
                : `💬 ${t(dict, 'video_page.generateCaptions', 'Generate captions')}`}
            </button>
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 10 }}>
              {t(dict, 'video_page.captionFormat', 'Caption format')}
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {CAPTION_FORMATS.map(fmt => (
                <div key={fmt.id} onClick={() => toggleFormat(fmt.id)}
                  style={{ padding: '12px 14px', borderRadius: 10, cursor: 'pointer', background: selectedFormats.includes(fmt.id) ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.02)', border: `1px solid ${selectedFormats.includes(fmt.id) ? BLUE : 'rgba(255,255,255,0.07)'}`, transition: 'all 0.15s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{fmt.name}</span>
                    {selectedFormats.includes(fmt.id) && <span style={{ color: BLUE }}>✓</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{fmt.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Clips tab ── */}
      {tab === 'clips' && (
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>
            {t(dict, 'video_page.generateClips', 'Generate social clips')}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div>
              <FileUpload />
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 10 }}>
                  {t(dict, 'video_page.langsForCaptions', 'Languages for captions')}
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {LANGS.map(lang => (
                    <button key={lang.code} onClick={() => toggleLang(lang.code)}
                      style={{ padding: '7px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', background: selectedLangs.includes(lang.code) ? BLUE : 'rgba(255,255,255,0.06)', color: selectedLangs.includes(lang.code) ? '#fff' : 'rgba(255,255,255,0.5)', transition: 'all 0.15s' }}>
                      {lang.flag} {lang.name}
                    </button>
                  ))}
                </div>
              </div>

              {processing && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
                    <span>{statusMsg}</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 999 }}>
                    <div style={{ height: '100%', background: BLUE, borderRadius: 999, width: `${uploadProgress}%`, transition: 'width 0.6s ease' }} />
                  </div>
                </div>
              )}

              <button onClick={processFile} disabled={!uploadedFile || processing}
                style={{ background: uploadedFile && !processing ? GOLD : 'rgba(255,255,255,0.05)', color: uploadedFile && !processing ? '#000' : 'rgba(255,255,255,0.4)', fontWeight: 800, fontSize: 14, padding: '13px 32px', borderRadius: 12, border: 'none', cursor: uploadedFile && !processing ? 'pointer' : 'default' }}>
                {processing
                  ? `⏳ ${statusMsg || t(dict, 'video_page.processing', 'Processing...')}`
                  : `✂️ ${t(dict, 'video_page.generateClipsBtn', 'Generate clips')}`}
              </button>
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 10 }}>
                {t(dict, 'video_page.exportFor', 'Export for')}
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {CLIP_FORMATS.map(fmt => (
                  <div key={fmt.id} onClick={() => toggleClipFormat(fmt.id)}
                    style={{ padding: '12px 14px', borderRadius: 10, cursor: 'pointer', background: selectedClipFormats.includes(fmt.id) ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.02)', border: `1px solid ${selectedClipFormats.includes(fmt.id) ? BLUE : 'rgba(255,255,255,0.07)'}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 20 }}>{fmt.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{fmt.name}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{fmt.size}</div>
                    </div>
                    {selectedClipFormats.includes(fmt.id) && <span style={{ color: BLUE }}>✓</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── My files tab ── */}
      {tab === 'jobs' && (
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>
            {t(dict, 'video_page.myFiles', 'My video files')}
          </h2>

          {jobs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 16 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🎬</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{t(dict, 'video_page.noFiles', 'No files yet')}</div>
              <div style={{ fontSize: 13 }}>{t(dict, 'video_page.noFilesSub', 'Generate captions or clips to see them here')}</div>
            </div>
          ) : (
            <>
              {/* TikTok-style vertical card grid for done jobs */}
              {doneJobs.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
                    Ready · tap to preview
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12 }}>
                    {doneJobs.map((job, i) => (
                      <div
                        key={job.id}
                        onClick={() => setOverlayIndex(i)}
                        style={{ cursor: 'pointer', borderRadius: 14, overflow: 'hidden', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', transition: 'transform 0.15s, border-color 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.borderColor = 'rgba(59,130,246,0.4)' }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
                      >
                        {/* Vertical thumbnail (9:16 default) */}
                        <div style={{ aspectRatio: '9/16', background: 'linear-gradient(180deg, #0d1b2a 0%, #1a1a2e 100%)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <div style={{ fontSize: 28, opacity: 0.4 }}>🎬</div>
                          {/* Aspect ratio badge */}
                          <div style={{ position: 'absolute', top: 6, left: 6, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 20 }}>
                            {job.aspectRatio}
                          </div>
                          {/* Lang badges */}
                          <div style={{ position: 'absolute', bottom: 6, left: 6, display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                            {job.langs.slice(0, 3).map(l => {
                              const lang = LANGS.find(x => x.code === l)
                              return (
                                <span key={l} style={{ fontSize: 10 }}>{lang?.flag}</span>
                              )
                            })}
                          </div>
                        </div>
                        <div style={{ padding: '8px 10px' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {job.fileName}
                          </div>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                            {job.captions.length} {job.captions.length === 1 ? 'language' : 'languages'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Processing / error jobs as list */}
              {jobs.filter(j => j.status !== 'done').length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {jobs.filter(j => j.status !== 'done').map(job => (
                    <div key={job.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '16px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: job.status === 'error' ? 0 : 10 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{job.fileName}</div>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                            {job.langs.length} {t(dict, 'video_page.langCount', 'languages')} · {job.created}
                          </div>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: job.status === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.1)', color: job.status === 'error' ? '#f87171' : BLUE }}>
                          {job.status === 'error'
                            ? '✕ Error'
                            : job.status === 'uploading'
                            ? '⬆ Uploading'
                            : job.status === 'transcribing'
                            ? '🎙 Transcribing'
                            : '⚙ Generating'}
                        </span>
                      </div>
                      {job.status !== 'error' && (
                        <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 999 }}>
                          <div style={{ height: '100%', background: BLUE, borderRadius: 999, width: job.status === 'uploading' ? '30%' : job.status === 'transcribing' ? '60%' : '85%', transition: 'width 0.8s ease' }} />
                        </div>
                      )}
                      {job.status === 'error' && job.error && (
                        <div style={{ fontSize: 12, color: '#f87171', marginTop: 6 }}>{job.error}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
