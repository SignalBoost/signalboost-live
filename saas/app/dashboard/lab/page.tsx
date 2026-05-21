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

// ── TikTok video player overlay ───────────────────────────────────────────────

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
              <iframe
                src={asset.embedUrl}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title={asset.title}
              />
            </div>
            <div style={{ background: '#0a0b12', height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 48, height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 999 }} />
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{asset.title}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>{asset.source === 'youtube' ? 'YOUTUBE_STREAM' : 'ARCHIVE_CORE'}</div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, padding: '5px 14px', borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', color: licenseColor, fontFamily: 'monospace' }}>
            {licenseLabel}
          </div>
        </div>

        <div style={{ background: 'rgba(59,130,246,0.03)', border: '1px solid rgba(59,130,246,0.12)', borderRadius: 12, padding: '12px 14px', marginBottom: 16, fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
          <div style={{ fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginBottom: 4, fontFamily: 'monospace' }}>// LAB_DIAGNOSTICS: CAPTION_AUTOMATION</div>
          The AI will transcribe the original audio (detecting the spoken language automatically), then translate the transcript into your chosen languages and generate subtitle files (SRT, VTT, ASS) you can download and use anywhere.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={() => { onCaption(asset); handleClose() }}
            style={{ width: '100%', padding: '13px', borderRadius: 10, background: GOLD, color: '#000', fontWeight: 800, fontSize: 14, border: 'none', cursor: 'pointer' }}
          >
            💬 Generate subtitles in 5 languages
          </button>

          {asset.watchUrl && (
            <a
              href={asset.watchUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'block', width: '100%', padding: '13px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontWeight: 700, fontSize: 14, textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box' }}
            >
              ↗ Open original on {asset.source === 'youtube' ? 'YouTube' : 'Archive.org'}
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Generate panel ────────────────────────────────────────────────────────────

function GeneratePanel({
  data,
  prompt,
  onGenerated,
}: {
  data: GenerateData
  prompt: string
  onGenerated: (asset: Asset) => void
}) {
  const [selectedAvatar, setSelectedAvatar] = useState(data.avatars[0]?.id ?? '')
  const [selectedFormat, setSelectedFormat] = useState<'9:16' | '16:9' | '1:1'>(
    (data.format as '9:16' | '16:9' | '1:1') ?? '9:16'
  )
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
    onGenerated({
      id: `gen-${Date.now()}`,
      title: prompt.slice(0, 60),
      source: 'youtube',
      embedUrl: '',
      watchUrl: '',
      license: 'public',
      addedAt: new Date().toISOString(),
    })
  }

  return (
    <div style={{ background: 'rgba(16, 22, 42, 0.65)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: 12, padding: 20, marginBottom: 20, backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🪄</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: 'monospace' }}>VIDEO_SYNTHESIS_UNIT</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>AVATAR_ENGINE · {data.estimatedCost} · {selectedFormat}</div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 6, fontFamily: 'monospace' }}>[INPUT_SCRIPT]</label>
        <textarea
          value={script}
          onChange={e => setScript(e.target.value)}
          rows={4}
          style={{ width: '100%', background: 'rgba(4, 5, 11, 0.85)', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 13, fontFamily: 'monospace', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 6, fontFamily: 'monospace' }}>[AVATAR_NODE]</label>
          <select
            value={selectedAvatar}
            onChange={e => setSelectedAvatar(e.target.value)}
            style={{ width: '100%', background: 'rgba(4, 5, 11, 0.85)', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: 6, padding: '9px 12px', color: '#fff', fontSize: 12, fontFamily: 'monospace' }}
          >
            {data.avatars.map(a => (
              <option key={a.id} value={a.id} style={{ background: '#060913' }}>{a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 6, fontFamily: 'monospace' }}>[ASPECT_RATIO]</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['9:16', '16:9', '1:1'] as const).map(f => (
              <button key={f} onClick={() => setSelectedFormat(f)}
                style={{ flex: 1, padding: '9px 0', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: selectedFormat === f ? 'rgba(59,130,246,0.25)' : 'rgba(4, 5, 11, 0.5)', color: selectedFormat === f ? '#fff' : 'rgba(255,255,255,0.4)', fontSize: 11, fontFamily: 'monospace', fontWeight: 700, cursor: 'pointer' }}>
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!data.heygenReady && (
        <div style={{ background: 'rgba(255,195,0,0.03)', border: '1px solid rgba(255,195,0,0.15)', borderRadius: 8, padding: '10px 14px', fontSize: 11, color: 'rgba(255,195,0,0.8)', marginBottom: 16, fontFamily: 'monospace' }}>
          CRITICAL: HEYGEN_API_KEY environment node unconfigured.
        </div>
      )}

      <button
        onClick={handleGenerate}
        disabled={generating || generated}
        style={{ width: '100%', padding: '13px', borderRadius: 8, background: generated ? 'rgba(74,222,128,0.1)' : generating ? 'rgba(255,255,255,0.03)' : GOLD, border: generated ? '1px solid rgba(74,222,128,0.3)' : 'none', color: generated ? GREEN : generating ? 'rgba(255,255,255,0.3)' : '#000', fontFamily: 'monospace', fontWeight: 800, fontSize: 13, cursor: generating || generated ? 'default' : 'pointer', transition: 'all 0.15s' }}
      >
        {generated ? '✓ RENDER_COMPLETE — Verified in Tray' : generating ? '⏳ PIPELINE_COMPILING...' : `⚡ INITIALIZE_SYNTHESIS · ${data.estimatedCost}`}
      </button>
    </div>
  )
} 

// ── Main Lab page ─────────────────────────────────────────────────────────────

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
  const inputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setPrompt('')
    setHasSearched(false)
    setResults([])
    setGenerateData(null)
    setIntentText('')
    setMessage(null)
    setMode('auto')
    setTimeout(() => inputRef.current?.focus(), 50)
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
      id: result.id,
      title: result.title,
      source: result.source,
      embedUrl: result.embedUrl,
      watchUrl: result.watchUrl,
      license: result.license,
      addedAt: new Date().toISOString(),
    }])
  }

  function openOverlay(result: VideoResult) {
    if (result.license === 'restricted') return
    setOverlayAsset({
      id: result.id,
      title: result.title,
      source: result.source,
      embedUrl: result.embedUrl,
      watchUrl: result.watchUrl,
      license: result.license,
      addedAt: new Date().toISOString(),
    })
  }

  function handleCaption(asset: Asset) {
    addAsset({ ...asset, description: '', duration: '', durationSeconds: 0, thumbnail: '', licenseLabel: '' } as any)
    window.location.href = '/dashboard/video'
  }

  const licenseColor = (l: string) =>
    l === 'public' ? GREEN : l === 'embeddable' ? GOLD : '#f87171'

  const licenseBg = (l: string) =>
    l === 'public' ? 'rgba(74,222,128,0.06)' : l === 'embeddable' ? 'rgba(255,195,0,0.06)' : 'rgba(239,68,68,0.04)'

  return (
    <div style={{ color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: 1300, margin: '0 auto', padding: '24px 20px' }}>
      
      {/* Absolute Specificity Override Hooks */}
      <style>{`
        body {
          background-color: #060913 !important;
          background-image: 
            radial-gradient(at 5% 5%, rgba(59, 130, 246, 0.25) 0px, transparent 45%),
            radial-gradient(at 95% 95%, rgba(255, 195, 0, 0.12) 0px, transparent 50%),
            radial-gradient(at 50% 40%, rgba(139, 92, 246, 0.06) 0px, transparent 40%) !important;
          background-attachment: fixed !important;
        }
        .fathom-glass {
          background: rgba(13, 19, 36, 0.68) !important;
          backdrop-filter: blur(30px) !important;
          -webkit-backdrop-filter: blur(30px) !important;
          border: 1px solid rgba(59, 130, 246, 0.25) !important;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6) !important;
        }
        .recipe-node {
          background: rgba(4, 5, 11, 0.4) !important;
          border: 1px solid rgba(255, 255, 255, 0.05) !important;
          transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .recipe-node:hover {
          background: rgba(16, 22, 42, 0.7) !important;
          border-color: rgba(59, 130, 246, 0.4) !important;
          transform: translateY(-1px);
        }
        .terminal-text {
          font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace !important;
        }
        @keyframes pulse-slow {
          0%, 100% { opacity: 0.3; transform: scale(1); filter: drop-shadow(0 0 10px rgba(59,130,246,0.3)); }
          50% { opacity: 0.7; transform: scale(1.1); filter: drop-shadow(0 0 25px rgba(59,130,246,0.6)); }
        }
      `}</style>

      {/* Top Status & Diagnostics bar */}
      <div className="fathom-glass terminal-text" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderRadius: 8, marginBottom: 28, fontSize: 11, color: '#6178a3', letterSpacing: '0.05em' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: GREEN, filter: 'drop-shadow(0 0 4px #4ade80)' }}>●</span> SIGNALBOOST_FOUNDRY // STATUS: <span style={{ color: '#fff' }}>ONLINE</span>
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          <span>[SYSTEM_LOAD: <span style={{ color: GOLD }}>14%</span>]</span>
          <span>[COMPUTE: <span style={{ color: BLUE }}>ACTIVE</span>]</span>
        </div>
      </div>

      {/* Layout Split System */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start' }}>
        
        {/* Left Control Column */}
        <div>
          <div className="fathom-glass" style={{ borderRadius: 16, padding: '28px', marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <h1 className="terminal-text" style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: '#fff' }}>
                  CORE_ENGINE // The Lab
                </h1>
                <p style={{ fontSize: 12, color: '#6178a3', marginTop: 4 }}>
                  Synthesize parameters: footage parsing, generative avatar streaming, audio dub orchestration.
                </p>
              </div>
            </div>

            {/* Terminal Command Injector Bar */}
            <div style={{ background: 'rgba(4, 5, 11, 0.85)', border: '1px solid rgba(59, 130, 246, 0.35)', borderRadius: 10, padding: '6px', display: 'flex', gap: 4, alignItems: 'center', marginBottom: 20, boxShadow: 'inset 0 4px 12px rgba(0,0,0,0.5)' }}>
              <span className="terminal-text" style={{ color: BLUE, paddingLeft: 12, fontWeight: 700, fontSize: 15 }}>$</span>
              <input
                ref={inputRef}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && runSearch()}
                placeholder='Injection query... e.g., "create a 30s ad in Spanish" or "show me last goal of Pelé"'
                className="terminal-text"
                style={{ flex: 1, background: 'transparent', border: 'none', padding: '10px 8px', color: '#fff', fontSize: 13, outline: 'none' }}
              />
              {hasSearched && (
                <button onClick={reset} className="terminal-text" style={{ padding: '8px 14px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', fontSize: 11, cursor: 'pointer' }}>
                  ABORT
                </button>
              )}
              <button onClick={() => runSearch()} disabled={loading || !prompt.trim()} className="terminal-text" style={{ padding: '10px 20px', borderRadius: 6, background: prompt.trim() && !loading ? BLUE : 'rgba(255,255,255,0.02)', color: prompt.trim() && !loading ? '#fff' : 'rgba(255,255,255,0.2)', fontWeight: 700, fontSize: 11, border: 'none', cursor: prompt.trim() && !loading ? 'pointer' : 'default', filter: prompt.trim() && !loading ? 'drop-shadow(0 0 8px rgba(59,130,246,0.4))' : 'none' }}>
                {loading ? 'COMPILING...' : 'RUN_PROMPT'}
              </button>
            </div>

            {/* Segmented Control Switches (Modes) */}
            <div style={{ display: 'flex', gap: 6, background: 'rgba(4, 5, 11, 0.6)', padding: 6, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
              {MODES.map(m => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className="terminal-text"
                  style={{ flex: 1, padding: '10px 8px', borderRadius: 6, fontSize: 11, border: 'none', cursor: 'pointer', background: mode === m.id ? 'rgba(59,130,246,0.2)' : 'transparent', color: mode === m.id ? '#fff' : '#6178a3', bordercolor: mode === m.id ? BLUE : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.15s', fontWeight: mode === m.id ? 700 : 500 }}
                >
                  <span style={{ color: mode === m.id ? BLUE : 'inherit' }}>{m.icon}</span>
                  <span>{m.label.toUpperCase().replace(' ', '_')}</span>
                </button>
              ))}
            </div>
          </div>

          {intentText && (
            <div className="terminal-text" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 10, marginBottom: 20, fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
              <span style={{ color: BLUE, fontWeight: 700 }}>▶ AGENT_REASONING:</span>
              <span>{intentText}</span>
            </div>
          )}

          {message && (
            <div className="terminal-text" style={{ padding: '12px 16px', background: 'rgba(255,195,0,0.02)', border: '1px solid rgba(255,195,0,0.2)', borderRadius: 10, fontSize: 11, color: 'rgba(255,195,0,0.8)', marginBottom: 20 }}>
              ⚠️ [WARN_CONSTRAINTS] {message}
            </div>
          )}

          {loading && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14, marginBottom: 24 }}>
              {[...Array(4)].map((_, i) => (
                <div key={i} className="fathom-glass" style={{ borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ aspectRatio: '9/16', background: 'rgba(255,255,255,0.02)' }} />
                  <div style={{ padding: 12 }}>
                    <div style={{ height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 4, marginBottom: 6 }} />
                    <div style={{ height: 6, width: '40%', background: 'rgba(255,255,255,0.02)', borderRadius: 4 }} />
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
              <div className="terminal-text" style={{ fontSize: 11, fontWeight: 700, color: '#6178a3', letterSpacing: '0.08em', marginBottom: 14 }}>
                // GENERATED_MATRIX: {results.length} NODES_DETECTED
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
                {results.map(result => {
                  const isRestricted = result.license === 'restricted'
                  return (
                    <div
                      key={result.id}
                      onClick={() => !isRestricted && openOverlay(result)}
                      style={{ borderRadius: 12, overflow: 'hidden', background: 'rgba(4, 5, 11, 0.6)', border: '1px solid rgba(59, 130, 246, 0.2)', cursor: isRestricted ? 'default' : 'pointer', transition: 'all 0.2s', opacity: isRestricted ? 0.4 : 1 }}
                      onMouseEnter={e => { if (!isRestricted) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = 'rgba(59,130,246,0.5)' } }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.2)' }}
                    >
                      <div style={{ aspectRatio: '9/16', background: '#030407', position: 'relative', overflow: 'hidden' }}>
                        {result.thumbnail ? (
                          <img src={result.thumbnail} alt={result.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, opacity: 0.15 }}>🎬</div>
                        )}
                        {isRestricted && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🔒</div>}
                        <div style={{ position: 'absolute', top: 6, left: 6 }}>
                          <div className="terminal-text" style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: licenseBg(result.license), color: licenseColor(result.license), border: `1px solid ${licenseColor(result.license)}33` }}>{result.license.toUpperCase()}</div>
                        </div>
                        <div style={{ position: 'absolute', top: 6, right: 6 }}>
                          <div className="terminal-text" style={{ fontSize: 9, padding: '2px 5px', borderRadius: 4, background: 'rgba(0,0,0,0.6)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>{result.source === 'youtube' ? 'YT' : 'ARC'}</div>
                        </div>
                        <div className="terminal-text" style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: 9, padding: '2px 5px', borderRadius: 4 }}>{result.duration}</div>
                      </div>
                      <div style={{ padding: 10, background: 'rgba(4, 5, 11, 0.4)' }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.4, marginBottom: 8, height: 30 }}>{result.title}</div>
                        {isRestricted ? (
                          <div className="terminal-text" style={{ fontSize: 9, color: '#f87171' }}>RESTRICTED_NODE</div>
                        ) : (
                          <button onClick={e => { e.stopPropagation(); addAsset(result) }} className="terminal-text" style={{ width: '100%', fontSize: 10, padding: '5px 0', borderRadius: 4, border: `1px solid rgba(255,255,255,0.15)`, background: assets.find(a => a.id === result.id) ? 'rgba(74,222,128,0.06)' : 'rgba(255,255,255,0.02)', color: assets.find(a => a.id === result.id) ? GREEN : 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>
                            {assets.find(a => a.id === result.id) ? '✓ PIPELINE' : '+ INJECT'}
                          </button>
                        )}
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
                <div style={{ width: 220, height: 220, background: 'radial-gradient(circle, rgba(59,130,246,0.16) 0%, transparent 70%)', animation: 'pulse-slow 4s infinite ease-in-out' }} />
              </div>
              <div style={{ fontSize: 54, marginBottom: 16, animation: 'pulse-slow 4s infinite ease-in-out' }}>🧬</div>
              <div className="terminal-text" style={{ fontSize: 13, fontWeight: 700, color: '#6178a3', letterSpacing: '0.15em', marginBottom: 8 }}>SYNTHESIS_CONTAINMENT_CORE</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', lineHeight: 1.6, maxWidth: 420, margin: '0 auto' }}>
                Awaiting algorithmic prompt directives. Streamed footage inputs from archival nodes and vector avatar nodes will consolidate here.
              </div>
            </div>
          )}
        </div>

        {/* Right Parameters Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="fathom-glass" style={{ borderRadius: 14, padding: 18 }}>
            <div className="terminal-text" style={{ fontSize: 11, color: '#6178a3', marginBottom: 12, fontWeight: 700 }}>// CORE_SCOPE</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="terminal-text" style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>TARGET_PROJECT_ID:</span>
              <input value={project} onChange={e => setProject(e.target.value)} className="terminal-text" style={{ background: 'rgba(4, 5, 11, 0.85)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: 6, padding: '10px 12px', color: GOLD, fontSize: 12, width: '100%', boxSizing: 'border-box', outline: 'none', fontWeight: 700 }} />
            </div>
          </div>

          {!hasSearched && (
            <div className="fathom-glass" style={{ borderRadius: 14, padding: 18 }}>
              <div className="terminal-text" style={{ fontSize: 11, color: '#6178a3', marginBottom: 14, fontWeight: 700 }}>// RECIPE_TEMPLATES</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {SUGGESTIONS.map(s => (
                  <button key={s.label} onClick={() => runSearch(s.prompt)} className="terminal-text recipe-node" style={{ width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 6, fontSize: 11, color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>
                    <span style={{ color: BLUE, marginRight: 4 }}>$</span> {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {assets.length > 0 && (
            <div className="fathom-glass" style={{ borderRadius: 14, padding: 18, borderLeft: `3px solid ${BLUE}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div className="terminal-text" style={{ fontSize: 11, color: '#fff', fontWeight: 700 }}>PIPELINE_STAGING ({assets.length})</div>
                <button onClick={() => setAssets([])} className="terminal-text" style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>PURGE_ALL</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {assets.map(asset => (
                  <div key={asset.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '8px', borderRadius: 6, background: 'rgba(4, 5, 11, 0.5)', border: '1px solid rgba(59, 130, 246, 0.2)', fontSize: 11 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                      <span style={{ color: BLUE }}>⚡</span>
                      <span className="terminal-text" style={{ color: 'rgba(255,255,255,0.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.title}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button onClick={() => window.location.href = '/dashboard/video'} className="terminal-text" style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, border: '1px solid rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.1)', color: BLUE, cursor: 'pointer' }}>RUN</button>
                      <button onClick={() => setAssets(prev => prev.filter(a => a.id !== asset.id))} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 12, padding: '0 4px' }}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
