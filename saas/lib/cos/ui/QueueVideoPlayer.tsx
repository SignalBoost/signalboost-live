'use client'

import { useEffect, useState } from 'react'
import { SignalBoostGuide } from './SignalBoostGuide'

const GOLD = '#ffc300'
const CYAN = '#1af0ff'

type QueueVideoPlayerProps = {
  title: string
  aspect: string
  duration: string
  hero: string
  hook: string
  funnel: string
  quality: number
  scenes: string[]
}

export function QueueVideoPlayer({ title, aspect, duration, hero, hook, funnel, quality, scenes }: QueueVideoPlayerProps) {
  const [playing, setPlaying] = useState(false)
  const [sceneIndex, setSceneIndex] = useState(0)
  const currentScene = scenes[sceneIndex] || hook

  useEffect(() => {
    setSceneIndex(0)
    setPlaying(false)
  }, [title])

  useEffect(() => {
    if (!playing) return
    const timer = window.setTimeout(() => {
      setSceneIndex(index => (index + 1) % Math.max(scenes.length, 1))
    }, 2600)
    return () => window.clearTimeout(timer)
  }, [playing, sceneIndex, scenes.length])

  function nextScene() {
    setSceneIndex(index => (index + 1) % Math.max(scenes.length, 1))
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ position: 'relative', aspectRatio: aspect === '9:16' ? '9 / 16' : '16 / 9', borderRadius: 18, overflow: 'hidden', marginTop: 14, border: '1px solid rgba(255,195,0,.34)', background: '#020617', maxHeight: aspect === '9:16' ? 620 : 420 }}>
        <style>{`
          @keyframes qScan { 0%{transform:translateX(-120%);opacity:0} 22%{opacity:1} 100%{transform:translateX(120%);opacity:0} }
          @keyframes qCardIn { 0%{transform:translateY(22px) scale(.96);opacity:.25} 100%{transform:translateY(0) scale(1);opacity:1} }
          @keyframes qPulse { 0%,100%{opacity:.45;transform:scale(.96)} 50%{opacity:1;transform:scale(1.04)} }
        `}</style>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 30% 18%, rgba(255,195,0,.26), transparent 34%), radial-gradient(circle at 82% 28%, rgba(26,240,255,.16), transparent 30%), linear-gradient(145deg,#020617,#0f172a)' }} />
        <span style={{ position: 'absolute', left: 0, right: 0, top: '42%', height: 3, background: `linear-gradient(90deg, transparent, ${CYAN}, ${GOLD}, transparent)`, animation: playing ? 'qScan 2.2s linear infinite' : 'none' }} />

        <div style={{ position: 'absolute', left: 14, top: 14, zIndex: 4, color: GOLD, fontWeight: 950, fontSize: 12 }}>{aspect} · {duration}</div>
        <div style={{ position: 'absolute', right: 14, top: 14, zIndex: 4, color: quality >= 80 ? '#86efac' : GOLD, fontWeight: 950, fontSize: 12 }}>quality {quality}</div>

        <div style={{ position: 'absolute', left: aspect === '9:16' ? '50%' : 18, top: aspect === '9:16' ? 52 : 62, transform: aspect === '9:16' ? 'translateX(-50%) scale(.62)' : 'scale(.55)', transformOrigin: aspect === '9:16' ? 'top center' : 'top left', zIndex: 4 }}>
          <SignalBoostGuide active={playing} />
        </div>

        <div style={{ position: 'absolute', left: aspect === '9:16' ? 18 : 210, right: 18, top: aspect === '9:16' ? 230 : 70, zIndex: 5, animation: 'qCardIn .35s ease-out' }}>
          <p style={{ color: GOLD, margin: 0, fontWeight: 950, letterSpacing: '.11em', textTransform: 'uppercase', fontSize: 11 }}>{hero}</p>
          <h3 style={{ color: '#fff', fontSize: aspect === '9:16' ? 27 : 28, lineHeight: 1.04, margin: '8px 0 0', textShadow: '0 10px 30px rgba(0,0,0,.8)' }}>{hook}</h3>
        </div>

        <div style={{ position: 'absolute', left: 16, right: 16, bottom: aspect === '9:16' ? 100 : 82, zIndex: 5, borderRadius: 16, padding: 12, background: 'rgba(2,6,23,.84)', border: '1px solid rgba(255,195,0,.28)', color: '#fff', fontSize: 14, lineHeight: 1.45, animation: 'qCardIn .35s ease-out' }}>
          <strong style={{ color: GOLD }}>Scene {sceneIndex + 1}</strong> — {currentScene}
        </div>

        <div style={{ position: 'absolute', left: 16, right: 16, bottom: 18, zIndex: 6, borderRadius: 999, padding: '10px 12px', background: GOLD, color: '#020617', textAlign: 'center', fontWeight: 950, fontSize: 13 }}>
          {funnel}
        </div>

        <div style={{ position: 'absolute', left: 14, right: 14, bottom: aspect === '9:16' ? 70 : 52, zIndex: 5, display: 'flex', gap: 5, justifyContent: 'center' }}>
          {scenes.map((_, index) => <span key={index} style={{ width: index === sceneIndex ? 24 : 8, height: 8, borderRadius: 999, background: index === sceneIndex ? GOLD : 'rgba(255,255,255,.25)', transition: 'all .2s ease' }} />)}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => setPlaying(value => !value)} style={buttonStyle}>{playing ? 'Pause preview' : 'Play preview'}</button>
        <button onClick={nextScene} style={buttonStyle}>Next scene</button>
      </div>
    </div>
  )
}

const buttonStyle: React.CSSProperties = {
  border: '1px solid rgba(255,195,0,.36)',
  background: 'rgba(255,195,0,.1)',
  color: GOLD,
  borderRadius: 12,
  padding: '9px 12px',
  fontWeight: 900,
  cursor: 'pointer',
}
