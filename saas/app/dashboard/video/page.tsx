// saas/app/dashboard/video-page.tsx
// Real captions Studio with DIRECT-TO-STORAGE upload (no Vercel 4.5MB limit).
// Flow: ask server for a signed upload URL -> upload file straight to Supabase
// Storage -> tell /api/video the path -> show/download real captions.

'use client'

import { useState, useRef, useMemo } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

type CaptionResult = {
  lang: string
  langName: string
  srtUrl?: string
  vttUrl?: string
  assUrl?: string
}

type Chapter = {
  headline?: string
  gist?: string
  summary?: string
  start?: number
  end?: number
}

type VideoResult = {
  jobId: string
  status: string
  fileName: string
  duration: number
  captions: CaptionResult[]
  chapters?: Chapter[] | null
  transcriptExcerpt?: string
  langs: string[]
  formats: string[]
}

type Phase = null | 'preparing' | 'uploading' | 'processing'

const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'pt', label: 'Português' },
  { code: 'es', label: 'Español' },
  { code: 'pl', label: 'Polski' },
  { code: 'ru', label: 'Русский' },
]

const FORMATS = [
  { code: 'srt', label: 'SRT', hint: 'Most editors / YouTube' },
  { code: 'vtt', label: 'WebVTT', hint: 'Web players / HTML5' },
  { code: 'ass', label: 'ASS', hint: 'Styled / Aegisub' },
]

const ACCEPT = '.mp4,.mov,.avi,.mkv,.webm,.mp3,.wav,.m4a,video/*,audio/*'

function fmtBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${u[i]}`
}

function fmtDuration(secs: number): string {
  if (!secs || secs < 0) return '—'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.floor(secs % 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

function baseName(name: string): string {
  return name.replace(/\.[^./\\]+$/, '') || 'captions'
}

async function safeJson(res: Response): Promise<any> {
  try {
    return await res.json()
  } catch {
    return { error: `Unexpected server response (${res.status}).` }
  }
}

export default function VideoPage() {
  const i18n: any = useI18n()
  const dict = i18n?.dict ?? i18n ?? {}
  const tr = (key: string, fallback: string) => t(dict, key, fallback)

  // Browser Supabase client (storage only — public anon key, fine client-side)
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      ),
    [],
  )

  const [file, setFile] = useState<File | null>(null)
  const [langs, setLangs] = useState<string[]>(['en'])
  const [formats, setFormats] = useState<string[]>(['srt'])
  const [phase, setPhase] = useState<Phase>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<VideoResult | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const busy = phase !== null

  function pickFiles(list: FileList | null) {
    if (!list || !list.length) return
    setError(null)
    setResult(null)
    setFile(list[0])
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    pickFiles(e.dataTransfer?.files ?? null)
  }

  function toggleLang(code: string) {
    setLangs((prev) =>
      prev.includes(code)
        ? prev.length > 1 ? prev.filter((l) => l !== code) : prev
        : [...prev, code],
    )
  }

  function toggleFormat(code: string) {
    setFormats((prev) =>
      prev.includes(code)
        ? prev.length > 1 ? prev.filter((f) => f !== code) : prev
        : [...prev, code],
    )
  }

  async function generate() {
    if (!file || busy) return
    setError(null)
    setResult(null)

    try {
      // 1. Ask server for a one-time signed upload URL
      setPhase('preparing')
      const prep = await fetch('/api/video/upload-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, fileSize: file.size, langs, formats }),
      })
      const prepData = await safeJson(prep)
      if (!prep.ok) {
        setError(prepData?.error || tr('video.err.prep', `Could not start upload (${prep.status}).`))
        return
      }
      const { jobId, path, token } = prepData

      // 2. Upload the video DIRECTLY to Supabase Storage
      setPhase('uploading')
      const { error: upErr } = await supabase.storage
        .from('video-jobs')
        .uploadToSignedUrl(path, token, file)
      if (upErr) {
        setError(
          tr('video.err.upload', 'Upload to storage failed: ') +
            (upErr.message || 'unknown') +
            tr('video.err.upload2', ' — if the file is large, your storage plan may cap file size.'),
        )
        return
      }

      // 3. Tell the server to transcribe + generate captions
      setPhase('processing')
      const res = await fetch('/api/video', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jobId, path, langs, formats }),
      })
      const data = await safeJson(res)
      if (!res.ok) {
        setError(data?.error || tr('video.err.failed', `Processing failed (${res.status}).`))
        return
      }
      setResult(data as VideoResult)
    } catch (e) {
      setError(
        tr('video.err.network', 'Unexpected error: ') +
          (e instanceof Error ? e.message : String(e)),
      )
    } finally {
      setPhase(null)
    }
  }

  async function download(url: string, fname: string, tag: string) {
    setDownloading(tag)
    try {
      const r = await fetch(url)
      if (!r.ok) throw new Error('fetch failed')
      const blob = await r.blob()
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = fname
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(href)
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer')
    } finally {
      setDownloading(null)
    }
  }

  function reset() {
    setFile(null)
    setResult(null)
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const canGenerate = !!file && !busy && langs.length > 0 && formats.length > 0

  const phaseText =
    phase === 'preparing'
      ? tr('video.phase.prep', 'Preparing upload…')
      : phase === 'uploading'
      ? tr('video.phase.upload', 'Uploading your file…')
      : tr(
          'video.phase.process',
          'Transcribing and generating captions. Longer files can take several minutes — keep this tab open.',
        )

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '32px 20px 80px' }}>
      <style>{`
        @keyframes sbSweep { 0% { transform: translateX(-100%);} 100% { transform: translateX(220%);} }
        .sb-chip { display:inline-flex; align-items:center; gap:8px; padding:8px 14px; border-radius:999px; cursor:pointer; border:1px solid rgba(255,255,255,0.14); background:rgba(255,255,255,0.03); color:#c9cdd6; font-size:14px; user-select:none; transition:all .15s ease; }
        .sb-chip:hover { border-color:rgba(255,255,255,0.28); }
        .sb-chip[data-on="true"] { border-color:var(--gold,#ffc300); background:rgba(255,195,0,0.12); color:#fff; }
        .sb-fmt { display:flex; flex-direction:column; gap:2px; padding:12px 16px; border-radius:12px; cursor:pointer; border:1px solid rgba(255,255,255,0.14); background:rgba(255,255,255,0.03); transition:all .15s ease; min-width:150px; }
        .sb-fmt:hover { border-color:rgba(255,255,255,0.28); }
        .sb-fmt[data-on="true"] { border-color:var(--cyan,#1af0ff); background:rgba(26,240,255,0.10); }
      `}</style>

      <p className="sb-eyebrow">{tr('video.eyebrow', 'Video Studio')}</p>
      <h2 className="sb-h2">{tr('video.title', 'Auto Captions')}</h2>
      <p className="sb-body" style={{ maxWidth: 620, marginTop: 8 }}>
        {tr(
          'video.subtitle',
          'Upload a video or audio file and get accurate, downloadable captions (SRT, WebVTT, ASS) — translated into the languages you choose.',
        )}
      </p>

      <div className="sb-card" style={{ marginTop: 24, padding: 0, overflow: 'hidden' }}>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => !busy && inputRef.current?.click()}
          style={{
            cursor: busy ? 'default' : 'pointer',
            padding: '36px 24px',
            textAlign: 'center',
            border: `1.5px dashed ${dragOver ? 'var(--gold, #ffc300)' : 'rgba(255,255,255,0.18)'}`,
            background: dragOver ? 'rgba(255,195,0,0.06)' : 'transparent',
            transition: 'all .15s ease',
            margin: 16,
            borderRadius: 14,
            opacity: busy ? 0.6 : 1,
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            style={{ display: 'none' }}
            onChange={(e) => pickFiles(e.target.files)}
          />
          {file ? (
            <div>
              <div className="sb-h3" style={{ marginBottom: 4 }}>{file.name}</div>
              <div className="sb-caption">{fmtBytes(file.size)}</div>
              {!busy && (
                <button
                  className="sb-button-secondary"
                  style={{ marginTop: 14 }}
                  onClick={(e) => { e.stopPropagation(); reset() }}
                >
                  {tr('video.change', 'Choose a different file')}
                </button>
              )}
            </div>
          ) : (
            <div>
              <div className="sb-h3" style={{ marginBottom: 6 }}>
                {tr('video.drop', 'Drop a file here or click to browse')}
              </div>
              <div className="sb-caption">
                {tr('video.types', 'MP4, MOV, MKV, WEBM, MP3, WAV, M4A')}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 28 }}>
        <h3 className="sb-h3" style={{ marginBottom: 4 }}>
          {tr('video.langs.title', 'Caption languages')}
        </h3>
        <p className="sb-caption" style={{ marginBottom: 12 }}>
          {tr('video.langs.hint', 'English is transcribed directly; other languages are translated from the transcript.')}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {LANGS.map((l) => (
            <div key={l.code} className="sb-chip" data-on={langs.includes(l.code)} onClick={() => !busy && toggleLang(l.code)}>
              {l.label}
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 28 }}>
        <h3 className="sb-h3" style={{ marginBottom: 12 }}>
          {tr('video.formats.title', 'Output formats')}
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {FORMATS.map((f) => (
            <div key={f.code} className="sb-fmt" data-on={formats.includes(f.code)} onClick={() => !busy && toggleFormat(f.code)}>
              <span style={{ color: '#fff', fontWeight: 600 }}>{f.label}</span>
              <span className="sb-caption">{f.hint}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 32 }}>
        <button
          className="sb-button-primary"
          disabled={!canGenerate}
          onClick={generate}
          style={{ opacity: canGenerate ? 1 : 0.5, cursor: canGenerate ? 'pointer' : 'not-allowed' }}
        >
          {busy ? tr('video.working', 'Working…') : tr('video.generate', 'Generate captions')}
        </button>
        {!file && (
          <p className="sb-caption" style={{ marginTop: 10 }}>
            {tr('video.needfile', 'Add a file above to get started.')}
          </p>
        )}
      </div>

      {busy && (
        <div className="sb-card" style={{ marginTop: 24, padding: 20 }}>
          <div style={{ position: 'relative', height: 6, borderRadius: 999, overflow: 'hidden', background: 'rgba(255,255,255,0.08)' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: '40%', borderRadius: 999, background: 'linear-gradient(90deg, transparent, var(--gold, #ffc300), transparent)', animation: 'sbSweep 1.3s ease-in-out infinite' }} />
          </div>
          <p className="sb-body" style={{ marginTop: 14 }}>{phaseText}</p>
        </div>
      )}

      {error && !busy && (
        <div style={{ marginTop: 24, padding: '14px 18px', borderRadius: 12, border: '1px solid rgba(255,90,90,0.45)', background: 'rgba(255,90,90,0.12)', color: '#ffb4b4' }}>
          {error}
        </div>
      )}

      {result && !busy && (
        <div style={{ marginTop: 32 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <h3 className="sb-h3">{tr('video.results.title', 'Your captions')}</h3>
            <span className="sb-caption">
              {tr('video.results.duration', 'Duration')}: {fmtDuration(result.duration)}
            </span>
          </div>

          <div style={{ display: 'grid', gap: 14 }}>
            {result.captions?.map((c) => {
              const items = [
                { fmt: 'srt', url: c.srtUrl, ext: 'srt' },
                { fmt: 'vtt', url: c.vttUrl, ext: 'vtt' },
                { fmt: 'ass', url: c.assUrl, ext: 'ass' },
              ].filter((i) => !!i.url)

              return (
                <div className="sb-card" key={c.lang} style={{ padding: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ color: '#fff', fontWeight: 600 }}>{c.langName || c.lang}</span>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {items.length === 0 && (
                        <span className="sb-caption" style={{ color: '#ffb4b4' }}>
                          {tr('video.results.nofile', 'No file generated for this language.')}
                        </span>
                      )}
                      {items.map((i) => {
                        const tag = `${c.lang}.${i.ext}`
                        const fname = `${baseName(result.fileName)}-${c.lang}.${i.ext}`
                        return (
                          <button
                            key={i.ext}
                            className="sb-button-secondary"
                            disabled={downloading === tag}
                            onClick={() => download(i.url as string, fname, tag)}
                          >
                            {downloading === tag
                              ? tr('video.results.downloading', 'Downloading…')
                              : `${tr('video.results.download', 'Download')} .${i.ext}`}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {Array.isArray(result.chapters) && result.chapters.length > 0 && (
            <div className="sb-card" style={{ marginTop: 16, padding: 18 }}>
              <h3 className="sb-h3" style={{ marginBottom: 10 }}>{tr('video.chapters', 'Chapters')}</h3>
              <div style={{ display: 'grid', gap: 8 }}>
                {result.chapters.map((ch, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 12 }}>
                    <span className="sb-caption" style={{ minWidth: 56, color: 'var(--cyan, #1af0ff)' }}>
                      {fmtDuration((ch.start ?? 0) / 1000)}
                    </span>
                    <span className="sb-body">{ch.headline || ch.gist || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.transcriptExcerpt && (
            <div className="sb-card" style={{ marginTop: 16, padding: 18 }}>
              <h3 className="sb-h3" style={{ marginBottom: 8 }}>{tr('video.transcript', 'Transcript preview')}</h3>
              <p className="sb-body" style={{ opacity: 0.85 }}>
                {result.transcriptExcerpt}
                {result.transcriptExcerpt.length >= 500 ? '…' : ''}
              </p>
            </div>
          )}

          <div style={{ marginTop: 24 }}>
            <button className="sb-button-secondary" onClick={reset}>
              {tr('video.again', 'Caption another file')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
