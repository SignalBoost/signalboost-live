'use client'

import { useEffect, useState } from 'react'

const GOLD = '#ffc300'
const CYAN = '#1af0ff'

type QueueVideoPlayerLabels = {
  qualityLabel: string
  sceneLabel: string
  playPreview: string
  pausePreview: string
  nextScene: string
}

type QueueVideoPlayerProps = {
  title: string
  aspect: string
  duration: string
  hero: string
  hook: string
  funnel: string
  quality: number
  scenes: string[]
  labels: QueueVideoPlayerLabels
}

export function QueueVideoPlayer({ title, aspect, duration, hero, hook, funnel, quality, scenes, labels }: QueueVideoPlayerProps) {
  const [playing, setPlaying] = useState(false)
  const [sceneIndex, setSceneIndex] = useState(0)
  const currentScene = scenes[sceneIndex] || hook
  const isVertical = aspect === '9:16'

  useEffect(() => {
    setSceneIndex(0)
    setPlaying(false)
  }, [title])

  useEffect(() => {
    if (!playing) return
    const timer = window.setTimeout(() => setSceneIndex(index => (index + 1) % Math.max(scenes.length, 1)), 2600)
    return () => window.clearTimeout(timer)
  }, [playing, sceneIndex, scenes.length])

  function nextScene() {
    setSceneIndex(index => (index + 1) % Math.max(scenes.length, 1))
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ ...frame, aspectRatio: isVertical ? '9 / 16' : '16 / 9', maxWidth: isVertical ? 360 : '100%', marginInline: isVertical ? 'auto' : 0 }}>
        <style>{`
          @keyframes cleanSweep { 0%{transform:translateX(-140%);opacity:0} 25%{opacity:.9} 100%{transform:translateX(140%);opacity:0} }
          @keyframes cleanIn { 0%{opacity:.2;transform:translateY(14px)} 100%{opacity:1;transform:translateY(0)} }
        `}</style>
        <div style={background} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,.12), rgba(0,0,0,.42))' }} />
        <span style={{ position: 'absolute', left: 0, right: 0, top: isVertical ? '28%' : '44%', height: 2, background: `linear-gradient(90deg, transparent, ${CYAN}, ${GOLD}, transparent)`, animation: playing ? 'cleanSweep 2.8s linear infinite' : 'none' }} />

        <div style={topBar}>
          <span>{aspect} · {duration}</span>
          <span style={{ color: quality >= 80 ? '#86efac' : GOLD }}>{labels.qualityLabel} {quality}</span>
        </div>

        <div style={{ ...mainContent, top: isVertical ? 72 : 62, left: isVertical ? 18 : 24, right: isVertical ? 18 : 24 }}>
          <div style={badge}>{hero}</div>
          <h3 style={{ ...headline, fontSize: isVertical ? 27 : 25 }}>{hook}</h3>
        </div>

        <div style={{ ...sceneBox, bottom: isVertical ? 96 : 86 }}>
          <div style={{ color: GOLD, fontWeight: 950, fontSize: 12, marginBottom: 6 }}>{labels.sceneLabel} {sceneIndex + 1}</div>
          <div>{currentScene}</div>
        </div>

        <div style={{ ...dots, bottom: isVertical ? 72 : 58 }}>
          {scenes.map((_, index) => <span key={index} style={{ width: index === sceneIndex ? 26 : 8, height: 8, borderRadius: 999, background: index === sceneIndex ? GOLD : 'rgba(255,255,255,.26)', transition: 'all .2s ease' }} />)}
        </div>

        <div style={cta}>{funnel}</div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => setPlaying(value => !value)} style={buttonStyle}>{playing ? labels.pausePreview : labels.playPreview}</button>
        <button onClick={nextScene} style={buttonStyle}>{labels.nextScene}</button>
      </div>
    </div>
  )
}

const frame: React.CSSProperties = { position: 'relative', borderRadius: 18, overflow: 'hidden', marginTop: 14, border: '1px solid rgba(255,195,0,.34)', background: '#020617', boxShadow: '0 22px 70px rgba(0,0,0,.32)' }
const background: React.CSSProperties = { position: 'absolute', inset: 0, background: 'radial-gradient(circle at 18% 18%, rgba(255,195,0,.18), transparent 30%), radial-gradient(circle at 80% 20%, rgba(26,240,255,.14), transparent 32%), linear-gradient(145deg,#020617,#0f172a)' }
const topBar: React.CSSProperties = { position: 'absolute', left: 16, right: 16, top: 14, zIndex: 4, display: 'flex', justifyContent: 'space-between', gap: 10, color: GOLD, fontWeight: 950, fontSize: 12 }
const mainContent: React.CSSProperties = { position: 'absolute', zIndex: 5, animation: 'cleanIn .35s ease-out' }
const badge: React.CSSProperties = { display: 'inline-flex', color: '#020617', background: GOLD, borderRadius: 999, padding: '6px 10px', fontSize: 11, fontWeight: 950, letterSpacing: '.08em', textTransform: 'uppercase' }
const headline: React.CSSProperties = { color: '#fff', lineHeight: 1.08, margin: '12px 0 0', maxWidth: 560, textShadow: '0 10px 30px rgba(0,0,0,.72)' }
const sceneBox: React.CSSProperties = { position: 'absolute', left: 16, right: 16, zIndex: 5, borderRadius: 14, padding: 12, background: 'rgba(2,6,23,.86)', border: '1px solid rgba(255,195,0,.24)', color: 'rgba(255,255,255,.86)', fontSize: 13, lineHeight: 1.45, animation: 'cleanIn .35s ease-out' }
const dots: React.CSSProperties = { position: 'absolute', left: 16, right: 16, zIndex: 6, display: 'flex', gap: 5, justifyContent: 'center' }
const cta: React.CSSProperties = { position: 'absolute', left: 16, right: 16, bottom: 16, zIndex: 6, borderRadius: 999, padding: '10px 12px', background: GOLD, color: '#020617', textAlign: 'center', fontWeight: 950, fontSize: 13 }
const buttonStyle: React.CSSProperties = { border: '1px solid rgba(255,195,0,.36)', background: 'rgba(255,195,0,.1)', color: GOLD, borderRadius: 12, padding: '9px 12px', fontWeight: 900, cursor: 'pointer' }
