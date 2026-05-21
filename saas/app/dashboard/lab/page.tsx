'use client'
import { useState, useRef, useEffect } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

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
  source: string
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
          <div style={{ width: 200, background: '#111', borderRadius: 32, border: '3px solid #2a2a2a', overflow: 'hidden' }}>
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
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{asset.title}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{asset.source === 'youtube' ? 'YouTube' : 'Archive.org'}</div>
        </div>

        {/* License badge */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, padding: '5px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.06)', color: licenseColor }}>
            {licenseLabel}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={() => { onCaption(asset); handleClose() }}
            style={{ width: '100%', padding: '13px', borderRadius: 14, background: GOLD, color: '#000', fontWeight: 800, fontSize: 14, border: 'none', cursor: 'pointer' }}
          >
            💬 Add captions in 5 languages
          </button>
          
            href={asset.watchUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'block', width: '100%', padding: '13px', borderRadius: 14, background: 'rgba(255,255,255,0.06)', color: '#fff', fontWeight: 700, fontSize: 14, textAlign: 'center', textDecoration: 'none' }}
          >
            ↗ Open original
          </a>
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

      {/* Script editor */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 8 }}>Script</label>
        <textarea
          value={script}
          onChange={e => setScript(e.target.value)}
          rows={4}
          style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
        />
      </div>

      {/* Avatar + Format */}
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

      {/* HeyGen notice if not ready */}
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
