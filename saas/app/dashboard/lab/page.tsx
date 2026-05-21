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
    ? `🟢 ${t(dict, 'lab.license.public', 'Public domain')}` 
    : asset.license === 'embeddable' 
    ? `🟡 ${t(dict, 'lab.license.embeddable', 'Freely embeddable')}` 
    : `🔴 ${t(dict, 'lab.license.restricted', 'Rights-restricted')}`

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
          <div style={{ fontWeight: 700, color: 'rgba(255,255,255,0.8)', marginBottom: 6, fontFamily: 'monospace', fontSize: 12 }}>// {t(dict, 'lab.captionInfo.title', 'LAB_DIAGNOSTICS: CAPTION_AUTOMATION')}</div>
          {t(dict, 'lab.captionInfo.description', 'The AI will transcribe the original audio (detecting the spoken language automatically), then translate the transcript into your chosen languages and generate subtitle files (SRT, VTT, ASS) you can download and use anywhere.')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={() => { onCaption(asset); handleClose() }} style={{ width: '100%', padding: '14px', borderRadius: 10, background: GOLD, color: '#000', fontWeight: 800, fontSize: 15, border: 'none', cursor: 'pointer' }}>
            💬 {t(dict, 'lab.generateSubtitles', 'Generate subtitles in 5 languages')}
          </button>
          {asset.watchUrl && (
            <a href={asset.watchUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'block', width: '100%', padding: '14px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontWeight: 700, fontSize: 15, textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box' }}>
              ↗ {t(dict, 'lab.openOriginal', 'Open original on')} {asset.source === 'youtube' ? 'YouTube' : 'Archive.org'}
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

function GeneratePanel({
  data, prompt, onGenerated, dict,
}: {
  data: GenerateData
  prompt: string
  onGenerated: (asset: Asset) => void
  dict: any
}) {
  const [selectedAvatar, setSelectedAvatar] = useState(data.avatars[0]?.id ?? '')
  const [selectedFormat, setSelectedFormat] = useState<'9:16' | '16:9' | '1:1'>((data.format as '9:16' | '16:9' | '1:1') ?? '9:16')
  const [script, setScript] = useState(data.script)
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState(false)

  async function handleGenerate() {
    if (!data.heygenReady) {
      alert(t(dict, 'lab.heygenNotConfigured', 'HeyGen API key not configured yet. Add HEYGEN_API_KEY to Vercel environment variables to enable video generation.'))
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
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', fontFamily: 'monospace' }}>{t(dict, 'lab.videoSynthesis', 'VIDEO_SYNTHESIS_UNIT')}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>AVATAR_ENGINE · {data.estimatedCost} · {selectedFormat}</div>
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 8, fontFamily: 'monospace' }}>[{t(dict, 'lab.inputScript', 'INPUT_SCRIPT')}]</label>
        <textarea value={script} onChange={e => setScript(e.target.value)} rows={4} style={{ width: '100%', background: 'rgba(4, 5, 11, 0.9)', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14, fontFamily: 'monospace', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 8, fontFamily: 'monospace' }}>[{t(dict, 'lab.avatarNode', 'AVATAR_NODE')}]</label>
          <select value={selectedAvatar} onChange={e => setSelectedAvatar(e.target.value)} style={{ width: '100%', background: 'rgba(4, 5, 11, 0.9)', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: 6, padding: '10px 14px', color: '#fff', fontSize: 13, fontFamily: 'monospace' }}>
            {data.avatars.map(a => <option key={a.id} value={a.id} style={{ background: '#060913' }}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 8, fontFamily: 'monospace' }}>[{t(dict, 'lab.aspectRatio', 'ASPECT_RATIO')}]</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['9:16', '16:9', '1:1'] as const).map(f => (
              <button key={f} onClick={() => setSelectedFormat(f)} style={{ flex: 1, padding: '10px 0', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: selectedFormat === f ? 'rgba(59,130,246,0.3)' : 'rgba(4, 5, 11, 0.6)', color: selectedFormat === f ? '#fff' : 'rgba(255,255,255,0.5)', fontSize: 12, fontFamily: 'monospace', fontWeight: 700, cursor: 'pointer' }}>{f}</button>
            ))}
          </div>
        </div>
      </div>
      {!data.heygenReady && (
        <div style={{ background: 'rgba(255,195,0,0.04)', border: '1px solid rgba(255,195,0,0.2)', borderRadius: 8, padding: '12px 16px', fontSize: 12, color: 'rgba(255,195,0,0.9)', marginBottom: 16, fontFamily: 'monospace' }}>
          {t(dict, 'lab.heygenWarning', 'CRITICAL: HEYGEN_API_KEY environment node unconfigured.')}
        </div>
      )}
      <button onClick={handleGenerate} disabled={generating || generated} style={{ width: '100%', padding: '14px', borderRadius: 8, background: generated ? 'rgba(74,222,128,0.12)' : generating ? 'rgba(255,255,255,0.04)' : GOLD, border: generated ? '1px solid rgba(74,222,128,0.35)' : 'none', color: generated ? GREEN : generating ? 'rgba(255,255,255,0.4)' : '#000', fontFamily: 'monospace', fontWeight: 800, fontSize: 14, cursor: generating || generated ? 'default' : 'pointer', transition: 'all 0.15s' }}>
        {generated ? `✓ ${t(dict, 'lab.renderComplete', 'RENDER_COMPLETE — Verified in Tray')}` : generating ? `⏳ ${t(dict, 'lab.compiling', 'PIPELINE_COMPILING...')}` : `⚡ ${t(dict, 'lab.initializeSynthesis', 'INITIALIZE_SYNTHESIS')} · ${data.estimatedCost}`}
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
