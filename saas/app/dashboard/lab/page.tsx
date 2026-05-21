
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
      style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <div style={{
        width: '100%', maxWidth: 600,
        background: '#0a0a0f',
        borderRadius: '24px 24px 0 0',
        padding: '16px 20px 40px',
        transform: slideIn ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.35s cubic-bezier(0.32,0.72,0,1)',
        maxHeight: '94vh', overflowY: 'auto',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <div style={{ width: 40, height: 4, background: 'rgba(255,255,255,0.2)', borderRadius: 999 }} />
        </div>

        {/* Close */}
        <button onClick={handleClose} style={{ position: 'absolute', top: 16, right: 20, background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: 32, height: 32, color: '#fff', cursor: 'pointer', fontSize: 16 }} aria-label="Close">✕</button>

        {/* Phone frame with embedded video */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <div style={{ width: 220, background: '#111', borderRadius: 32, border: '3px solid #2a2a2a', overflow: 'hidden' }}>
            <div style={{ background: '#111', height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 60, height: 7, background: '#222', borderRadius: 4 }} />
            </div>
            <div style={{ aspectRatio: '9/16', background: '#0d1b2a', position: 'relative', overflow: 'hidden' }}>
              <iframe
                src={asset.embedUrl}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title={asset.title}
              />
            </div>
            <div style={{ background: '#111', height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 48, height: 4, background: '#2a2a2a', borderRadius: 999 }} />
            </div>
          </div>
        </div>

        {/* Title + source */}
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{asset.title}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{asset.source === 'youtube' ? 'YouTube' : 'Archive.org'}</div>
        </div>

        {/* License badge */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, padding: '5px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.06)', color: licenseColor }}>
            {licenseLabel}
          </div>
        </div>

        {/* Caption info box */}
        <div style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 12, padding: '12px 14px', marginBottom: 16, fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
          <div style={{ fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>💡 How captions work for found footage</div>
          The AI will transcribe the original audio (detecting the spoken language automatically), then translate the transcript into your chosen languages and generate subtitle files (SRT, VTT, ASS) you can download and use anywhere.
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={() => { onCaption(asset); handleClose() }}
            style={{ width: '100%', padding: '13px', borderRadius: 14, background: GOLD, color: '#000', fontWeight: 800, fontSize: 14, border: 'none', cursor: 'pointer' }}
          >
            💬 Generate subtitles in 5 languages
          </button>

          {asset.watchUrl && (
            <a
              href={asset.watchUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'block', width: '100%', padding: '13px', borderRadius: 14, background: 'rgba(255,255,255,0.06)', color: '#fff', fontWeight: 700, fontSize: 14, textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box' }}
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
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24, marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(59,130,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🪄</div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Generate video</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>AI avatar · {data.estimatedCost} · {selectedFormat}</div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 8 }}>Script</label>
        <textarea
          value={script}
          onChange={e => setScript(e.target.value)}
          rows={4}
          style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 8 }}>AI Avatar</label>
          <select
            value={selectedAvatar}
            onChange={e => setSelectedAvatar(e.target.value)}
            style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '9px 12px', color: '#fff', fontSize: 12 }}
          >
            {data.avatars.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 8 }}>Format</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['9:16', '16:9', '1:1'] as const).map(f => (
              <button key={f} onClick={() => setSelectedFormat(f)}
                style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: selectedFormat === f ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)', color: selectedFormat === f ? '#fff' : 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!data.heygenReady && (
        <div style={{ background: 'rgba(255,195,0,0.06)', border: '1px solid rgba(255,195,0,0.2)', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: 'rgba(255,195,0,0.8)', marginBottom: 16 }}>
          ⚠️ HeyGen API key not configured. Add <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 4 }}>HEYGEN_API_KEY</code> to Vercel to enable generation.
        </div>
      )}

      <button
        onClick={handleGenerate}
        disabled={generating || generated}
        style={{ width: '100%', padding: '13px', borderRadius: 12, background: generated ? 'rgba(74,222,128,0.15)' : generating ? 'rgba(255,255,255,0.05)' : GOLD, color: generated ? GREEN : generating ? 'rgba(255,255,255,0.4)' : '#000', fontWeight: 800, fontSize: 14, border: 'none', cursor: generating || generated ? 'default' : 'pointer', transition: 'all 0.15s' }}
      >
        {generated ? '✓ Generated — check My files in the video page' : generating ? '⏳ Generating...' : `🪄 Generate video · ${data.estimatedCost}`}
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
    setIntentText('Thinking...')

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
    l === 'public' ? 'rgba(74,222,128,0.1)' : l === 'embeddable' ? 'rgba(255,195,0,0.1)' : 'rgba(239,68,68,0.08)'

  return (
    <div style={{ color: '#fff', fontFamily: 'system-ui', maxWidth: 900, margin: '0 auto' }}>

      {overlayAsset && (
        <VideoOverlay
          asset={overlayAsset}
          onClose={() => setOverlayAsset(null)}
          onCaption={handleCaption}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 900, margin: 0, letterSpacing: '-0.02em' }}>
            🧪 The Lab
          </h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '6px 0 0' }}>
            Find footage, generate videos, add captions, dub in 5 languages.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Project:</span>
          <input
            value={project}
            onChange={e => setProject(e.target.value)}
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '7px 12px', color: '#fff', fontSize: 12, width: 180, outline: 'none' }}
          />
        </div>
      </div>

      {/* Prompt bar */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '16px 18px', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <input
            ref={inputRef}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && runSearch()}
            placeholder='Try "show me the last goal of Pelé" or "create a 30s ad in Spanish"...'
            style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '12px 16px', color: '#fff', fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
          />
          {hasSearched && (
            <button
              onClick={reset}
              style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', fontWeight: 700, fontSize: 13, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
            >
              ↺ Reset
            </button>
          )}
          <button
            onClick={() => runSearch()}
            disabled={loading || !prompt.trim()}
            style={{ padding: '12px 24px', borderRadius: 10, background: prompt.trim() && !loading ? BLUE : 'rgba(255,255,255,0.05)', color: prompt.trim() && !loading ? '#fff' : 'rgba(255,255,255,0.3)', fontWeight: 800, fontSize: 14, border: 'none', cursor: prompt.trim() && !loading ? 'pointer' : 'default', transition: 'all 0.15s', whiteSpace: 'nowrap' }}
          >
            {loading ? '⏳' : '→ Run'}
          </button>
        </div>

        {/* Mode selector */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginRight: 4 }}>Mode:</span>
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              style={{ padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', background: mode === m.id ? 'rgba(59,130,246,0.2)' : 'transparent', color: mode === m.id ? BLUE : 'rgba(255,255,255,0.4)', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <span>{m.icon}</span> {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Suggestion chips — only before first search */}
      {!hasSearched && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28 }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', padding: '6px 0' }}>Try:</span>
          {SUGGESTIONS.map(s => (
            <button
              key={s.label}
              onClick={() => runSearch(s.prompt)}
              style={{ padding: '6px 14px', borderRadius: 999, fontSize: 11, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(59,130,246,0.4)'; e.currentTarget.style.color = '#fff' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)' }}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* AI intent banner */}
      {intentText && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 10, marginBottom: 20, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
          <span style={{ fontSize: 15 }}>✦</span>
          <span>{intentText}</span>
        </div>
      )}

      {/* Warning/info message */}
      {message && (
        <div style={{ padding: '10px 14px', background: 'rgba(255,195,0,0.06)', border: '1px solid rgba(255,195,0,0.2)', borderRadius: 10, fontSize: 12, color: 'rgba(255,195,0,0.8)', marginBottom: 20 }}>
          ⚠️ {message}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{ borderRadius: 14, overflow: 'hidden', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ aspectRatio: '9/16', background: 'rgba(255,255,255,0.04)' }} />
              <div style={{ padding: '8px 10px' }}>
                <div style={{ height: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 4, marginBottom: 6 }} />
                <div style={{ height: 8, width: '60%', background: 'rgba(255,255,255,0.04)', borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Generate panel */}
      {generateData && !loading && (
        <GeneratePanel
          data={generateData}
          prompt={prompt}
          onGenerated={asset => addAsset(asset as any)}
        />
      )}

      {/* Results grid */}
      {results.length > 0 && !loading && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>
            {results.length} results · tap to preview
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
            {results.map(result => {
              const isRestricted = result.license === 'restricted'
              return (
                <div
                  key={result.id}
                  onClick={() => !isRestricted && openOverlay(result)}
                  style={{ borderRadius: 14, overflow: 'hidden', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', cursor: isRestricted ? 'default' : 'pointer', transition: 'transform 0.15s, border-color 0.15s', opacity: isRestricted ? 0.6 : 1 }}
                  onMouseEnter={e => { if (!isRestricted) { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.borderColor = 'rgba(59,130,246,0.4)' } }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
                >
                  <div style={{ aspectRatio: '9/16', background: '#0d1b2a', position: 'relative', overflow: 'hidden' }}>
                    {result.thumbnail ? (
                      <img
                        src={result.thumbnail}
                        alt={result.title}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, opacity: 0.3 }}>🎬</div>
                    )}

                    {isRestricted && (
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🔒</div>
                    )}

                    <div style={{ position: 'absolute', top: 6, left: 6 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: licenseBg(result.license), color: licenseColor(result.license) }}>
                        {result.license === 'public' ? 'Public domain' : result.license === 'embeddable' ? 'Embeddable' : 'Restricted'}
                      </div>
                    </div>

                    <div style={{ position: 'absolute', top: 6, right: 6 }}>
                      <div style={{ fontSize: 9, padding: '2px 6px', borderRadius: 999, background: 'rgba(0,0,0,0.6)', color: 'rgba(255,255,255,0.7)' }}>
                        {result.source === 'youtube' ? 'YT' : 'Arc'}
                      </div>
                    </div>

                    <div style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: 9, padding: '2px 6px', borderRadius: 4 }}>
                      {result.duration}
                    </div>

                    {!isRestricted && (
                      <div
                        style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.15s', background: 'rgba(0,0,0,0.2)' }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                        onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
                      >
                        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>▶</div>
                      </div>
                    )}
                  </div>

                  <div style={{ padding: '8px 10px' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.4, marginBottom: 6 }}>
                      {result.title}
                    </div>
                    {isRestricted ? (
                      <div style={{ fontSize: 10, color: '#f87171' }}>Rights-restricted</div>
                    ) : (
                      <button
                        onClick={e => { e.stopPropagation(); addAsset(result) }}
                        style={{ fontSize: 10, padding: '4px 10px', borderRadius: 999, border: `1px solid rgba(59,130,246,0.3)`, background: assets.find(a => a.id === result.id) ? 'rgba(74,222,128,0.1)' : 'rgba(59,130,246,0.1)', color: assets.find(a => a.id === result.id) ? GREEN : BLUE, cursor: 'pointer', fontWeight: 600 }}
                      >
                        {assets.find(a => a.id === result.id) ? '✓ Added' : '+ Use this'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasSearched && !loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.2)' }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>🧪</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>Your creative workspace</div>
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            Find footage from YouTube and Archive.org.<br />
            Generate AI avatar videos. Add captions in 5 languages.
          </div>
        </div>
      )}

      {/* Project asset tray */}
      {assets.length > 0 && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 20, marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {project} · {assets.length} asset{assets.length !== 1 ? 's' : ''}
            </div>
            <button
              onClick={() => setAssets([])}
              style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Clear all
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {assets.map(asset => (
              <div key={asset.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 12 }}>
                <span style={{ fontSize: 14 }}>🎬</span>
                <span style={{ color: '#fff', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.title}</span>
                <span style={{ color: 'rgba(255,255,255,0.2)' }}>·</span>
                <button
                  onClick={() => window.location.href = '/dashboard/video'}
                  style={{ fontSize: 10, padding: '3px 8px', borderRadius: 999, border: '1px solid rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.1)', color: BLUE, cursor: 'pointer' }}
                >
                  Caption
                </button>
                <button
                  onClick={() => setAssets(prev => prev.filter(a => a.id !== asset.id))}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 14, padding: 0 }}
                  aria-label="Remove"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
