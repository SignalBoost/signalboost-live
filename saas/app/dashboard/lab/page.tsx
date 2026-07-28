'use client'
import { useState, useRef, useEffect } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


const BLUE = '#3b82f6'
const GOLD = '#ffc300'
const GREEN = '#4ade80'

type Mode = 'auto' | 'search' | 'generate' | 'caption' | 'dub'

type VideoResult = {
  id: string
  title: string
  description: string
  duration: string
  durationSeconds: number
  thumbnail: string
  embedUrl: string
  watchUrl: string
  source: 'youtube' | 'archive'
  license: 'public' | 'embeddable' | 'restricted'
  licenseLabel: string
  channelName?: string
  publishedAt?: string
}

type GenerateData = {
  script: string
  avatars: { name: string; id: string }[]
  estimatedCost: string
  format: string
  language: string
  heygenReady: boolean
}

type Asset = {
  id: string
  title: string
  source: 'youtube' | 'archive'
  embedUrl: string
  watchUrl: string
  license: 'public' | 'embeddable' | 'restricted'
  addedAt: string
}

type UploadedFile = {
  id: string
  name: string
  size: number
  type: string
  preview?: string
  file?: File
}

const MODES: { id: Mode; icon: string; labelKey: string }[] = [
  { id: 'auto',     icon: '✦',  labelKey: 'lab.mode.auto' },
  { id: 'search',   icon: '🔍', labelKey: 'lab.mode.search' },
  { id: 'generate', icon: '🪄', labelKey: 'lab.mode.generate' },
  { id: 'caption',  icon: '💬', labelKey: 'lab.mode.caption' },
  { id: 'dub',      icon: '🌐', labelKey: 'lab.mode.dub' },
]

function VideoOverlay({
  asset,
  onClose,
  onCaption,
  dict,
}: {
  asset: Asset
  onClose: () => void
  onCaption: (asset: Asset) => void
  dict: any
}) {
  const [slideIn, setSlideIn] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setSlideIn(true))
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  function handleClose() {
    setSlideIn(false)
    setTimeout(onClose, 300)
  }

  const licenseColor = asset.license === 'public' ? GREEN : asset.license === 'embeddable' ? GOLD : '#f87171'
  const licenseLabel = asset.license === 'public' 
    ? `🟢 ${t(dict, 'lab.license.public', uiCopy('u_1bbbdab8600f1e35'))}` 
    : asset.license === 'embeddable' 
    ? `🟡 ${t(dict, 'lab.license.embeddable', uiCopy('u_60fd0dfa32aa2f9b'))}` 
    : `🔴 ${t(dict, 'lab.license.restricted', uiCopy('u_84e6385f3da5685b'))}`

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) handleClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(2, 3, 6, 0.9)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <div style={{
        width: '100%', maxWidth: 600,
        background: 'rgba(10, 14, 26, 0.95)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '24px 24px 0 0',
        padding: '16px 20px 40px',
        transform: slideIn ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.35s cubic-bezier(0.32,0.72,0,1)',
        maxHeight: '94vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <div style={{ width: 40, height: 4, background: 'rgba(255,255,255,0.2)', borderRadius: 999 }} />
        </div>
        <button onClick={handleClose} style={{ position: 'absolute', top: 16, right: 20, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '50%', width: 32, height: 32, color: '#fff', cursor: 'pointer', fontSize: 14 }} aria-label={uiCopy('u_269ba42bf9f9c2aa')}>✕</button>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <div style={{ width: 220, background: '#030407', borderRadius: 32, border: '1px solid rgba(255,255,255,0.12)', overflow: 'hidden', boxShadow: '0 24px 50px -12px rgba(0,0,0,0.7)' }}>
            <div style={{ background: '#0a0b12', height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 60, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 4 }} />
            </div>
            <div style={{ aspectRatio: '9/16', background: '#04060a', position: 'relative', overflow: 'hidden' }}>
              <iframe src={asset.embedUrl} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title={asset.title} />
            </div>
            <div style={{ background: '#0a0b12', height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 48, height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 999 }} />
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{asset.title}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>{asset.source === 'youtube' ? uiCopy('u_ac0c7f53bcefe6d5') : uiCopy('u_a6000da4e87f6980')}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, padding: '6px 16px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: licenseColor, fontFamily: 'monospace' }}>{licenseLabel}</div>
        </div>
        <div style={{ background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 12, padding: '14px 16px', marginBottom: 16, fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7 }}>
          <div style={{ fontWeight: 700, color: 'rgba(255,255,255,0.8)', marginBottom: 6, fontFamily: 'monospace', fontSize: 12 }}>// {t(dict, 'lab.captionInfo.title', uiCopy('u_88473fabccfd0278'))}</div>
          {t(dict, 'lab.captionInfo.description', uiCopy('u_4cf33def4320ddd3'))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={() => { onCaption(asset); handleClose() }} style={{ width: '100%', padding: '14px', borderRadius: 10, background: GOLD, color: '#000', fontWeight: 800, fontSize: 15, border: 'none', cursor: 'pointer' }}>
            💬 {t(dict, 'lab.generateSubtitles', uiCopy('u_70982ed025f1000e'))}
          </button>
          {asset.watchUrl && (
            <a href={asset.watchUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'block', width: '100%', padding: '14px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontWeight: 700, fontSize: 15, textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box' }}>
              ↗ {t(dict, 'lab.openOriginal', uiCopy('u_e218d799588b1393'))} {asset.source === 'youtube' ? uiCopy('u_06daaccfccb5a243') : uiCopy('u_7916192fbe7613da')}
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function GeneratePanel({
  prompt, uploadedFiles, onCreditsChange, dict,
}: {
  prompt: string
  uploadedFiles: UploadedFile[]
  onCreditsChange: (n: number) => void
  dict: any
}) {
  const firstImage = uploadedFiles.find(f => f.type.startsWith('image/'))
  const [vmode, setVmode] = useState<'text' | 'image'>(firstImage ? 'image' : 'text')
  const [selectedFormat, setSelectedFormat] = useState<'9:16' | '16:9' | '1:1'>('9:16')
  const [script, setScript] = useState(prompt)
  const [status, setStatus] = useState<'idle' | 'submitting' | 'rendering' | 'done' | 'failed'>('idle')
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const pollRef = useRef<any>(null)

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  function pollStatus(requestId: string, model: string) {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/video-status', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ request_id: requestId, model }),
        })
        const data = await res.json()
        if (data.status === 'done' && data.videoUrl) {
          clearInterval(pollRef.current)
          setVideoUrl(data.videoUrl)
          setStatus('done')
        } else if (data.status === 'failed') {
          clearInterval(pollRef.current)
          setStatus('failed')
          setErrorMsg(t(dict, 'lab.genFailed', uiCopy('u_df1d568cecdbad1c')))
        }
        // otherwise keep polling (rendering)
      } catch {
        // transient — keep polling
      }
    }, 5000)
  }

  async function handleGenerate() {
    setErrorMsg(null)
    setVideoUrl(null)
    setStatus('submitting')

    try {
      let imageDataUri: string | undefined
      if (vmode === 'image') {
        if (!firstImage?.file) {
          setStatus('idle')
          setErrorMsg(t(dict, 'lab.needImage', uiCopy('u_154c591bb45b1ca5')))
          return
        }
        imageDataUri = await fileToDataUri(firstImage.file)
      }

      const res = await fetch('/api/video-generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: vmode,
          prompt: script,
          imageDataUri,
          aspectRatio: selectedFormat,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setStatus('failed')
        setErrorMsg(data.error || t(dict, 'lab.genFailed', uiCopy('u_8d7c4270d78b5c1b')))
        return
      }

      if (typeof data.remaining === 'number') onCreditsChange(data.remaining)
      setStatus('rendering')
      pollStatus(data.request_id, data.model)
    } catch (err: any) {
      setStatus('failed')
      setErrorMsg(err.message || t(dict, 'lab.genFailed', uiCopy('u_9d505cd7a31e0e47')))
    }
  }

  const busy = status === 'submitting' || status === 'rendering'
return (
    <div style={{ background: 'rgba(20, 28, 50, 0.75)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: 12, padding: 22, marginBottom: 20, backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <div style={{ width: 38, height: 38, borderRadius: 8, background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🪄</div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', fontFamily: 'monospace' }}>{t(dict, 'lab.videoSynthesis', uiCopy('u_cc92e30481430dcb'))}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>{uiCopy('u_81d727a4649790b2')}{selectedFormat}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, background: 'rgba(4, 5, 11, 0.7)', padding: 6, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', marginBottom: 16 }}>
        {([uiCopy('u_469878998667aee3'), uiCopy('u_670ea7f3b9524243')] as const).map(vm => (
          <button key={vm} onClick={() => setVmode(vm)} disabled={busy} style={{ flex: 1, padding: '10px 8px', borderRadius: 6, fontSize: 12, fontFamily: 'monospace', fontWeight: 700, border: 'none', cursor: busy ? 'default' : 'pointer', background: vmode === vm ? 'rgba(59,130,246,0.25)' : 'transparent', color: vmode === vm ? '#fff' : '#7a90b8' }}>
            {vm === 'text' ? `📝 ${t(dict, 'lab.textToVideo', uiCopy('u_4c2d3839bb9a46dd'))}` : `🖼️ ${t(dict, 'lab.imageToVideo', uiCopy('u_af712a48978fa9da'))}`}
          </button>
        ))}
      </div>

      {vmode === 'image' && (
        <div style={{ marginBottom: 16, fontSize: 12, fontFamily: 'monospace', color: firstImage ? GREEN : 'rgba(255,195,0,0.9)' }}>
          {firstImage
            ? `🖼️ ${t(dict, 'lab.usingImage', uiCopy('u_4e3b411f092856d0'))}: ${firstImage.name}`
            : `⚠️ ${t(dict, 'lab.attachImagePrompt', uiCopy('u_825847ee78fb1ae3'))}`}
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 8, fontFamily: 'monospace' }}>[{vmode === 'image' ? t(dict, 'lab.motionPrompt', uiCopy('u_10420b84e8555631')) : t(dict, 'lab.videoPrompt', uiCopy('u_1addbb79cc348bfc'))}]</label>
        <textarea value={script} onChange={e => setScript(e.target.value)} rows={4} placeholder={vmode === 'image' ? t(dict, 'lab.motionPlaceholder', uiCopy('u_4333bf6aaacbd987')) : t(dict, 'lab.promptPlaceholder', uiCopy('u_4f2cace6fb471a65'))} style={{ width: '100%', background: 'rgba(4, 5, 11, 0.9)', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14, fontFamily: 'monospace', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 8, fontFamily: 'monospace' }}>[{t(dict, 'lab.aspectRatio', uiCopy('u_8cecd2e4e001fc6f'))}]</label>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['9:16', '16:9', '1:1'] as const).map(f => (
            <button key={f} onClick={() => setSelectedFormat(f)} disabled={busy} style={{ flex: 1, padding: '10px 0', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: selectedFormat === f ? 'rgba(59,130,246,0.3)' : 'rgba(4, 5, 11, 0.6)', color: selectedFormat === f ? '#fff' : 'rgba(255,255,255,0.5)', fontSize: 12, fontFamily: 'monospace', fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>{f}</button>
          ))}
        </div>
      </div>

      {status === 'rendering' && (
        <div style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 8, padding: '14px 16px', marginBottom: 16, fontSize: 13, fontFamily: 'monospace', color: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(59,130,246,0.4)', borderTopColor: BLUE, borderRadius: '50%', animation: 'lab-spin 0.9s linear infinite' }} />
          {t(dict, 'lab.renderingNote', uiCopy('u_e8be2dce06875da6'))}
        </div>
      )}

      {errorMsg && (
        <div style={{ background: 'rgba(255,195,0,0.06)', border: '1px solid rgba(255,195,0,0.3)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 12, fontFamily: 'monospace', color: 'rgba(255,195,0,0.95)' }}>
          {errorMsg}
        </div>
      )}

      {status === 'done' && videoUrl && (
        <div style={{ marginBottom: 16 }}>
          <video src={videoUrl} controls autoPlay loop style={{ width: '100%', borderRadius: 10, background: '#000', maxHeight: 360 }} />
          <a href={videoUrl} download target="_blank" rel="noopener noreferrer" style={{ display: 'block', marginTop: 10, width: '100%', padding: '12px', borderRadius: 8, background: GREEN, color: '#000', fontWeight: 800, fontSize: 14, textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box', fontFamily: 'monospace' }}>
            ⬇ {t(dict, 'lab.downloadVideo', uiCopy('u_67350029773a441c'))}
          </a>
        </div>
      )}

      <button onClick={handleGenerate} disabled={busy} style={{ width: '100%', padding: '14px', borderRadius: 8, background: busy ? 'rgba(255,255,255,0.04)' : status === 'done' ? 'rgba(74,222,128,0.12)' : GOLD, border: status === 'done' ? '1px solid rgba(74,222,128,0.35)' : 'none', color: busy ? 'rgba(255,255,255,0.4)' : status === 'done' ? GREEN : '#000', fontFamily: 'monospace', fontWeight: 800, fontSize: 14, cursor: busy ? 'default' : 'pointer', transition: 'all 0.15s' }}>
        {status === 'submitting' ? `⏳ ${t(dict, 'lab.submitting', uiCopy('u_7fd24de77197c0fa'))}` : status === 'rendering' ? `⏳ ${t(dict, 'lab.rendering', uiCopy('u_d4f1f7e999d95de9'))}` : status === 'done' ? `✓ ${t(dict, 'lab.generateAnother', uiCopy('u_ba522e70c280e0b0'))}` : `⚡ ${t(dict, 'lab.generateVideo', uiCopy('u_0f19ea88e153ee8d'))} (1 ${t(dict, 'lab.credit', uiCopy('u_e0742f18f9b7240a'))})`}
      </button>
    </div>
  )
}

function LabScene() {
  return (
    <div className="lab-scene" aria-hidden="true">
      <div className="lab-floor" />

      <div className="lab-scr lab-scr-left">
        <div className="lab-scr-head">{uiCopy('u_5d35a46bfc5b5fc7')}</div>
        <div className="lab-codeline"><span /><span /></div>
        <div className="lab-codeline"><span /><span /><span /></div>
        <div className="lab-codeline"><span /></div>
        <div className="lab-codeline"><span /><span /></div>
        <div className="lab-bargraph"><i /><i /><i /><i /><i /><i /></div>
      </div>

      <div className="lab-scr lab-scr-right">
        <div className="lab-scr-head">{uiCopy('u_22268109427ed227')}</div>
        <div className="lab-codeline"><span /><span /></div>
        <div className="lab-codeline"><span /></div>
        <div className="lab-codeline"><span /><span /><span /></div>
        <div className="lab-wave"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
      </div>

      <div className="lab-cables"><span /><span /><span /></div>

      <div className="lab-bench">
        <div className="lab-bench-top" />
        <div className="lab-leds"><i /><i /><i /><i /><i /><i /><i /><i /></div>
        <div className="lab-vent lab-v1" /><div className="lab-vent lab-v2" /><div className="lab-vent lab-v3" /><div className="lab-vent lab-v4" />
      </div>

      <div className="lab-chamber">
        <div className="lab-holo">{uiCopy('u_b7e959869d81572a')}</div>
        <div className="lab-cap-top" />
        <div className="lab-glass">
          <div className="lab-bubbles"><span /><span /><span /><span /></div>
          <div className="lab-specimen-glow" />
          <div className="lab-specimen" />
          <div className="lab-ring lab-r1" />
          <div className="lab-ring lab-r2" />
        </div>
        <div className="lab-cap-base" />
        <div className="lab-base-glow" />
      </div>
    </div>
  )
}

export default function LabPage() {
  const { dict } = useI18n()
  const [mode, setMode] = useState<Mode>('auto')
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [intentText, setIntentText] = useState('')
  const [results, setResults] = useState<VideoResult[]>([])
  const [generateData, setGenerateData] = useState<GenerateData | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [assets, setAssets] = useState<Asset[]>([])
  const [overlayAsset, setOverlayAsset] = useState<Asset | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [project, setProject] = useState(t(dict, 'lab.defaultProject', uiCopy('u_44561c5c4742e887')))
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [credits, setCredits] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/credits')
      .then(r => r.json())
      .then(d => { if (typeof d.credits === 'number') setCredits(d.credits) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items
      if (!items) return

      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const file = item.getAsFile()
          if (file) {
            const newFile: UploadedFile = {
              id: `${Date.now()}-${Math.random()}`,
              name: `pasted-image-${Date.now()}.png`,
              size: file.size,
              type: file.type,
              preview: URL.createObjectURL(file),
              file,
            }
            setUploadedFiles(prev => [...prev, newFile])
          }
        }
      }
    }

    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [])

  function reset() {
    setPrompt('')
    setHasSearched(false)
    setResults([])
    setGenerateData(null)
    setIntentText('')
    setMessage(null)
    setMode('auto')
    setUploadedFiles([])
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    const newFiles: UploadedFile[] = files.map(file => ({
      id: `${Date.now()}-${Math.random()}`,
      name: file.name,
      size: file.size,
      type: file.type,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      file,
    }))
    setUploadedFiles(prev => [...prev, ...newFiles])
  }

  function removeFile(id: string) {
    setUploadedFiles(prev => prev.filter(f => f.id !== id))
  }

  async function runSearch(overridePrompt?: string) {
    const q = (overridePrompt ?? prompt).trim()
    if (!q) return
    setPrompt(q)
    setLoading(true)
    setHasSearched(true)
    setResults([])
    setGenerateData(null)
    setMessage(null)
    setIntentText(t(dict, 'lab.evaluating', uiCopy('u_c3581e764fcee240')))
    try {
      const res = await fetch('/api/video-search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: q, mode }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t(dict, 'lab.searchFailed', uiCopy('u_a9fa2f424112e920')))
      setIntentText(data.intent ?? '')
      setMessage(data.message ?? null)
      if (data.mode === 'generate' && data.generate) {
        setGenerateData(data.generate)
        setResults([])
      } else {
        setResults(data.results ?? [])
        setGenerateData(null)
      }
    } catch (err: any) {
      setIntentText('')
      setMessage(err.message ?? t(dict, 'lab.somethingWrong', uiCopy('u_b551ebb04a0e6dcf')))
    } finally {
      setLoading(false)
    }
  }

  function addAsset(result: VideoResult) {
    if (result.license === 'restricted') return
    if (assets.find(a => a.id === result.id)) return
    setAssets(prev => [...prev, {
      id: result.id, title: result.title, source: result.source,
      embedUrl: result.embedUrl, watchUrl: result.watchUrl,
      license: result.license, addedAt: new Date().toISOString(),
    }])
  }

  function openOverlay(result: VideoResult) {
    if (result.license === 'restricted') return
    setOverlayAsset({
      id: result.id, title: result.title, source: result.source,
      embedUrl: result.embedUrl, watchUrl: result.watchUrl,
      license: result.license, addedAt: new Date().toISOString(),
    })
  }

  function handleCaption(asset: Asset) {
    addAsset({ ...asset, description: '', duration: '', durationSeconds: 0, thumbnail: '', licenseLabel: '' } as any)
    window.location.href = '/dashboard/video'
  }

  const licenseColor = (l: string) => l === 'public' ? GREEN : l === 'embeddable' ? GOLD : '#f87171'
  const licenseBg = (l: string) => l === 'public' ? 'rgba(74,222,128,0.08)' : l === 'embeddable' ? 'rgba(255,195,0,0.08)' : 'rgba(239,68,68,0.06)'

  const SUGGESTIONS = [
    { label: t(dict, 'lab.suggestion1', uiCopy('u_12f43a51c596b3d6')), prompt: uiCopy('u_eca69a43e5c46f5a') },
    { label: t(dict, 'lab.suggestion2', uiCopy('u_ae128ab3668bb2ef')), prompt: uiCopy('u_2fc24a77362287b7') },
    { label: t(dict, 'lab.suggestion3', uiCopy('u_a9ab46d97342542c')), prompt: uiCopy('u_01fe8e370e7ad67b') },
    { label: t(dict, 'lab.suggestion4', uiCopy('u_a54450e7e7172d55')), prompt: uiCopy('u_56f90a776cd0aeb4') },
    { label: t(dict, 'lab.suggestion5', uiCopy('u_1f1553ad1d33d3b8')), prompt: uiCopy('u_48103a287fa92ee1') },
    { label: t(dict, 'lab.suggestion6', uiCopy('u_9513c1540031eb12')), prompt: uiCopy('u_450fc94119c64d3e') },
  ]

  return (
    <>
      <LabScene />

      <div style={{ color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: 1300, margin: '0 auto', padding: '24px 20px', position: 'relative', zIndex: 1 }}>

        {overlayAsset && (
          <VideoOverlay asset={overlayAsset} onClose={() => setOverlayAsset(null)} onCaption={handleCaption} dict={dict} />
        )}

        <style>{uiCopy('u_0acdd0576a58c76d')}</style>

        <div className="fathom-glass terminal-text" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px', borderRadius: 8, marginBottom: 28, fontSize: 12, color: '#7a90b8', letterSpacing: '0.05em' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: GREEN, filter: 'drop-shadow(0 0 4px #4ade80)' }}>●</span> {t(dict, 'lab.status', uiCopy('u_66417d54ed2e9ace'))}: <span style={{ color: '#fff' }}>{t(dict, 'lab.online', uiCopy('u_c6ef47a147e2b7f3'))}</span>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <span>[{t(dict, 'lab.videoCredits', uiCopy('u_f24b24301fbff155'))}: <span style={{ color: GOLD }}>{credits === null ? '—' : credits}</span>]</span>
            <span>[{t(dict, 'lab.compute', uiCopy('u_783bdae232d01cc0'))}: <span style={{ color: BLUE }}>{t(dict, 'lab.active', uiCopy('u_6d5003d4925ab9df'))}</span>]</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start' }}>

          <div>
            <div className="fathom-glass" style={{ borderRadius: 16, padding: '32px', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                <div>
                  <h1 className="terminal-text" style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: '#fff' }}>{t(dict, 'lab.title', uiCopy('u_a208572c184be8a7'))}</h1>
                  <p style={{ fontSize: 14, color: '#7a90b8', marginTop: 6, lineHeight: 1.6 }}>{t(dict, 'lab.subtitle', uiCopy('u_80e4651bd1c0c13a'))}</p>
                </div>
              </div>
              <div style={{ background: 'rgba(4, 5, 11, 0.9)', border: '1px solid rgba(59, 130, 246, 0.4)', borderRadius: 10, padding: '8px', display: 'flex', gap: 6, alignItems: 'center', marginBottom: 20, boxShadow: 'inset 0 4px 12px rgba(0,0,0,0.5)' }}>
                <span className="terminal-text" style={{ color: BLUE, paddingLeft: 12, fontWeight: 700, fontSize: 16 }}>$</span>
                <input ref={inputRef} value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={e => e.key === 'Enter' && runSearch()} placeholder={t(dict, 'lab.placeholder', uiCopy('u_70c5a0ca72dd216b'))} className="terminal-text" style={{ flex: 1, background: 'transparent', border: 'none', padding: '12px 8px', color: '#fff', fontSize: 15, outline: 'none' }} />
                <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} style={{ display: 'none' }} accept="image/*,.pdf,.doc,.docx,.txt" />
                <button onClick={() => fileInputRef.current?.click()} className="terminal-text" style={{ padding: '10px 14px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  📎 <span style={{ fontSize: 11 }}>{t(dict, 'lab.attach', uiCopy('u_2fd3706da486aaf4'))}</span>
                </button>
                {hasSearched && (
                  <button onClick={reset} className="terminal-text" style={{ padding: '10px 16px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)', fontSize: 12, cursor: 'pointer' }}>{t(dict, 'lab.abort', uiCopy('u_584fd5b35e667ffb'))}</button>
                )}
                <button onClick={() => runSearch()} disabled={loading || !prompt.trim()} className="terminal-text" style={{ padding: '12px 22px', borderRadius: 6, background: prompt.trim() && !loading ? BLUE : 'rgba(255,255,255,0.03)', color: prompt.trim() && !loading ? '#fff' : 'rgba(255,255,255,0.3)', fontWeight: 700, fontSize: 12, border: 'none', cursor: prompt.trim() && !loading ? 'pointer' : 'default', filter: prompt.trim() && !loading ? 'drop-shadow(0 0 8px rgba(59,130,246,0.4))' : 'none' }}>
                  {loading ? t(dict, 'lab.compiling', uiCopy('u_1db9a623553ea14c')) : t(dict, 'lab.runPrompt', uiCopy('u_992909fd92ebc437'))}
                </button>
              </div>

              {uploadedFiles.length > 0 && (
                <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {uploadedFiles.map(file => (
                    <div key={file.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 6, fontSize: 12 }}>
                      {file.preview && <img src={file.preview} alt={file.name} style={{ width: 24, height: 24, objectFit: 'cover', borderRadius: 4 }} />}
                      <span style={{ color: 'rgba(255,255,255,0.7)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>({Math.round(file.size / 1024)}{uiCopy('u_6b5bc02d46b905e3')}</span>
                      <button onClick={() => removeFile(file.id)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: '0 4px', fontSize: 14 }}>✕</button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: 6, background: 'rgba(4, 5, 11, 0.7)', padding: 8, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}>
                {MODES.map(m => (
                  <button key={m.id} onClick={() => setMode(m.id)} className="terminal-text" style={{ flex: 1, padding: '12px 8px', borderRadius: 6, fontSize: 12, border: 'none', cursor: 'pointer', background: mode === m.id ? 'rgba(59,130,246,0.25)' : 'transparent', color: mode === m.id ? '#fff' : '#7a90b8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.15s', fontWeight: mode === m.id ? 700 : 500 }}>
                    <span style={{ color: mode === m.id ? BLUE : 'inherit' }}>{m.icon}</span>
                    <span>{t(dict, m.labelKey, m.id.toUpperCase()).replace(' ', '_')}</span>
                  </button>
                ))}
              </div>
            </div>

            {intentText && (
              <div className="terminal-text" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 10, marginBottom: 20, fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>
                <span style={{ color: BLUE, fontWeight: 700 }}>▶ {t(dict, 'lab.agentReasoning', uiCopy('u_5bb0b5796c6fb6dd'))}:</span>
                <span>{intentText}</span>
              </div>
            )}

            {message && (
              <div className="terminal-text" style={{ padding: '14px 18px', background: 'rgba(255,195,0,0.04)', border: '1px solid rgba(255,195,0,0.25)', borderRadius: 10, fontSize: 13, color: 'rgba(255,195,0,0.9)', marginBottom: 20 }}>
                ⚠️ [{t(dict, 'lab.warnConstraints', uiCopy('u_7cbf019407beeab5'))}] {message}
              </div>
            )}

            {loading && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14, marginBottom: 24 }}>
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="fathom-glass" style={{ borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ aspectRatio: '9/16', background: 'rgba(255,255,255,0.03)' }} />
                    <div style={{ padding: 12 }}>
                      <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, marginBottom: 6 }} />
                      <div style={{ height: 6, width: '40%', background: 'rgba(255,255,255,0.03)', borderRadius: 4 }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {generateData && !loading && (
              <GeneratePanel prompt={prompt} uploadedFiles={uploadedFiles} onCreditsChange={setCredits} dict={dict} />
            )}

            {results.length > 0 && !loading && (
              <div style={{ marginBottom: 32 }}>
                <div className="terminal-text" style={{ fontSize: 12, fontWeight: 700, color: '#7a90b8', letterSpacing: '0.08em', marginBottom: 14 }}>
                  // {t(dict, 'lab.generatedMatrix', uiCopy('u_61c270ad12f1cc73'))}: {results.length} {t(dict, 'lab.nodesDetected', uiCopy('u_7a8b76a23ac5d051'))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
                  {results.map(result => {
                    const isRestricted = result.license === 'restricted'
                    return (
                      <div key={result.id} onClick={() => !isRestricted && openOverlay(result)}
                        style={{ borderRadius: 12, overflow: 'hidden', background: 'rgba(8, 10, 20, 0.7)', border: '1px solid rgba(59, 130, 246, 0.25)', cursor: isRestricted ? 'default' : 'pointer', transition: 'all 0.2s', opacity: isRestricted ? 0.4 : 1 }}
                        onMouseEnter={e => { if (!isRestricted) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = 'rgba(59,130,246,0.6)' } }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.25)' }}
                      >
                        <div style={{ aspectRatio: '9/16', background: '#030407', position: 'relative', overflow: 'hidden' }}>
                          {result.thumbnail
                            ? <img src={result.thumbnail} alt={result.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                            : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, opacity: 0.15 }}>🎬</div>
                          }
                          {isRestricted && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🔒</div>}
                          <div style={{ position: 'absolute', top: 6, left: 6 }}>
                            <div className="terminal-text" style={{ fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 4, background: licenseBg(result.license), color: licenseColor(result.license), border: `1px solid ${licenseColor(result.license)}33` }}>{result.license.toUpperCase()}</div>
                          </div>
                          <div style={{ position: 'absolute', top: 6, right: 6 }}>
                            <div className="terminal-text" style={{ fontSize: 10, padding: '3px 6px', borderRadius: 4, background: 'rgba(0,0,0,0.7)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.15)' }}>{result.source === 'youtube' ? uiCopy('u_485059de5bb38c82') : uiCopy('u_c570fe304f881313')}</div>
                          </div>
                          <div className="terminal-text" style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(0,0,0,0.8)', color: '#fff', fontSize: 10, padding: '3px 6px', borderRadius: 4 }}>{result.duration}</div>
                        </div>
                        <div style={{ padding: 10, background: 'rgba(4, 5, 11, 0.5)' }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.4, marginBottom: 8, height: 33 }}>{result.title}</div>
                          {isRestricted
                            ? <div className="terminal-text" style={{ fontSize: 10, color: '#f87171' }}>{t(dict, 'lab.restrictedNode', uiCopy('u_483b504592d86bc7'))}</div>
                            : <button onClick={e => { e.stopPropagation(); addAsset(result) }} className="terminal-text" style={{ width: '100%', fontSize: 11, padding: '6px 0', borderRadius: 4, border: `1px solid rgba(255,255,255,0.2)`, background: assets.find(a => a.id === result.id) ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.03)', color: assets.find(a => a.id === result.id) ? GREEN : 'rgba(255,255,255,0.7)', cursor: 'pointer' }}>
                                {assets.find(a => a.id === result.id) ? `✓ ${t(dict, 'lab.pipeline', uiCopy('u_35a895f3fac90a3b'))}` : `+ ${t(dict, 'lab.inject', uiCopy('u_aad5df3ca5d26acb'))}`}
                              </button>
                          }
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {!hasSearched && !loading && (
              <div style={{ textAlign: 'center', padding: '90px 20px', position: 'relative' }}>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                  <div style={{ width: 220, height: 220, background: 'radial-gradient(circle, rgba(59,130,246,0.18) 0%, transparent 70%)', animation: 'pulse-slow 4s infinite ease-in-out' }} />
                </div>
                <div style={{ fontSize: 54, marginBottom: 16, animation: 'pulse-slow 4s infinite ease-in-out' }}>🧬</div>
                <div className="terminal-text" style={{ fontSize: 15, fontWeight: 700, color: '#7a90b8', letterSpacing: '0.15em', marginBottom: 10 }}>{t(dict, 'lab.synthesisCore', uiCopy('u_4170b2d228411d40'))}</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7, maxWidth: 420, margin: '0 auto' }}>
                  {t(dict, 'lab.awaitingDirectives', uiCopy('u_a573d0d6d167dc73'))}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="fathom-glass" style={{ borderRadius: 14, padding: 20 }}>
              <div className="terminal-text" style={{ fontSize: 12, color: '#7a90b8', marginBottom: 14, fontWeight: 700 }}>// {t(dict, 'lab.coreScope', uiCopy('u_114d5cf98cff0d7e'))}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span className="terminal-text" style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{t(dict, 'lab.targetProjectId', uiCopy('u_e28dfb5b72315379'))}:</span>
                <input value={project} onChange={e => setProject(e.target.value)} className="terminal-text" style={{ background: 'rgba(4, 5, 11, 0.9)', border: '1px solid rgba(59, 130, 246, 0.35)', borderRadius: 6, padding: '12px 14px', color: GOLD, fontSize: 14, width: '100%', boxSizing: 'border-box', outline: 'none', fontWeight: 700 }} />
              </div>
            </div>

            {!hasSearched && (
              <div className="fathom-glass" style={{ borderRadius: 14, padding: 20 }}>
                <div className="terminal-text" style={{ fontSize: 12, color: '#7a90b8', marginBottom: 16, fontWeight: 700 }}>// {t(dict, 'lab.recipeTemplates', uiCopy('u_f4a99d289ed36938'))}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {SUGGESTIONS.map(s => (
                    <button key={s.label} onClick={() => runSearch(s.prompt)} className="terminal-text recipe-node" style={{ width: '100%', textAlign: 'left', padding: '12px 14px', borderRadius: 6, fontSize: 12, color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>
                      <span style={{ color: BLUE, marginRight: 6 }}>$</span> {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {assets.length > 0 && (
              <div className="fathom-glass" style={{ borderRadius: 14, padding: 20, borderLeft: `3px solid ${BLUE}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div className="terminal-text" style={{ fontSize: 12, color: '#fff', fontWeight: 700 }}>{t(dict, 'lab.pipelineStaging', uiCopy('u_f88b0f6298b70c50'))} ({assets.length})</div>
                  <button onClick={() => setAssets([])} className="terminal-text" style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>{t(dict, 'lab.purgeAll', uiCopy('u_603b95ae31937b18'))}</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {assets.map(asset => (
                    <div key={asset.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '10px', borderRadius: 6, background: 'rgba(4, 5, 11, 0.6)', border: '1px solid rgba(59, 130, 246, 0.25)', fontSize: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                        <span style={{ color: BLUE }}>⚡</span>
                        <span className="terminal-text" style={{ color: 'rgba(255,255,255,0.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.title}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button onClick={() => window.location.href = '/dashboard/video'} className="terminal-text" style={{ fontSize: 10, padding: '4px 8px', borderRadius: 4, border: '1px solid rgba(59,130,246,0.35)', background: 'rgba(59,130,246,0.12)', color: BLUE, cursor: 'pointer' }}>{t(dict, 'lab.run', uiCopy('u_506af85633053780'))}</button>
                        <button onClick={() => setAssets(prev => prev.filter(a => a.id !== asset.id))} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
