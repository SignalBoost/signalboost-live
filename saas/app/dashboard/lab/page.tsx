'use client'
import { useState, useRef, useEffect } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

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
}

const MODES: { id: Mode; icon: string; label: string }[] = [
  { id: 'auto',     icon: '✦',  label: 'Auto' },
  { id: 'search',   icon: '🔍', label: 'Find footage' },
  { id: 'generate', icon: '🪄', label: 'Generate video' },
  { id: 'caption',  icon: '💬', label: 'Add captions' },
  { id: 'dub',      icon: '🌐', label: 'Dub audio' },
]

const SUGGESTIONS = [
  { label: 'Last goal of Pelé', prompt: 'show me the last goal of Pelé' },
  { label: 'Moon landing 1969', prompt: 'moon landing footage 1969 NASA' },
  { label: 'Churchill WWII speech', prompt: 'Churchill We shall fight speech 1940' },
  { label: 'Create podcast ad in Spanish', prompt: 'create a 30-second ad for my podcast in Spanish' },
  { label: 'Berlin Wall fall 1989', prompt: 'Berlin Wall fall 1989 footage' },
  { label: 'Create TikTok promo', prompt: 'create a TikTok-style promo video for my website' },
]

function VideoOverlay({
  asset,
  onClose,
  onCaption,
}: {
  asset: Asset
  onClose: () => void
  onCaption: (asset: Asset) => void
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
  const licenseLabel = asset.license === 'public' ? '🟢 Public domain' : asset.license === 'embeddable' ? '🟡 Freely embeddable' : '🔴 Rights-restricted'

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
        <button onClick={handleClose} style={{ position: 'absolute', top: 16, right: 20, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '50%', width: 32, height: 32, color: '#fff', cursor: 'pointer', fontSize: 14 }} aria-label="Close">✕</button>
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
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>{asset.source === 'youtube' ? 'YOUTUBE_STREAM' : 'ARCHIVE_CORE'}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, padding: '6px 16px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: licenseColor, fontFamily: 'monospace' }}>{licenseLabel}</div>
        </div>
        <div style={{ background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 12, padding: '14px 16px', marginBottom: 16, fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7 }}>
          <div style={{ fontWeight: 700, color: 'rgba(255,255,255,0.8)', marginBottom: 6, fontFamily: 'monospace', fontSize: 12 }}>// LAB_DIAGNOSTICS: CAPTION_AUTOMATION</div>
          The AI will transcribe the original audio (detecting the spoken language automatically), then translate the transcript into your chosen languages and generate subtitle files (SRT, VTT, ASS) you can download and use anywhere.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={() => { onCaption(asset); handleClose() }} style={{ width: '100%', padding: '14px', borderRadius: 10, background: GOLD, color: '#000', fontWeight: 800, fontSize: 15, border: 'none', cursor: 'pointer' }}>
            💬 Generate subtitles in 5 languages
          </button>
          {asset.watchUrl && (
            <a href={asset.watchUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'block', width: '100%', padding: '14px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontWeight: 700, fontSize: 15, textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box' }}>
              ↗ Open original on {asset.source === 'youtube' ? 'YouTube' : 'Archive.org'}
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

function GeneratePanel({
  data, prompt, onGenerated,
}: {
  data: GenerateData
  prompt: string
  onGenerated: (asset: Asset) => void
}) {
  const [selectedAvatar, setSelectedAvatar] = useState(data.avatars[0]?.id ?? '')
  const [selectedFormat, setSelectedFormat] = useState<'9:16' | '16:9' | '1:1'>((data.format as '9:16' | '16:9' | '1:1') ?? '9:16')
  const [script, setScript] = useState(data.script)
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState(false)

  async function handleGenerate() {
    if (!data.heygenReady) {
      alert('HeyGen API key not configured yet. Add HEYGEN_API_KEY to Vercel environment variables to enable video generation.')
      return
    }
    setGenerating(true)
    await new Promise(r => setTimeout(r, 2000))
    setGenerating(false)
    setGenerated(true)
    onGenerated({ id: `gen-${Date.now()}`, title: prompt.slice(0, 60), source: 'youtube', embedUrl: '', watchUrl: '', license: 'public', addedAt: new Date().toISOString() })
  }

  return (
    <div style={{ background: 'rgba(20, 28, 50, 0.75)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: 12, padding: 22, marginBottom: 20, backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <div style={{ width: 38, height: 38, borderRadius: 8, background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🪄</div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', fontFamily: 'monospace' }}>VIDEO_SYNTHESIS_UNIT</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>AVATAR_ENGINE · {data.estimatedCost} · {selectedFormat}</div>
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 8, fontFamily: 'monospace' }}>[INPUT_SCRIPT]</label>
        <textarea value={script} onChange={e => setScript(e.target.value)} rows={4} style={{ width: '100%', background: 'rgba(4, 5, 11, 0.9)', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14, fontFamily: 'monospace', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 8, fontFamily: 'monospace' }}>[AVATAR_NODE]</label>
          <select value={selectedAvatar} onChange={e => setSelectedAvatar(e.target.value)} style={{ width: '100%', background: 'rgba(4, 5, 11, 0.9)', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: 6, padding: '10px 14px', color: '#fff', fontSize: 13, fontFamily: 'monospace' }}>
            {data.avatars.map(a => <option key={a.id} value={a.id} style={{ background: '#060913' }}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 8, fontFamily: 'monospace' }}>[ASPECT_RATIO]</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['9:16', '16:9', '1:1'] as const).map(f => (
              <button key={f} onClick={() => setSelectedFormat(f)} style={{ flex: 1, padding: '10px 0', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: selectedFormat === f ? 'rgba(59,130,246,0.3)' : 'rgba(4, 5, 11, 0.6)', color: selectedFormat === f ? '#fff' : 'rgba(255,255,255,0.5)', fontSize: 12, fontFamily: 'monospace', fontWeight: 700, cursor: 'pointer' }}>{f}</button>
            ))}
          </div>
        </div>
      </div>
      {!data.heygenReady && (
        <div style={{ background: 'rgba(255,195,0,0.04)', border: '1px solid rgba(255,195,0,0.2)', borderRadius: 8, padding: '12px 16px', fontSize: 12, color: 'rgba(255,195,0,0.9)', marginBottom: 16, fontFamily: 'monospace' }}>
          CRITICAL: HEYGEN_API_KEY environment node unconfigured.
        </div>
      )}
      <button onClick={handleGenerate} disabled={generating || generated} style={{ width: '100%', padding: '14px', borderRadius: 8, background: generated ? 'rgba(74,222,128,0.12)' : generating ? 'rgba(255,255,255,0.04)' : GOLD, border: generated ? '1px solid rgba(74,222,128,0.35)' : 'none', color: generated ? GREEN : generating ? 'rgba(255,255,255,0.4)' : '#000', fontFamily: 'monospace', fontWeight: 800, fontSize: 14, cursor: generating || generated ? 'default' : 'pointer', transition: 'all 0.15s' }}>
        {generated ? '✓ RENDER_COMPLETE — Verified in Tray' : generating ? '⏳ PIPELINE_COMPILING...' : `⚡ INITIALIZE_SYNTHESIS · ${data.estimatedCost}`}
      </button>
    </div>
  )
}

function LabScene() {
  return (
    <div className="lab-scene" aria-hidden="true">
      <div className="lab-floor" />

      <div className="lab-scr lab-scr-left">
        <div className="lab-scr-head">AGENT_854 // ANALYSIS</div>
        <div className="lab-codeline"><span /><span /></div>
        <div className="lab-codeline"><span /><span /><span /></div>
        <div className="lab-codeline"><span /></div>
        <div className="lab-codeline"><span /><span /></div>
        <div className="lab-bargraph"><i /><i /><i /><i /><i /><i /></div>
      </div>

      <div className="lab-scr lab-scr-right">
        <div className="lab-scr-head">GENERATION_STREAM [14/22]</div>
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
        <div className="lab-holo">TARGET_LOCKED</div>
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
  useI18n()
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
  const [project, setProject] = useState('My project')
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    setIntentText('Evaluating neural constraints...')
    try {
      const res = await fetch('/api/video-search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: q, mode }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Search failed')
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
      setMessage(err.message ?? 'Something went wrong')
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

  return (
    <>
      <LabScene />

      <div style={{ color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: 1300, margin: '0 auto', padding: '24px 20px', position: 'relative', zIndex: 1 }}>

        {overlayAsset && (
          <VideoOverlay asset={overlayAsset} onClose={() => setOverlayAsset(null)} onCaption={handleCaption} />
        )}

        <style>{`
          body {
            background-color: #0a0e1a !important;
            background-image:
              radial-gradient(ellipse 50% 45% at 50% 40%, rgba(0, 200, 255, 0.12) 0%, transparent 62%),
              radial-gradient(ellipse 90% 50% at 50% 100%, rgba(20, 15, 60, 0.85) 0%, transparent 72%),
              radial-gradient(ellipse 100% 60% at 50% 0%, rgba(10, 10, 40, 0.85) 0%, transparent 80%),
              linear-gradient(180deg, #08090f 0%, #0c0f18 45%, #080a10 100%) !important;
            background-attachment: fixed !important;
          }
          .fathom-glass {
            background: rgba(18, 26, 45, 0.75) !important;
            backdrop-filter: blur(30px) !important;
            -webkit-backdrop-filter: blur(30px) !important;
            border: 1px solid rgba(59, 130, 246, 0.3) !important;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6) !important;
          }
          .recipe-node {
            background: rgba(8, 10, 20, 0.5) !important;
            border: 1px solid rgba(255, 255, 255, 0.08) !important;
            transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
          }
          .recipe-node:hover {
            background: rgba(20, 28, 50, 0.8) !important;
            border-color: rgba(59, 130, 246, 0.5) !important;
            transform: translateY(-1px);
          }
          .terminal-text {
            font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace !important;
          }
          @keyframes pulse-slow {
            0%, 100% { opacity: 0.3; transform: scale(1); filter: drop-shadow(0 0 10px rgba(59,130,246,0.3)); }
            50% { opacity: 0.7; transform: scale(1.1); filter: drop-shadow(0 0 25px rgba(59,130,246,0.6)); }
          }

          .lab-scene {
            position: fixed; inset: 0; z-index: 0;
            pointer-events: none; overflow: hidden;
            font-family: 'JetBrains Mono', 'Courier New', monospace;
          }
          .lab-floor {
            position: absolute; left: 0; right: 0; bottom: 0; height: 42%;
            background: linear-gradient(180deg, transparent 0%, rgba(0,90,150,0.08) 60%, rgba(0,120,200,0.12) 100%);
            background-image: repeating-linear-gradient(90deg, transparent, transparent 70px, rgba(0,180,255,0.05) 70px, rgba(0,180,255,0.05) 71px);
          }
          .lab-scr {
            position: absolute; bottom: 22%; width: 170px; height: 168px;
            border-radius: 10px; background: rgba(10,18,35,0.8);
            border: 1px solid rgba(70,130,200,0.35);
            box-shadow: 0 0 30px rgba(0,150,255,0.15), inset 0 0 24px rgba(0,120,255,0.1);
            padding: 12px; overflow: hidden; opacity: 0.6;
          }
          .lab-scr-left { left: 4%; transform: perspective(700px) rotateY(20deg); }
          .lab-scr-right { right: 4%; transform: perspective(700px) rotateY(-20deg); }
          .lab-scr-head { font-size: 9px; color: #5cc8ff; letter-spacing: 0.05em; margin-bottom: 9px; text-shadow: 0 0 6px rgba(0,180,255,0.5); }
          .lab-codeline { display: flex; gap: 4px; margin-bottom: 7px; }
          .lab-codeline span { height: 4px; border-radius: 2px; background: rgba(0,180,255,0.35); animation: lab-type 3s ease-in-out infinite; }
          .lab-codeline span:nth-child(1) { width: 44px; }
          .lab-codeline span:nth-child(2) { width: 26px; }
          .lab-codeline span:nth-child(3) { width: 16px; }
          .lab-codeline:nth-child(3) span { animation-delay: -0.5s; }
          .lab-codeline:nth-child(4) span { animation-delay: -1s; }
          .lab-codeline:nth-child(5) span { animation-delay: -1.5s; }
          .lab-bargraph { display: flex; align-items: flex-end; gap: 5px; height: 46px; margin-top: 12px; }
          .lab-bargraph i { flex: 1; background: linear-gradient(180deg,#5cc8ff,#0a6cff); border-radius: 2px; box-shadow: 0 0 6px rgba(0,180,255,0.5); animation: lab-eq 1.4s ease-in-out infinite; }
          .lab-bargraph i:nth-child(odd) { animation-delay: -0.4s; }
          .lab-bargraph i:nth-child(3n) { animation-delay: -0.8s; }
          .lab-wave { display: flex; align-items: center; gap: 3px; height: 50px; margin-top: 14px; }
          .lab-wave i { flex: 1; background: #5cc8ff; border-radius: 2px; box-shadow: 0 0 5px rgba(0,180,255,0.5); animation: lab-eq 1.1s ease-in-out infinite; }
          .lab-wave i:nth-child(even) { animation-delay: -0.3s; }
          .lab-wave i:nth-child(3n) { animation-delay: -0.6s; }
          .lab-wave i:nth-child(4n) { animation-delay: -0.9s; }
          .lab-cables { position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 340px; height: 90px; }
          .lab-cables span { position: absolute; top: -4px; width: 2px; background: rgba(70,130,200,0.5); border-radius: 0 0 4px 4px; }
          .lab-cables span:nth-child(1) { left: 30%; height: 72px; }
          .lab-cables span:nth-child(2) { left: 50%; height: 56px; }
          .lab-cables span:nth-child(3) { left: 68%; height: 84px; }
          .lab-cables span::after { content: ''; position: absolute; bottom: -3px; left: -2px; width: 6px; height: 6px; border-radius: 50%; background: #33c8ff; box-shadow: 0 0 8px rgba(0,200,255,0.8); animation: pulse-slow 3s ease-in-out infinite; }
          .lab-bench { position: absolute; left: 50%; bottom: 10%; transform: translateX(-50%); width: 460px; height: 90px; }
          .lab-bench-top { position: absolute; top: 0; left: 0; right: 0; height: 18px; border-radius: 8px; background: linear-gradient(180deg, rgba(35,55,90,0.95), rgba(15,20,35,0.98)); border: 1px solid rgba(80,140,210,0.3); box-shadow: 0 0 30px rgba(0,160,255,0.15); }
          .lab-leds { position: absolute; top: 5px; left: 22px; display: flex; gap: 11px; }
          .lab-leds i { width: 5px; height: 5px; border-radius: 50%; background: #33c8ff; box-shadow: 0 0 6px rgba(0,200,255,0.8); animation: lab-blink 2s ease-in-out infinite; }
          .lab-leds i:nth-child(2n) { background: #4ade80; box-shadow: 0 0 6px rgba(74,222,128,0.8); animation-delay: -0.4s; }
          .lab-leds i:nth-child(3n) { background: #ffc300; box-shadow: 0 0 6px rgba(255,195,0,0.8); animation-delay: -0.8s; }
          .lab-leds i:nth-child(5n) { animation-delay: -1.2s; }
          .lab-vent { position: absolute; top: 28px; width: 74px; height: 5px; border-radius: 3px; background: rgba(0,170,255,0.2); box-shadow: 0 0 10px rgba(0,170,255,0.4); }
          .lab-v1 { left: 26px; } .lab-v2 { left: 128px; } .lab-v3 { right: 128px; } .lab-v4 { right: 26px; }
          .lab-chamber { position: absolute; left: 50%; bottom: calc(10% + 16px); transform: translateX(-50%); width: 150px; height: 240px; }
          .lab-holo { position: absolute; top: -26px; left: 50%; transform: translateX(-50%); font-size: 9px; color: #5cc8ff; letter-spacing: 0.1em; padding: 3px 9px; border: 1px solid rgba(0,180,255,0.35); border-radius: 4px; background: rgba(0,120,255,0.08); text-shadow: 0 0 6px rgba(0,180,255,0.6); white-space: nowrap; animation: pulse-slow 3s ease-in-out infinite; }
          .lab-cap-top { position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 96px; height: 20px; border-radius: 8px 8px 4px 4px; background: linear-gradient(180deg, rgba(70,105,160,0.95), rgba(25,35,65,0.95)); border: 1px solid rgba(90,150,220,0.35); box-shadow: 0 0 16px rgba(0,170,255,0.3); }
          .lab-glass { position: absolute; top: 18px; left: 50%; transform: translateX(-50%); width: 104px; height: 196px; border-radius: 14px; background: linear-gradient(100deg, rgba(150,225,255,0.12) 0%, rgba(0,150,255,0.06) 40%, rgba(120,200,255,0.15) 100%); border: 1px solid rgba(120,200,255,0.35); box-shadow: inset 0 0 30px rgba(0,180,255,0.2), 0 0 40px rgba(0,170,255,0.2); overflow: hidden; }
          .lab-specimen { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); width: 64px; height: 64px; border-radius: 50%; background: radial-gradient(circle at 40% 35%, #bdf6ff 0%, #33c8ff 35%, #0a78ff 72%, #062a4d 100%); box-shadow: 0 0 40px 12px rgba(0,200,255,0.6); animation: lab-float 5s ease-in-out infinite, pulse-slow 4s ease-in-out infinite; }
          .lab-specimen-glow { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); width: 130px; height: 130px; border-radius: 50%; background: radial-gradient(circle, rgba(0,200,255,0.3) 0%, transparent 65%); animation: pulse-slow 4s ease-in-out infinite; }
          .lab-ring { position: absolute; top: 50%; left: 50%; border-radius: 50%; border: 1px solid rgba(120,225,255,0.6); }
          .lab-r1 { width: 82px; height: 82px; transform: translate(-50%,-50%); animation: lab-spin 9s linear infinite; border-top-color: rgba(170,240,255,0.95); }
          .lab-r2 { width: 104px; height: 104px; transform: translate(-50%,-50%); animation: lab-spin 16s linear infinite reverse; border-left-color: rgba(80,160,255,0.8); }
          .lab-bubbles span { position: absolute; bottom: 0; width: 4px; height: 4px; border-radius: 50%; background: rgba(170,240,255,0.8); box-shadow: 0 0 6px rgba(0,200,255,0.7); }
          .lab-bubbles span:nth-child(1) { left: 30px; animation: lab-rise 4s linear infinite; }
          .lab-bubbles span:nth-child(2) { left: 54px; animation: lab-rise 5.5s linear infinite; animation-delay: -2s; }
          .lab-bubbles span:nth-child(3) { left: 70px; animation: lab-rise 4.8s linear infinite; animation-delay: -1s; }
          .lab-bubbles span:nth-child(4) { left: 44px; animation: lab-rise 6s linear infinite; animation-delay: -3s; }
          .lab-cap-base { position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); width: 120px; height: 26px; border-radius: 6px; background: linear-gradient(180deg, rgba(60,85,135,0.95), rgba(15,25,50,0.98)); border: 1px solid rgba(90,150,220,0.35); box-shadow: 0 0 20px rgba(0,170,255,0.35); }
          .lab-base-glow { position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%); width: 170px; height: 24px; border-radius: 50%; background: radial-gradient(ellipse, rgba(0,200,255,0.45) 0%, transparent 70%); filter: blur(4px); animation: pulse-slow 4s ease-in-out infinite; }
          @keyframes lab-float { 0%,100% { margin-top: 0; } 50% { margin-top: -10px; } }
          @keyframes lab-spin { to { transform: translate(-50%,-50%) rotate(360deg); } }
          @keyframes lab-rise { 0% { bottom: 0; opacity: 0; } 10% { opacity: 1; } 100% { bottom: 186px; opacity: 0; } }
          @keyframes lab-eq { 0%,100% { height: 30%; } 50% { height: 100%; } }
          @keyframes lab-blink { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }
          @keyframes lab-type { 0%,100% { opacity: 0.3; } 50% { opacity: 0.9; } }
          @media (max-width: 900px) {
            .lab-scr { display: none; }
          }
        `}</style>

        <div className="fathom-glass terminal-text" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px', borderRadius: 8, marginBottom: 28, fontSize: 12, color: '#7a90b8', letterSpacing: '0.05em' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: GREEN, filter: 'drop-shadow(0 0 4px #4ade80)' }}>●</span> SIGNALBOOST_FOUNDRY // STATUS: <span style={{ color: '#fff' }}>ONLINE</span>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <span>[SYSTEM_LOAD: <span style={{ color: GOLD }}>14%</span>]</span>
            <span>[COMPUTE: <span style={{ color: BLUE }}>ACTIVE</span>]</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start' }}>

          <div>
            <div className="fathom-glass" style={{ borderRadius: 16, padding: '32px', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                <div>
                  <h1 className="terminal-text" style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: '#fff' }}>CORE_ENGINE // The Lab</h1>
                  <p style={{ fontSize: 14, color: '#7a90b8', marginTop: 6, lineHeight: 1.6 }}>Synthesize parameters: footage parsing, generative avatar streaming, audio dub orchestration.</p>
                </div>
              </div>
              <div style={{ background: 'rgba(4, 5, 11, 0.9)', border: '1px solid rgba(59, 130, 246, 0.4)', borderRadius: 10, padding: '8px', display: 'flex', gap: 6, alignItems: 'center', marginBottom: 20, boxShadow: 'inset 0 4px 12px rgba(0,0,0,0.5)' }}>
                <span className="terminal-text" style={{ color: BLUE, paddingLeft: 12, fontWeight: 700, fontSize: 16 }}>$</span>
                <input ref={inputRef} value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={e => e.key === 'Enter' && runSearch()} placeholder='Injection query... e.g., "create a 30s ad in Spanish" or "show me last goal of Pelé"' className="terminal-text" style={{ flex: 1, background: 'transparent', border: 'none', padding: '12px 8px', color: '#fff', fontSize: 15, outline: 'none' }} />
                <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} style={{ display: 'none' }} accept="image/*,.pdf,.doc,.docx,.txt" />
                <button onClick={() => fileInputRef.current?.click()} className="terminal-text" style={{ padding: '10px 14px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  📎 <span style={{ fontSize: 11 }}>ATTACH</span>
                </button>
                {hasSearched && (
                  <button onClick={reset} className="terminal-text" style={{ padding: '10px 16px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)', fontSize: 12, cursor: 'pointer' }}>ABORT</button>
                )}
                <button onClick={() => runSearch()} disabled={loading || !prompt.trim()} className="terminal-text" style={{ padding: '12px 22px', borderRadius: 6, background: prompt.trim() && !loading ? BLUE : 'rgba(255,255,255,0.03)', color: prompt.trim() && !loading ? '#fff' : 'rgba(255,255,255,0.3)', fontWeight: 700, fontSize: 12, border: 'none', cursor: prompt.trim() && !loading ? 'pointer' : 'default', filter: prompt.trim() && !loading ? 'drop-shadow(0 0 8px rgba(59,130,246,0.4))' : 'none' }}>
                  {loading ? 'COMPILING...' : 'RUN_PROMPT'}
                </button>
              </div>

              {uploadedFiles.length > 0 && (
                <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {uploadedFiles.map(file => (
                    <div key={file.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 6, fontSize: 12 }}>
                      {file.preview && <img src={file.preview} alt={file.name} style={{ width: 24, height: 24, objectFit: 'cover', borderRadius: 4 }} />}
                      <span style={{ color: 'rgba(255,255,255,0.7)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>({Math.round(file.size / 1024)}KB)</span>
                      <button onClick={() => removeFile(file.id)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: '0 4px', fontSize: 14 }}>✕</button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: 6, background: 'rgba(4, 5, 11, 0.7)', padding: 8, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}>
                {MODES.map(m => (
                  <button key={m.id} onClick={() => setMode(m.id)} className="terminal-text" style={{ flex: 1, padding: '12px 8px', borderRadius: 6, fontSize: 12, border: 'none', cursor: 'pointer', background: mode === m.id ? 'rgba(59,130,246,0.25)' : 'transparent', color: mode === m.id ? '#fff' : '#7a90b8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.15s', fontWeight: mode === m.id ? 700 : 500 }}>
                    <span style={{ color: mode === m.id ? BLUE : 'inherit' }}>{m.icon}</span>
                    <span>{m.label.toUpperCase().replace(' ', '_')}</span>
                  </button>
                ))}
              </div>
            </div>

            {intentText && (
              <div className="terminal-text" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 10, marginBottom: 20, fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>
                <span style={{ color: BLUE, fontWeight: 700 }}>▶ AGENT_REASONING:</span>
                <span>{intentText}</span>
              </div>
            )}

            {message && (
              <div className="terminal-text" style={{ padding: '14px 18px', background: 'rgba(255,195,0,0.04)', border: '1px solid rgba(255,195,0,0.25)', borderRadius: 10, fontSize: 13, color: 'rgba(255,195,0,0.9)', marginBottom: 20 }}>
                ⚠️ [WARN_CONSTRAINTS] {message}
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
              <GeneratePanel data={generateData} prompt={prompt} onGenerated={asset => addAsset(asset as any)} />
            )}

            {results.length > 0 && !loading && (
              <div style={{ marginBottom: 32 }}>
                <div className="terminal-text" style={{ fontSize: 12, fontWeight: 700, color: '#7a90b8', letterSpacing: '0.08em', marginBottom: 14 }}>
                  // GENERATED_MATRIX: {results.length} NODES_DETECTED
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
                            <div className="terminal-text" style={{ fontSize: 10, padding: '3px 6px', borderRadius: 4, background: 'rgba(0,0,0,0.7)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.15)' }}>{result.source === 'youtube' ? 'YT' : 'ARC'}</div>
                          </div>
                          <div className="terminal-text" style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(0,0,0,0.8)', color: '#fff', fontSize: 10, padding: '3px 6px', borderRadius: 4 }}>{result.duration}</div>
                        </div>
                        <div style={{ padding: 10, background: 'rgba(4, 5, 11, 0.5)' }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.4, marginBottom: 8, height: 33 }}>{result.title}</div>
                          {isRestricted
                            ? <div className="terminal-text" style={{ fontSize: 10, color: '#f87171' }}>RESTRICTED_NODE</div>
                            : <button onClick={e => { e.stopPropagation(); addAsset(result) }} className="terminal-text" style={{ width: '100%', fontSize: 11, padding: '6px 0', borderRadius: 4, border: `1px solid rgba(255,255,255,0.2)`, background: assets.find(a => a.id === result.id) ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.03)', color: assets.find(a => a.id === result.id) ? GREEN : 'rgba(255,255,255,0.7)', cursor: 'pointer' }}>
                                {assets.find(a => a.id === result.id) ? '✓ PIPELINE' : '+ INJECT'}
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
                <div className="terminal-text" style={{ fontSize: 15, fontWeight: 700, color: '#7a90b8', letterSpacing: '0.15em', marginBottom: 10 }}>SYNTHESIS_CONTAINMENT_CORE</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7, maxWidth: 420, margin: '0 auto' }}>
                  Awaiting algorithmic prompt directives. Streamed footage inputs from archival nodes and vector avatar nodes will consolidate here.
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="fathom-glass" style={{ borderRadius: 14, padding: 20 }}>
              <div className="terminal-text" style={{ fontSize: 12, color: '#7a90b8', marginBottom: 14, fontWeight: 700 }}>// CORE_SCOPE</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span className="terminal-text" style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>TARGET_PROJECT_ID:</span>
                <input value={project} onChange={e => setProject(e.target.value)} className="terminal-text" style={{ background: 'rgba(4, 5, 11, 0.9)', border: '1px solid rgba(59, 130, 246, 0.35)', borderRadius: 6, padding: '12px 14px', color: GOLD, fontSize: 14, width: '100%', boxSizing: 'border-box', outline: 'none', fontWeight: 700 }} />
              </div>
            </div>

            {!hasSearched && (
              <div className="fathom-glass" style={{ borderRadius: 14, padding: 20 }}>
                <div className="terminal-text" style={{ fontSize: 12, color: '#7a90b8', marginBottom: 16, fontWeight: 700 }}>// RECIPE_TEMPLATES</div>
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
                  <div className="terminal-text" style={{ fontSize: 12, color: '#fff', fontWeight: 700 }}>PIPELINE_STAGING ({assets.length})</div>
                  <button onClick={() => setAssets([])} className="terminal-text" style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>PURGE_ALL</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {assets.map(asset => (
                    <div key={asset.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '10px', borderRadius: 6, background: 'rgba(4, 5, 11, 0.6)', border: '1px solid rgba(59, 130, 246, 0.25)', fontSize: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                        <span style={{ color: BLUE }}>⚡</span>
                        <span className="terminal-text" style={{ color: 'rgba(255,255,255,0.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.title}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button onClick={() => window.location.href = '/dashboard/video'} className="terminal-text" style={{ fontSize: 10, padding: '4px 8px', borderRadius: 4, border: '1px solid rgba(59,130,246,0.35)', background: 'rgba(59,130,246,0.12)', color: BLUE, cursor: 'pointer' }}>RUN</button>
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
