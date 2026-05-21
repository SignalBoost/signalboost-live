'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

// ── Types ─────────────────────────────────────────────────────────────────────

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

type LogEntry = {
  text: string
  color: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MODES: { id: Mode; icon: string; label: string }[] = [
  { id: 'auto',     icon: '✦', label: 'Auto' },
  { id: 'search',   icon: '⌕', label: 'Find footage' },
  { id: 'generate', icon: '⬡', label: 'Generate' },
  { id: 'caption',  icon: '◎', label: 'Captions' },
  { id: 'dub',      icon: '◈', label: 'Dub audio' },
]

const SUGGESTIONS = [
  { label: 'pelé goal',       prompt: 'show me the last goal of Pelé',         color: '#0ea5e9' },
  { label: 'moon landing',    prompt: 'moon landing 1969 NASA footage',         color: '#a78bfa' },
  { label: 'generate ad',     prompt: 'create a 30-second podcast ad in Spanish', color: '#ffc300' },
  { label: 'churchill',       prompt: 'Churchill We shall fight speech 1940',   color: '#10b981' },
  { label: 'berlin wall',     prompt: 'Berlin Wall fall 1989',                  color: '#0ea5e9' },
  { label: 'tiktok promo',    prompt: 'create a TikTok-style promo in Portuguese', color: '#a78bfa' },
]

const LOG_COLORS = ['#0ea5e9', '#a78bfa', '#ffc300', '#22c55e', '#10b981']

const TUNNEL_COLORS = [
  [124, 58, 237],
  [14, 165, 233],
  [168, 85, 247],
  [236, 72, 153],
  [124, 58, 237],
  [14, 165, 233],
]

// ── Tunnel canvas hook ────────────────────────────────────────────────────────

function useTunnel(canvasRef: React.RefObject<HTMLCanvasElement>, isTyping: boolean) {
  const speedRef = useRef(0.004)
  const frameRef = useRef(0)
  const ringsRef = useRef<{ z: number }[]>([])
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    // Init rings
    ringsRef.current = Array.from({ length: 28 }, (_, i) => ({ z: i / 28 }))

    function resize() {
      const parent = canvas.parentElement
      if (!parent) return
      canvas.width = parent.offsetWidth
      canvas.height = parent.offsetHeight
    }
    resize()
    window.addEventListener('resize', resize)

    function draw() {
      const W = canvas.width
      const H = canvas.height
      const cx = W / 2
      const cy = H * 0.44

      // Smooth speed transition
      const targetSpeed = isTyping ? 0.0006 : 0.004
      speedRef.current += (targetSpeed - speedRef.current) * 0.05

      ctx.fillStyle = '#000008'
      ctx.fillRect(0, 0, W, H)

      // Floor perspective lines
      for (let i = 0; i <= 8; i++) {
        const t = i / 8
        const x = cx + (t - 0.5) * W * 1.8
        const alpha = 0.03 + (1 - Math.abs(t - 0.5) * 2) * 0.05
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(x, H)
        const c = i % 2 === 0 ? [124, 58, 237] : [14, 165, 233]
        ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${alpha})`
        ctx.lineWidth = 1
        ctx.stroke()
      }

      // Rings
      frameRef.current += speedRef.current
      ringsRef.current.forEach((ring, i) => {
        ring.z -= speedRef.current
        if (ring.z <= 0) ring.z += 1

        const z = ring.z
        const perspective = 1 - z * 0.92
        const rx = W * 0.52 * perspective
        const ry = H * 0.46 * perspective
        const alpha = z * z * 0.85

        const ci = Math.floor((i + frameRef.current * 3) % TUNNEL_COLORS.length)
        const cn = (ci + 1) % TUNNEL_COLORS.length
        const blend = (frameRef.current * 3 + i) % 1
        const r = Math.round(TUNNEL_COLORS[ci][0] + (TUNNEL_COLORS[cn][0] - TUNNEL_COLORS[ci][0]) * blend)
        const g = Math.round(TUNNEL_COLORS[ci][1] + (TUNNEL_COLORS[cn][1] - TUNNEL_COLORS[ci][1]) * blend)
        const b = Math.round(TUNNEL_COLORS[ci][2] + (TUNNEL_COLORS[cn][2] - TUNNEL_COLORS[ci][2]) * blend)

        // Glow
        ctx.beginPath()
        ctx.ellipse(cx, cy, rx + 8, ry + 8, 0, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha * 0.15})`
        ctx.lineWidth = 7
        ctx.stroke()

        // Ring
        ctx.beginPath()
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha * 0.9})`
        ctx.lineWidth = 1.2
        ctx.stroke()

        // Inner accent every 4th ring
        if (i % 4 === 0) {
          ctx.beginPath()
          ctx.ellipse(cx, cy, rx * 0.93, ry * 0.93, 0, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.1})`
          ctx.lineWidth = 0.5
          ctx.stroke()
        }
      })

      // Vanishing point glow
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 90)
      grad.addColorStop(0, 'rgba(255,195,0,0.10)')
      grad.addColorStop(0.4, 'rgba(124,58,237,0.05)')
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)

      rafRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // Update speed reactively when isTyping changes
  useEffect(() => {
    // speed is handled inside draw loop via speedRef
  }, [isTyping])
}

// ── Video overlay ─────────────────────────────────────────────────────────────

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

  const licenseColor = asset.license === 'public' ? '#10b981' : asset.license === 'embeddable' ? '#ffc300' : '#f87171'
  const licenseLabel = asset.license === 'public' ? '🟢 Public domain' : asset.license === 'embeddable' ? '🟡 Freely embeddable' : '🔴 Rights-restricted'

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) handleClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,10,0.92)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <div style={{
        width: '100%', maxWidth: 600,
        background: 'rgba(6,0,20,0.97)',
        border: '1px solid rgba(124,58,237,0.3)',
        borderRadius: '24px 24px 0 0',
        padding: '16px 20px 40px',
        transform: slideIn ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.35s cubic-bezier(0.32,0.72,0,1)',
        maxHeight: '94vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <div style={{ width: 40, height: 4, background: 'rgba(124,58,237,0.4)', borderRadius: 999 }} />
        </div>
        <button onClick={handleClose} style={{ position: 'absolute', top: 16, right: 20, background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: '50%', width: 32, height: 32, color: '#a78bfa', cursor: 'pointer', fontSize: 16 }} aria-label="Close">✕</button>

        {/* Phone frame */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <div style={{ width: 200, background: '#030008', borderRadius: 32, border: '2px solid rgba(124,58,237,0.4)', overflow: 'hidden' }}>
            <div style={{ background: '#030008', height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 60, height: 6, background: 'rgba(124,58,237,0.3)', borderRadius: 4 }} />
            </div>
            <div style={{ aspectRatio: '9/16', background: '#000', position: 'relative', overflow: 'hidden' }}>
              <iframe
                src={asset.embedUrl}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title={asset.title}
              />
            </div>
            <div style={{ background: '#030008', height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 48, height: 4, background: 'rgba(124,58,237,0.25)', borderRadius: 999 }} />
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', marginBottom: 4, fontFamily: 'system-ui' }}>{asset.title}</div>
          <div style={{ fontSize: 11, color: 'rgba(167,139,250,0.5)', fontFamily: "'Courier New', monospace" }}>{asset.source === 'youtube' ? 'YouTube' : 'Archive.org'}</div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, padding: '5px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.04)', color: licenseColor, fontFamily: "'Courier New', monospace" }}>
            {licenseLabel}
          </div>
        </div>

        <div style={{ background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.15)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: 'rgba(125,211,252,0.6)', lineHeight: 1.6, fontFamily: 'system-ui' }}>
          <strong style={{ color: 'rgba(125,211,252,0.8)', display: 'block', marginBottom: 4 }}>💡 How captions work for found footage</strong>
          The AI transcribes the original audio, detects the language automatically, then translates and generates subtitle files (SRT, VTT, ASS) in all 5 languages.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={() => { onCaption(asset); handleClose() }}
            style={{ width: '100%', padding: '13px', borderRadius: 12, background: 'linear-gradient(135deg,#1a0050,#3d10a0)', border: '1px solid rgba(124,58,237,0.6)', color: '#c4b5fd', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'system-ui' }}>
            💬 Generate subtitles in 5 languages
          </button>
          {asset.watchUrl && (
            <a href={asset.watchUrl} target="_blank" rel="noopener noreferrer"
              style={{ display: 'block', width: '100%', padding: '13px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', fontWeight: 600, fontSize: 14, textAlign: 'center', textDecoration: 'none', fontFamily: 'system-ui', boxSizing: 'border-box' }}>
              ↗ Open on {asset.source === 'youtube' ? 'YouTube' : 'Archive.org'}
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
// ── Generate panel ────────────────────────────────────────────────────────────

function GeneratePanel({ data, prompt, onGenerated }: {
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
      alert('HeyGen API key not configured. Add HEYGEN_API_KEY to Vercel to enable video generation.')
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

  const panelStyle: React.CSSProperties = {
    background: 'rgba(6,0,20,0.85)',
    border: '1px solid rgba(124,58,237,0.25)',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    backdropFilter: 'blur(8px)',
    fontFamily: 'system-ui',
  }

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>⬡</div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#c4b5fd' }}>Generate video</div>
          <div style={{ fontSize: 11, color: 'rgba(167,139,250,0.5)', fontFamily: "'Courier New',monospace" }}>AI avatar · {data.estimatedCost} · {selectedFormat}</div>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(167,139,250,0.5)', display: 'block', marginBottom: 6, fontFamily: "'Courier New',monospace", letterSpacing: '0.1em', textTransform: 'uppercase' }}>Script</label>
        <textarea value={script} onChange={e => setScript(e.target.value)} rows={4}
          style={{ width: '100%', background: 'rgba(10,0,30,0.7)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: 8, padding: '10px 14px', color: '#c4b5fd', fontSize: 13, fontFamily: 'system-ui', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(167,139,250,0.5)', display: 'block', marginBottom: 6, fontFamily: "'Courier New',monospace", letterSpacing: '0.1em', textTransform: 'uppercase' }}>Avatar</label>
          <select value={selectedAvatar} onChange={e => setSelectedAvatar(e.target.value)}
            style={{ width: '100%', background: 'rgba(10,0,30,0.7)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: 6, padding: '8px 10px', color: '#c4b5fd', fontSize: 12, fontFamily: 'system-ui' }}>
            {data.avatars.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(167,139,250,0.5)', display: 'block', marginBottom: 6, fontFamily: "'Courier New',monospace", letterSpacing: '0.1em', textTransform: 'uppercase' }}>Format</label>
          <div style={{ display: 'flex', gap: 5 }}>
            {(['9:16', '16:9', '1:1'] as const).map(f => (
              <button key={f} onClick={() => setSelectedFormat(f)}
                style={{ flex: 1, padding: '8px 0', borderRadius: 6, border: '1px solid rgba(124,58,237,0.2)', background: selectedFormat === f ? 'rgba(124,58,237,0.2)' : 'rgba(10,0,30,0.5)', color: selectedFormat === f ? '#c4b5fd' : 'rgba(167,139,250,0.3)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'system-ui' }}>
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!data.heygenReady && (
        <div style={{ background: 'rgba(255,195,0,0.06)', border: '1px solid rgba(255,195,0,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'rgba(255,195,0,0.7)', marginBottom: 14, fontFamily: 'system-ui' }}>
          ⚠️ HeyGen API key not configured. Add <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 4, fontFamily: "'Courier New',monospace" }}>HEYGEN_API_KEY</code> to Vercel.
        </div>
      )}

      <button onClick={handleGenerate} disabled={generating || generated}
        style={{ width: '100%', padding: '13px', borderRadius: 10, background: generated ? 'rgba(16,185,129,0.15)' : generating ? 'rgba(124,58,237,0.08)' : 'linear-gradient(135deg,#1a0050,#3d10a0)', border: `1px solid ${generated ? 'rgba(16,185,129,0.4)' : 'rgba(124,58,237,0.5)'}`, color: generated ? '#10b981' : generating ? 'rgba(167,139,250,0.4)' : '#c4b5fd', fontWeight: 700, fontSize: 14, cursor: generating || generated ? 'default' : 'pointer', transition: 'all 0.15s', fontFamily: 'system-ui' }}>
        {generated ? '✓ Generated — check My files in the video page' : generating ? '⏳ Generating...' : `⬡ Generate video · ${data.estimatedCost}`}
      </button>
    </div>
  )
}
// ── Main Lab page ─────────────────────────────────────────────────────────────

export default function LabPage() {
  useI18n()

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [mode, setMode] = useState<Mode>('auto')
  const [prompt, setPrompt] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [loading, setLoading] = useState(false)
  const [intentText, setIntentText] = useState('')
  const [results, setResults] = useState<VideoResult[]>([])
  const [generateData, setGenerateData] = useState<GenerateData | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [assets, setAssets] = useState<Asset[]>([])
  const [overlayAsset, setOverlayAsset] = useState<Asset | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [project, setProject] = useState('My project')
  const [log, setLog] = useState<LogEntry[]>([
    { text: '✓ beacon online', color: '#22c55e' },
    { text: '✓ tunnel active', color: '#0ea5e9' },
    { text: '→ awaiting broadcast', color: 'rgba(167,139,250,0.5)' },
  ])
  const [searches, setSearches] = useState(0)
  const [resultCount, setResultCount] = useState<string>('—')
  const [showAchievement, setShowAchievement] = useState(false)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useTunnel(canvasRef, isTyping)

  function handleTyping(val: string) {
    setPrompt(val)
    setIsTyping(true)
    if (typingTimer.current) clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(() => setIsTyping(false), 1200)
  }

  function addLog(text: string, color: string) {
    setLog(prev => [...prev.slice(-8), { text, color }])
  }

  function reset() {
    setPrompt('')
    setHasSearched(false)
    setResults([])
    setGenerateData(null)
    setIntentText('')
    setMessage(null)
    setMode('auto')
    setResultCount('—')
    setLog([
      { text: '✓ cleared', color: '#22c55e' },
      { text: '→ ready for next experiment', color: 'rgba(167,139,250,0.5)' },
    ])
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
    setResultCount('...')
    setSearches(s => s + 1)
    setLog([{ text: `→ executing: "${q.slice(0, 32)}..."`, color: '#a78bfa' }])
    setShowAchievement(true)
    setTimeout(() => setShowAchievement(false), 3000)

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
        setResultCount('—')
        addLog('→ generate mode activated', '#ffc300')
        addLog('✓ script ready', '#22c55e')
      } else {
        const r = data.results ?? []
        setResults(r)
        setResultCount(String(r.length))
        r.forEach((_: any, i: number) => {
          setTimeout(() => {
            addLog(`✓ specimen ${i + 1} acquired`, LOG_COLORS[i % LOG_COLORS.length])
          }, i * 80)
        })
      }
    } catch (err: any) {
      setIntentText('')
      setMessage(err.message ?? 'Something went wrong')
      addLog(`✕ ${err.message ?? 'error'}`, '#f87171')
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
    window.location.href = '/dashboard/video'
  }

  const licenseColor = (l: string) => l === 'public' ? '#10b981' : l === 'embeddable' ? '#ffc300' : '#f87171'
  const licenseBg = (l: string) => l === 'public' ? 'rgba(16,185,129,0.1)' : l === 'embeddable' ? 'rgba(255,195,0,0.08)' : 'rgba(239,68,68,0.08)'

  // Shared panel styles
  const panelBase = (bg: string, border: string): React.CSSProperties => ({
    position: 'absolute', borderRadius: 8, padding: '12px 14px',
    backdropFilter: 'blur(8px)', background: bg, border: `1px solid ${border}`,
    overflow: 'hidden',
  })

  const mono: React.CSSProperties = { fontFamily: "'Courier New', monospace" }
  const sans: React.CSSProperties = { fontFamily: 'system-ui, -apple-system, sans-serif' }

  const phStyle = (color: string): React.CSSProperties => ({
    ...mono, fontSize: 9, color, letterSpacing: '0.18em',
    textTransform: 'uppercase', marginBottom: 10,
    display: 'flex', alignItems: 'center', gap: 6,
  })

  return (
    <div style={{ position: 'relative', width: '100%', height: '85vh', minHeight: 600, borderRadius: 14, overflow: 'hidden', color: '#fff' }}>

      {/* Tunnel canvas */}
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

      {/* Overlay */}
      {overlayAsset && (
        <VideoOverlay asset={overlayAsset} onClose={() => setOverlayAsset(null)} onCaption={handleCaption} />
      )}

      {/* Top bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 36, background: 'rgba(0,0,10,0.92)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 5px #22c55e', display: 'inline-block' }} />
          <span style={{ ...mono, fontSize: 10, color: 'rgba(255,195,0,0.7)', letterSpacing: '0.18em' }}>SIGNALBOOST</span>
          <span style={{ ...mono, fontSize: 10, color: 'rgba(124,58,237,0.6)' }}>//</span>
          <span style={{ ...mono, fontSize: 10, color: 'rgba(167,139,250,0.5)', letterSpacing: '0.15em' }}>THE LAB</span>
          <span style={{ ...mono, fontSize: 9, color: 'rgba(255,255,255,0.08)', letterSpacing: '0.1em', marginLeft: 4 }}>BROADCAST WORKSPACE</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {[
            { label: 'YT', color: '#22c55e' },
            { label: 'ARCHIVE', color: '#0ea5e9' },
            { label: 'GPT', color: '#a78bfa' },
            { label: 'HEYGEN', color: '#ffc300' },
          ].map(s => (
            <span key={s.label} style={{ ...mono, fontSize: 9, color: 'rgba(255,255,255,0.12)' }}>
              {s.label} <span style={{ color: s.color }}>●</span>
            </span>
          ))}
          <Clock />
        </div>
      </div>

      {/* Beacon SVG */}
      <div style={{ position: 'absolute', top: '43%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 5, pointerEvents: 'none', animation: 'float 5s ease-in-out infinite' }}>
        <BeaconSVG />
      </div>

      {/* LEFT — Mode panel */}
      <div style={{ ...panelBase('rgba(10,0,30,0.78)', 'rgba(124,58,237,0.28)'), left: 12, top: 46, width: 132, animation: 'float2 6s ease-in-out infinite', zIndex: 8 }}>
        <div style={phStyle('rgba(167,139,250,0.55)')}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#a78bfa', boxShadow: '0 0 5px #a78bfa', display: 'inline-block', flexShrink: 0 }} />
          Mode
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {MODES.map(m => (
            <button key={m.id} onClick={() => setMode(m.id)}
              style={{ ...mono, padding: '4px 10px', borderRadius: 3, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.15s', border: mode === m.id ? '1px solid rgba(124,58,237,0.7)' : '1px solid rgba(255,255,255,0.08)', background: mode === m.id ? 'rgba(124,58,237,0.15)' : 'transparent', color: mode === m.id ? '#c4b5fd' : 'rgba(255,255,255,0.18)' }}>
              {m.icon} {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* LEFT — Signal panel */}
      <div style={{ ...panelBase('rgba(0,10,24,0.78)', 'rgba(14,165,233,0.25)'), left: 12, top: 228, width: 132, animation: 'float2 7s ease-in-out infinite', animationDelay: '0.8s', zIndex: 8 }}>
        <div style={phStyle('rgba(125,211,252,0.5)')}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#0ea5e9', boxShadow: '0 0 5px #0ea5e9', display: 'inline-block', flexShrink: 0 }} />
          Signal
        </div>
        <Waveform />
        <div style={{ ...mono, fontSize: 8, color: 'rgba(14,165,233,0.3)', letterSpacing: '0.1em', marginBottom: 5 }}>BROADCAST STRENGTH</div>
        {[
          { w: '92%', c: '#22c55e' }, { w: '100%', c: '#ffc300' },
          { w: '78%', c: '#0ea5e9' }, { w: '22%', c: '#555' },
        ].map((b, i) => (
          <div key={i} style={{ height: 3, background: '#0a0010', borderRadius: 2, overflow: 'hidden', marginBottom: 5 }}>
            <div style={{ height: '100%', width: b.w, background: b.c, boxShadow: b.c !== '#555' ? `0 0 4px ${b.c}80` : 'none', borderRadius: 2 }} />
          </div>
        ))}
      </div>

      {/* LEFT — Project panel */}
      <div style={{ ...panelBase('rgba(0,12,8,0.78)', 'rgba(16,185,129,0.22)'), left: 12, top: 394, width: 132, animation: 'float2 5s ease-in-out infinite', animationDelay: '1.5s', zIndex: 8 }}>
        <div style={phStyle('rgba(110,231,183,0.5)')}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 5px #10b981', display: 'inline-block', flexShrink: 0 }} />
          Project
        </div>
        <input value={project} onChange={e => setProject(e.target.value)}
          style={{ ...mono, background: '#000e06', border: '1px solid rgba(16,185,129,0.15)', borderRadius: 3, padding: '6px 8px', color: 'rgba(110,231,183,0.6)', fontSize: 10, width: '100%', outline: 'none', boxSizing: 'border-box' }} />
        <div style={{ marginTop: 10 }}>
          <div style={{ ...mono, fontSize: 8, color: 'rgba(16,185,129,0.3)', letterSpacing: '0.1em', marginBottom: 4 }}>ASSETS</div>
          <div style={{ ...mono, fontSize: 20, color: '#10b981' }}>{assets.length}</div>
        </div>
      </div>

      {/* RIGHT — Intel panel */}
      <div style={{ ...panelBase('rgba(20,8,0,0.78)', 'rgba(255,195,0,0.25)'), right: 12, top: 46, width: 150, animation: 'float2 6s ease-in-out infinite', animationDelay: '0.3s', zIndex: 8 }}>
        <div style={phStyle('rgba(255,195,0,0.55)')}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ffc300', boxShadow: '0 0 5px #ffc300', display: 'inline-block', flexShrink: 0 }} />
          Broadcast intel
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div><div style={{ ...mono, fontSize: 20, color: '#ffc300' }}>{searches}</div><div style={{ ...mono, fontSize: 8, color: 'rgba(255,195,0,0.35)', letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 3 }}>Signals</div></div>
          <div><div style={{ ...mono, fontSize: 20, color: '#0ea5e9' }}>{resultCount}</div><div style={{ ...mono, fontSize: 8, color: 'rgba(14,165,233,0.35)', letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 3 }}>Received</div></div>
        </div>
        <div style={{ ...mono, fontSize: 8, color: 'rgba(255,195,0,0.3)', letterSpacing: '0.1em', marginBottom: 6 }}>FREQUENCY</div>
        {[
          { label: 'YouTube', color: '#22c55e', w: '92%' },
          { label: 'Archive', color: '#0ea5e9', w: '78%' },
          { label: 'GPT', color: '#a78bfa', w: '100%' },
          { label: 'HeyGen', color: '#ffc300', w: '22%' },
        ].map(s => (
          <div key={s.label}>
            <div style={{ ...mono, fontSize: 9, display: 'flex', justifyContent: 'space-between', marginBottom: 3, color: 'rgba(255,255,255,0.12)' }}>
              <span>{s.label}</span>
              <span style={{ color: s.color }}>{s.w === '22%' ? 'STBY' : 'LIVE'}</span>
            </div>
            <div style={{ height: 3, background: '#0a0010', borderRadius: 2, overflow: 'hidden', marginBottom: 4 }}>
              <div style={{ height: '100%', width: s.w, background: s.color, boxShadow: `0 0 4px ${s.color}60`, borderRadius: 2 }} />
            </div>
          </div>
        ))}
      </div>

      {/* RIGHT — Transmission log */}
      <div style={{ ...panelBase('rgba(8,0,24,0.78)', 'rgba(124,58,237,0.25)'), right: 12, top: 272, width: 170, animation: 'float2 8s ease-in-out infinite', animationDelay: '1s', zIndex: 8 }}>
        <div style={phStyle('rgba(167,139,250,0.5)')}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#a78bfa', boxShadow: '0 0 5px #a78bfa', display: 'inline-block', flexShrink: 0 }} />
          Transmission log
        </div>
        <div style={{ minHeight: 60 }}>
          {log.slice(-6).map((entry, i) => (
            <div key={i} style={{ ...mono, fontSize: 9, color: entry.color, lineHeight: 1.9 }}>{entry.text}</div>
          ))}
          {!loading && <span style={{ ...mono, fontSize: 9, color: 'rgba(167,139,250,0.4)', animation: 'blink 1s step-end infinite' }}>_</span>}
        </div>
      </div>

      {/* RIGHT — What will you broadcast */}
      <div style={{ ...panelBase('rgba(0,8,20,0.78)', 'rgba(14,165,233,0.2)'), right: 12, top: 448, width: 170, animation: 'float2 6.5s ease-in-out infinite', animationDelay: '2s', zIndex: 8 }}>
        <div style={phStyle('rgba(125,211,252,0.4)')}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#0ea5e9', boxShadow: '0 0 5px #0ea5e9', display: 'inline-block', flexShrink: 0, animation: 'blink 1.5s step-end infinite' }} />
          What will you broadcast?
        </div>
        {[
          { label: 'Find', text: 'historic footage', color: '#0ea5e9' },
          { label: 'Generate', text: 'a podcast ad', color: '#a78bfa' },
          { label: 'Caption', text: 'in 5 languages', color: '#ffc300' },
          { label: 'Go viral', text: 'worldwide', color: '#10b981' },
        ].map((item, i) => (
          <div key={i} style={{ ...mono, fontSize: 9, color: 'rgba(255,255,255,0.1)', padding: '3px 0', borderBottom: i < 3 ? '1px solid rgba(14,165,233,0.06)' : 'none' }}>
            → <span style={{ color: `${item.color}90` }}>{item.label}</span> {item.text}
          </div>
        ))}
      </div>

      {/* Achievement */}
      {showAchievement && (
        <div style={{ position: 'absolute', top: 44, right: 14, background: 'rgba(20,0,40,0.96)', border: '1px solid rgba(255,195,0,0.35)', borderRadius: 8, padding: '10px 14px', zIndex: 20, animation: 'fadeup 0.5s ease', pointerEvents: 'none' }}>
          <div style={{ fontSize: 14, marginBottom: 4 }}>📡</div>
          <div style={{ ...mono, fontSize: 10, color: '#ffc300', letterSpacing: '0.1em' }}>SIGNAL TRANSMITTED</div>
          <div style={{ ...mono, fontSize: 8, color: 'rgba(255,195,0,0.5)', marginTop: 2 }}>broadcasting something amazing</div>
        </div>
      )}

      {/* Intent banner */}
      {intentText && (
        <div style={{ position: 'absolute', top: 44, left: '50%', transform: 'translateX(-50%)', maxWidth: 400, background: 'rgba(4,0,20,0.9)', border: '1px solid rgba(124,58,237,0.25)', borderRadius: 8, padding: '8px 14px', zIndex: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#a78bfa', fontSize: 13 }}>✦</span>
          <span style={{ ...mono, fontSize: 10, color: 'rgba(167,139,250,0.7)', letterSpacing: '0.05em' }}>{intentText}</span>
        </div>
      )}

      {/* Results area — scrollable center */}
      {(results.length > 0 || generateData || message) && !loading && (
        <div style={{ position: 'absolute', top: 44, left: 160, right: 198, bottom: 110, overflowY: 'auto', zIndex: 9, padding: '12px 8px' }}>
          {message && (
            <div style={{ ...sans, padding: '8px 14px', background: 'rgba(255,195,0,0.06)', border: '1px solid rgba(255,195,0,0.2)', borderRadius: 8, fontSize: 11, color: 'rgba(255,195,0,0.7)', marginBottom: 12 }}>
              ⚠️ {message}
            </div>
          )}
          {generateData && <GeneratePanel data={generateData} prompt={prompt} onGenerated={a => addAsset(a as any)} />}
          {results.length > 0 && (
            <>
              <div style={{ ...mono, fontSize: 9, color: 'rgba(167,139,250,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
                {results.length} specimens · tap to preview
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
                {results.map(result => {
                  const isRestricted = result.license === 'restricted'
                  return (
                    <div key={result.id} onClick={() => !isRestricted && openOverlay(result)}
                      style={{ borderRadius: 10, overflow: 'hidden', background: 'rgba(4,0,16,0.85)', border: '1px solid rgba(124,58,237,0.15)', cursor: isRestricted ? 'default' : 'pointer', transition: 'transform 0.15s, border-color 0.15s', opacity: isRestricted ? 0.5 : 1, backdropFilter: 'blur(4px)' }}
                      onMouseEnter={e => { if (!isRestricted) { e.currentTarget.style.transform = 'scale(1.04)'; e.currentTarget.style.borderColor = 'rgba(124,58,237,0.5)' } }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = 'rgba(124,58,237,0.15)' }}
                    >
                      <div style={{ aspectRatio: '9/16', background: '#030008', position: 'relative', overflow: 'hidden' }}>
                        {result.thumbnail
                          ? <img src={result.thumbnail} alt={result.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, opacity: 0.3 }}>🎬</div>
                        }
                        {isRestricted && (
                          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🔒</div>
                        )}
                        <div style={{ position: 'absolute', top: 5, left: 5 }}>
                          <div style={{ ...mono, fontSize: 8, fontWeight: 700, padding: '2px 5px', borderRadius: 999, background: licenseBg(result.license), color: licenseColor(result.license) }}>
                            {result.license === 'public' ? 'PUB' : result.license === 'embeddable' ? 'EMB' : 'RES'}
                          </div>
                        </div>
                        <div style={{ position: 'absolute', top: 5, right: 5 }}>
                          <div style={{ ...mono, fontSize: 8, padding: '2px 5px', borderRadius: 999, background: 'rgba(0,0,0,0.7)', color: 'rgba(167,139,250,0.6)' }}>
                            {result.source === 'youtube' ? 'YT' : 'ARC'}
                          </div>
                        </div>
                        <div style={{ ...mono, position: 'absolute', bottom: 5, right: 5, background: 'rgba(0,0,0,0.8)', color: 'rgba(255,255,255,0.6)', fontSize: 8, padding: '2px 5px', borderRadius: 3 }}>
                          {result.duration}
                        </div>
                      </div>
                      <div style={{ padding: '6px 8px' }}>
                        <div style={{ ...sans, fontSize: 10, fontWeight: 500, color: '#c4b5fd', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.4, marginBottom: 5 }}>
                          {result.title}
                        </div>
                        {!isRestricted && (
                          <button onClick={e => { e.stopPropagation(); addAsset(result) }}
                            style={{ ...mono, fontSize: 9, padding: '3px 8px', borderRadius: 999, border: `1px solid ${assets.find(a => a.id === result.id) ? 'rgba(16,185,129,0.4)' : 'rgba(124,58,237,0.3)'}`, background: assets.find(a => a.id === result.id) ? 'rgba(16,185,129,0.1)' : 'rgba(124,58,237,0.08)', color: assets.find(a => a.id === result.id) ? '#10b981' : '#a78bfa', cursor: 'pointer' }}>
                            {assets.find(a => a.id === result.id) ? '✓ Added' : '+ Collect'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div style={{ position: 'absolute', top: 60, left: 160, right: 198, zIndex: 9, padding: '12px 8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{ borderRadius: 10, overflow: 'hidden', background: 'rgba(4,0,16,0.6)', border: '1px solid rgba(124,58,237,0.1)' }}>
                <div style={{ aspectRatio: '9/16', background: 'rgba(124,58,237,0.04)' }} />
                <div style={{ padding: '6px 8px' }}>
                  <div style={{ height: 8, background: 'rgba(124,58,237,0.08)', borderRadius: 3, marginBottom: 5 }} />
                  <div style={{ height: 7, width: '60%', background: 'rgba(124,58,237,0.05)', borderRadius: 3 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasSearched && !loading && (
        <div style={{ position: 'absolute', bottom: 120, left: '50%', transform: 'translateX(-50%)', textAlign: 'center', pointerEvents: 'none', zIndex: 6 }}>
          <div style={{ ...mono, fontSize: 11, color: 'rgba(167,139,250,0.25)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
            enter your broadcast command below
          </div>
        </div>
      )}

      {/* Asset tray */}
      {assets.length > 0 && (
        <div style={{ position: 'absolute', top: 44, left: 160, right: 198, zIndex: 9, padding: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ ...mono, fontSize: 9, color: 'rgba(16,185,129,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              {project} · {assets.length} asset{assets.length !== 1 ? 's' : ''}
            </div>
            <button onClick={() => setAssets([])} style={{ ...mono, fontSize: 9, color: 'rgba(255,255,255,0.2)', background: 'none', border: 'none', cursor: 'pointer' }}>clear all</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {assets.map(asset => (
              <div key={asset.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, background: 'rgba(4,0,16,0.85)', border: '1px solid rgba(16,185,129,0.2)', backdropFilter: 'blur(4px)' }}>
                <span style={{ fontSize: 12 }}>🎬</span>
                <span style={{ ...sans, color: '#c4b5fd', fontSize: 10, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.title}</span>
                <button onClick={() => window.location.href = '/dashboard/video'}
                  style={{ ...mono, fontSize: 9, padding: '2px 7px', borderRadius: 999, border: '1px solid rgba(14,165,233,0.3)', background: 'rgba(14,165,233,0.08)', color: '#0ea5e9', cursor: 'pointer' }}>
                  Caption
                </button>
                <button onClick={() => setAssets(prev => prev.filter(a => a.id !== asset.id))}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', cursor: 'pointer', fontSize: 13, padding: 0 }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Prompt bar */}
      <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', width: '62%', zIndex: 10 }}>
        <div style={{ background: 'rgba(4,0,20,0.90)', border: '1px solid rgba(124,58,237,0.32)', borderRadius: 12, padding: '14px 16px', backdropFilter: 'blur(12px)', boxShadow: '0 0 40px rgba(124,58,237,0.08), inset 0 1px 0 rgba(124,58,237,0.15)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <span style={{ ...mono, color: 'rgba(124,58,237,0.6)', fontSize: 14, flexShrink: 0 }}>$</span>
            <input ref={inputRef} value={prompt}
              onChange={e => handleTyping(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runSearch()}
              placeholder="what will you broadcast today..."
              style={{ ...sans, flex: 1, background: 'rgba(10,0,30,0.7)', border: '1px solid rgba(124,58,237,0.22)', borderRadius: 6, padding: '10px 14px', color: '#c4b5fd', fontSize: 13, outline: 'none', caretColor: '#a78bfa' }}
            />
            {hasSearched && (
              <button onClick={reset}
                style={{ ...sans, padding: '10px 14px', borderRadius: 6, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.25)', fontSize: 12, cursor: 'pointer' }}>
                CLR
              </button>
            )}
            <button onClick={() => runSearch()} disabled={loading || !prompt.trim()}
              style={{ ...sans, padding: '10px 22px', borderRadius: 6, background: prompt.trim() && !loading ? 'linear-gradient(135deg,#1a0050,#3d10a0)' : 'rgba(124,58,237,0.06)', border: `1px solid ${prompt.trim() && !loading ? 'rgba(124,58,237,0.7)' : 'rgba(124,58,237,0.15)'}`, color: prompt.trim() && !loading ? '#c4b5fd' : 'rgba(124,58,237,0.25)', fontWeight: 600, fontSize: 13, cursor: prompt.trim() && !loading ? 'pointer' : 'default', whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
              {loading ? '⏳' : '[ TRANSMIT ]'}
            </button>
          </div>

          {/* Mode pills */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginBottom: hasSearched ? 0 : 8 }}>
            <span style={{ ...mono, fontSize: 8, color: 'rgba(255,255,255,0.1)', letterSpacing: '0.1em', padding: '4px 0' }}>MODE:</span>
            {MODES.map(m => (
              <button key={m.id} onClick={() => setMode(m.id)}
                style={{ ...mono, padding: '3px 9px', borderRadius: 3, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', border: mode === m.id ? '1px solid rgba(124,58,237,0.6)' : '1px solid rgba(255,255,255,0.08)', background: mode === m.id ? 'rgba(124,58,237,0.15)' : 'transparent', color: mode === m.id ? '#c4b5fd' : 'rgba(255,255,255,0.2)', transition: 'all 0.15s' }}>
                {m.icon} {m.label}
              </button>
            ))}
          </div>

          {/* Suggestion chips — only before first search */}
          {!hasSearched && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ ...mono, fontSize: 8, color: 'rgba(255,255,255,0.1)', letterSpacing: '0.1em', padding: '4px 0' }}>FREQ:</span>
              {SUGGESTIONS.map(s => (
                <button key={s.label} onClick={() => runSearch(s.prompt)}
                  style={{ ...mono, padding: '4px 10px', borderRadius: 999, fontSize: 8, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', background: `${s.color}0a`, border: `1px solid ${s.color}20`, color: `${s.color}80`, transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = `${s.color}15`; e.currentTarget.style.color = s.color }}
                  onMouseLeave={e => { e.currentTarget.style.background = `${s.color}0a`; e.currentTarget.style.color = `${s.color}80` }}>
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes float { 0%,100%{transform:translate(-50%,-50%) translateY(0)} 50%{transform:translate(-50%,-50%) translateY(-8px)} }
        @keyframes float2 { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
        @keyframes blink { 50%{opacity:0} }
        @keyframes fadeup { 0%{opacity:0;transform:translateY(8px)} 100%{opacity:1;transform:translateY(0)} }
        @keyframes waveAnim { 0%,100%{height:4px} 50%{height:18px} }
        @keyframes beacon-ring { 0%{r:8;opacity:.9;stroke-width:2} 100%{r:85;opacity:0;stroke-width:.3} }
        @keyframes beacon-ring2 { 0%{r:8;opacity:.6;stroke-width:1.5} 100%{r:105;opacity:0;stroke-width:.2} }
        @keyframes beacon-sweep { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
        @keyframes glow-top { 0%,100%{opacity:.7} 50%{opacity:1} }
        @keyframes light-beam { 0%,100%{opacity:.05} 50%{opacity:.14} }
        @keyframes cyan-pulse { 0%,100%{opacity:.4} 50%{opacity:1} }
      `}</style>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Clock() {
  const [time, setTime] = useState('--:--:--')
  useEffect(() => {
    const update = () => setTime(new Date().toTimeString().slice(0, 8))
    update()
    const iv = setInterval(update, 1000)
    return () => clearInterval(iv)
  }, [])
  return <span style={{ fontFamily: "'Courier New',monospace", fontSize: 9, color: 'rgba(255,255,255,0.12)' }}>{time}</span>
}

function Waveform() {
  const colors = ['#0ea5e9','#22c55e','#0ea5e9','#ffc300','#a78bfa','#0ea5e9','#22c55e','#ffc300','#a78bfa','#0ea5e9','#22c55e','#ffc300']
  const delays = [0,.1,.2,.3,.4,.5,.6,.7,.8,.9,1.0,1.1]
  const heights = [6,14,8,18,5,12,16,7,11,16,4,13]
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', height: 22, marginBottom: 8 }}>
      {colors.map((c, i) => (
        <span key={i} style={{ width: 3, borderRadius: 2, display: 'inline-block', margin: '0 1px', background: c, boxShadow: `0 0 4px ${c}80`, height: heights[i], animation: `waveAnim .8s ease-in-out infinite`, animationDelay: `${delays[i]}s`, transformOrigin: 'bottom' }} />
      ))}
    </div>
  )
}

function BeaconSVG() {
  return (
    <svg width="170" height="170" viewBox="-10 -10 220 220" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="bG" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffc300" stopOpacity=".6"/>
          <stop offset="50%" stopColor="#7c3aed" stopOpacity=".18"/>
          <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id="tG" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffe566" stopOpacity="1"/>
          <stop offset="70%" stopColor="#ffc300" stopOpacity=".8"/>
          <stop offset="100%" stopColor="#cc8800" stopOpacity="0"/>
        </radialGradient>
        <filter id="fg2">
          <feGaussianBlur stdDeviation="3" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <circle cx="100" cy="100" r="70" fill="url(#bG)" opacity=".5"/>
      <circle cx="100" cy="74" r="0" fill="none" stroke="#ffc300" style={{animation:'beacon-ring 2.2s ease-out infinite'}}/>
      <circle cx="100" cy="74" r="0" fill="none" stroke="#ffc300" style={{animation:'beacon-ring 2.2s ease-out infinite',animationDelay:'.73s'}}/>
      <circle cx="100" cy="74" r="0" fill="none" stroke="#0ea5e9" style={{animation:'beacon-ring2 2.6s ease-out infinite',animationDelay:'.4s'}}/>
      <circle cx="100" cy="74" r="0" fill="none" stroke="#a78bfa" style={{animation:'beacon-ring2 3s ease-out infinite',animationDelay:'1.2s'}}/>
      <g style={{transformOrigin:'100px 74px',animation:'beacon-sweep 5s linear infinite'}}>
        <path d="M100,74 L155,18 L168,32 Z" fill="#ffc300" fillOpacity=".06" style={{animation:'light-beam 2.5s ease-in-out infinite'}}/>
      </g>
      <path d="M72,178 L75,118 L125,118 L128,178 Z" fill="#04000e" stroke="#7c3aed" strokeOpacity=".4" strokeWidth="1"/>
      <line x1="75" y1="133" x2="125" y2="133" stroke="#0ea5e9" strokeOpacity=".2" strokeWidth="1"/>
      <line x1="76" y1="148" x2="124" y2="148" stroke="#a78bfa" strokeOpacity=".2" strokeWidth="1"/>
      <circle cx="76" cy="133" r="2" fill="#0ea5e9" fillOpacity=".7" style={{animation:'cyan-pulse 1.8s ease-in-out infinite'}}/>
      <circle cx="124" cy="133" r="2" fill="#0ea5e9" fillOpacity=".7" style={{animation:'cyan-pulse 1.8s ease-in-out infinite',animationDelay:'.9s'}}/>
      <circle cx="77" cy="148" r="2" fill="#a78bfa" fillOpacity=".6" style={{animation:'cyan-pulse 2.2s ease-in-out infinite',animationDelay:'.4s'}}/>
      <circle cx="123" cy="148" r="2" fill="#a78bfa" fillOpacity=".6" style={{animation:'cyan-pulse 2.2s ease-in-out infinite',animationDelay:'1.1s'}}/>
      <rect x="97" y="74" width="6" height="46" rx="1" fill="#06000e" stroke="#7c3aed" strokeOpacity=".5" strokeWidth="1"/>
      <rect x="83" y="60" width="34" height="20" rx="4" fill="#06000e" stroke="#ffc300" strokeOpacity=".5" strokeWidth="1.2" filter="url(#fg2)"/>
      <rect x="86" y="62" width="7" height="16" rx="2" fill="#0ea5e9" fillOpacity=".15" stroke="#0ea5e9" strokeOpacity=".3" strokeWidth=".5"/>
      <rect x="95" y="62" width="10" height="16" rx="2" fill="#ffc300" fillOpacity=".15" stroke="#ffc300" strokeOpacity=".35" strokeWidth=".5"/>
      <rect x="107" y="62" width="7" height="16" rx="2" fill="#a78bfa" fillOpacity=".15" stroke="#a78bfa" strokeOpacity=".3" strokeWidth=".5"/>
      <circle cx="100" cy="70" r="8" fill="url(#tG)" style={{animation:'glow-top 1.4s ease-in-out infinite'}} filter="url(#fg2)"/>
      <circle cx="100" cy="70" r="3.5" fill="#fff" fillOpacity=".95"/>
      <path d="M81,60 L100,48 L119,60 Z" fill="#06000e" stroke="#ffc300" strokeOpacity=".4" strokeWidth="1"/>
      <line x1="100" y1="48" x2="100" y2="36" stroke="#a78bfa" strokeOpacity=".7" strokeWidth="1.5"/>
      <circle cx="100" cy="34" r="3.5" fill="#a78bfa" filter="url(#fg2)" style={{animation:'cyan-pulse .9s ease-in-out infinite'}}/>
      <line x1="86" y1="54" x2="74" y2="45" stroke="#0ea5e9" strokeOpacity=".4" strokeWidth="1"/>
      <circle cx="73" cy="44" r="2" fill="#0ea5e9" fillOpacity=".6" style={{animation:'cyan-pulse 1.3s ease-in-out infinite',animationDelay:'.6s'}}/>
      <line x1="114" y1="54" x2="126" y2="45" stroke="#0ea5e9" strokeOpacity=".4" strokeWidth="1"/>
      <circle cx="127" cy="44" r="2" fill="#0ea5e9" fillOpacity=".6" style={{animation:'cyan-pulse 1.3s ease-in-out infinite',animationDelay:'1.2s'}}/>
      <rect x="62" y="176" width="76" height="7" rx="2" fill="#04000e" stroke="#7c3aed" strokeOpacity=".3" strokeWidth="1"/>
      <ellipse cx="100" cy="185" rx="38" ry="4" fill="#7c3aed" fillOpacity=".08"/>
      <text x="100" y="196" textAnchor="middle" fontSize="7" fill="#a78bfa" fillOpacity=".4" fontFamily="'Courier New',monospace" letterSpacing="2">SB · BEACON</text>
    </svg>
  )
}
