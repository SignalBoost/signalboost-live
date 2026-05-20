'use client'
import { useState, useRef } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

const BLUE = '#3b82f6'
const GOLD = '#ffc300'

const LANGS = [
  { code: 'en', flag: '🇺🇸', name: 'English' },
  { code: 'pt', flag: '🇧🇷', name: 'Português' },
  { code: 'es', flag: '🇪🇸', name: 'Español' },
  { code: 'pl', flag: '🇵🇱', name: 'Polski' },
  { code: 'ru', flag: '🇷🇺', name: 'Русский' },
]

export default function VideoPage() {
  const { dict } = useI18n()
  const [tab, setTab] = useState<'captions' | 'clips' | 'jobs'>('captions')
  const [uploadedFile, setUploadedFile] = useState('')
  const [selectedLangs, setSelectedLangs] = useState<string[]>(['en'])
  const [selectedFormats, setSelectedFormats] = useState<string[]>(['srt'])
  const [selectedClipFormats, setSelectedClipFormats] = useState<string[]>(['tiktok'])
  const [processing, setProcessing] = useState(false)
  const [jobs, setJobs] = useState<any[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const CAPTION_FORMATS = [
    { id: 'srt', name: 'SRT', desc: t(dict, 'video_page.captionFmt.srt', 'Standard subtitle format. Works on most platforms.') },
    { id: 'vtt', name: 'VTT', desc: t(dict, 'video_page.captionFmt.vtt', 'Web Video Text Tracks. Best for web players.') },
    { id: 'ass', name: 'ASS', desc: t(dict, 'video_page.captionFmt.ass', 'Advanced styling. Best for burned-in captions.') },
    { id: 'burned', name: t(dict, 'video_page.captionFmt.burnedName', 'Burned in'), desc: t(dict, 'video_page.captionFmt.burned', 'Captions embedded directly into the video file.') },
  ]

  const CLIP_FORMATS = [
    { id: 'tiktok',   icon: '🎵', name: 'TikTok',          size: '9:16 · 60s max' },
    { id: 'reels',    icon: '📱', name: 'Instagram Reels',  size: '9:16 · 90s max' },
    { id: 'shorts',   icon: '▶️', name: 'YouTube Shorts',   size: '9:16 · 60s max' },
    { id: 'twitter',  icon: '🐦', name: 'X / Twitter',      size: '16:9 · 2:20 max' },
    { id: 'linkedin', icon: '💼', name: 'LinkedIn',         size: '1:1 · 10min max' },
  ]

  function toggleLang(code: string) {
    setSelectedLangs(prev =>
      prev.includes(code) && prev.length > 1 ? prev.filter(l => l !== code) : prev.includes(code) ? prev : [...prev, code]
    )
  }

  function toggleFormat(id: string) {
    setSelectedFormats(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id])
  }

  function toggleClipFormat(id: string) {
    setSelectedClipFormats(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id])
  }

  async function process() {
    if (!uploadedFile) return
    setProcessing(true)
    const newJob = {
      id: Date.now().toString(),
      file: uploadedFile,
      type: tab,
      langs: selectedLangs,
      formats: tab === 'captions' ? selectedFormats : selectedClipFormats,
      status: 'processing',
      progress: 0,
      created: new Date().toISOString().split('T')[0],
    }
    setJobs(prev => [newJob, ...prev])
    setTab('jobs')

    let progress = 0
    const interval = setInterval(() => {
      progress += Math.random() * 15
      if (progress >= 100) {
        progress = 100
        clearInterval(interval)
        setJobs(prev => prev.map(j => j.id === newJob.id ? { ...j, status: 'done', progress: 100 } : j))
        setProcessing(false)
      }
      setJobs(prev => prev.map(j => j.id === newJob.id ? { ...j, progress: Math.min(progress, 99) } : j))
    }, 600)
  }

  const FileUpload = () => (
    <div>
      <input ref={fileRef} type="file" accept=".mp4,.mov,.avi,.mkv,.webm" style={{ display: 'none' }}
        onChange={e => setUploadedFile(e.target.files?.[0]?.name || '')} />
      <div onClick={() => fileRef.current?.click()}
        style={{ border: `2px dashed ${uploadedFile ? 'rgba(74,222,128,0.4)' : 'rgba(255,255,255,0.15)'}`, borderRadius: 12, padding: '28px 24px', textAlign: 'center', cursor: 'pointer', marginBottom: 20, transition: 'border-color 0.15s' }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(59,130,246,0.4)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = uploadedFile ? 'rgba(74,222,128,0.4)' : 'rgba(255,255,255,0.15)')}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>{uploadedFile ? '✅' : '🎬'}</div>
        {uploadedFile ? (
          <div style={{ fontSize: 14, fontWeight: 600, color: '#4ade80' }}>{uploadedFile}</div>
        ) : (
          <>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{t(dict, 'video_page.dropVideo', 'Drop your video here or click to browse')}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{t(dict, 'video_page.supports', 'Supports MP4, MOV, AVI, MKV, WebM')}</div>
          </>
        )}
      </div>
    </div>
  )

  return (
    <div style={{ color: '#fff', fontFamily: 'system-ui' }}>

      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: 20, marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0, letterSpacing: '-0.02em' }}>🎬 {t(dict, 'video_page.title', 'Video editor')}</h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>
          {t(dict, 'video_page.subtitle', 'Generate multilingual captions and social media clips from your videos.')}
        </p>
      </div>

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

      {/* Captions */}
      {tab === 'captions' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>{t(dict, 'video_page.generateCaptions', 'Generate captions')}</h2>
            <FileUpload />

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 10 }}>{t(dict, 'video_page.languages', 'Languages')}</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {LANGS.map(lang => (
                  <button key={lang.code} onClick={() => toggleLang(lang.code)}
                    style={{ padding: '7px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', background: selectedLangs.includes(lang.code) ? BLUE : 'rgba(255,255,255,0.06)', color: selectedLangs.includes(lang.code) ? '#fff' : 'rgba(255,255,255,0.5)', transition: 'all 0.15s' }}>
                    {lang.flag} {lang.name}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={process} disabled={!uploadedFile || processing}
              style={{ background: uploadedFile && !processing ? GOLD : 'rgba(255,255,255,0.05)', color: uploadedFile && !processing ? '#000' : 'rgba(255,255,255,0.4)', fontWeight: 800, fontSize: 14, padding: '13px 32px', borderRadius: 12, border: 'none', cursor: uploadedFile && !processing ? 'pointer' : 'default', transition: 'all 0.15s' }}>
              {processing ? t(dict, 'video_page.processing', 'Processing...') : `💬 ${t(dict, 'video_page.generateCaptions', 'Generate captions')}`}
            </button>
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 10 }}>{t(dict, 'video_page.captionFormat', 'Caption format')}</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {CAPTION_FORMATS.map(fmt => (
                <div key={fmt.id} onClick={() => toggleFormat(fmt.id)}
                  style={{ padding: '12px 14px', borderRadius: 10, cursor: 'pointer', background: selectedFormats.includes(fmt.id) ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.02)', border: `1px solid ${selectedFormats.includes(fmt.id) ? BLUE : 'rgba(255,255,255,0.07)'}`, transition: 'all 0.15s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{fmt.name}</span>
                    {selectedFormats.includes(fmt.id) && <span style={{ color: BLUE, fontSize: 14 }}>✓</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{fmt.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Clips */}
      {tab === 'clips' && (
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>{t(dict, 'video_page.generateClips', 'Generate social clips')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div>
              <FileUpload />
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 10 }}>{t(dict, 'video_page.langsForCaptions', 'Languages for captions')}</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {LANGS.map(lang => (
                    <button key={lang.code} onClick={() => toggleLang(lang.code)}
                      style={{ padding: '7px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', background: selectedLangs.includes(lang.code) ? BLUE : 'rgba(255,255,255,0.06)', color: selectedLangs.includes(lang.code) ? '#fff' : 'rgba(255,255,255,0.5)', transition: 'all 0.15s' }}>
                      {lang.flag} {lang.name}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={process} disabled={!uploadedFile || processing}
                style={{ background: uploadedFile && !processing ? GOLD : 'rgba(255,255,255,0.05)', color: uploadedFile && !processing ? '#000' : 'rgba(255,255,255,0.4)', fontWeight: 800, fontSize: 14, padding: '13px 32px', borderRadius: 12, border: 'none', cursor: uploadedFile && !processing ? 'pointer' : 'default' }}>
                {processing ? t(dict, 'video_page.processing', 'Processing...') : `✂️ ${t(dict, 'video_page.generateClipsBtn', 'Generate clips')}`}
              </button>
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 10 }}>{t(dict, 'video_page.exportFor', 'Export for')}</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {CLIP_FORMATS.map(fmt => (
                  <div key={fmt.id} onClick={() => toggleClipFormat(fmt.id)}
                    style={{ padding: '12px 14px', borderRadius: 10, cursor: 'pointer', background: selectedClipFormats.includes(fmt.id) ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.02)', border: `1px solid ${selectedClipFormats.includes(fmt.id) ? BLUE : 'rgba(255,255,255,0.07)'}`, display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.15s' }}>
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

      {/* Jobs */}
      {tab === 'jobs' && (
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>{t(dict, 'video_page.myFiles', 'My video files')}</h2>
          {jobs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 16 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🎬</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{t(dict, 'video_page.noFiles', 'No files yet')}</div>
              <div style={{ fontSize: 13 }}>{t(dict, 'video_page.noFilesSub', 'Generate captions or clips to see them here')}</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {jobs.map(job => (
                <div key={job.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: job.status === 'processing' ? 10 : 0 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{job.file}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                        {job.type === 'captions' ? t(dict, 'video_page.tabCaptions', 'Captions') : t(dict, 'video_page.tabClips', 'Social clips')} · {job.langs.length} {t(dict, 'video_page.langCount', 'languages')} · {job.created}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: job.status === 'done' ? 'rgba(74,222,128,0.1)' : 'rgba(59,130,246,0.1)', color: job.status === 'done' ? '#4ade80' : BLUE }}>
                        {job.status === 'done' ? `✓ ${t(dict, 'video_page.ready', 'Ready')}` : `${t(dict, 'video_page.processingShort', 'Processing')} ${Math.round(job.progress)}%`}
                      </span>
                      {job.status === 'done' && (
                        <button style={{ padding: '6px 14px', borderRadius: 8, background: BLUE, color: '#fff', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                          {t(dict, 'video_page.download', 'Download')}
                        </button>
                      )}
                    </div>
                  </div>
                  {job.status === 'processing' && (
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 999 }}>
                      <div style={{ height: '100%', background: BLUE, borderRadius: 999, width: `${job.progress}%`, transition: 'width 0.5s' }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
