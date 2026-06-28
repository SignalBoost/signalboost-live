'use client'

import { useEffect, useMemo, useState } from 'react'

const GOLD = '#ffc300'

type Scene = {
  label?: string
  narration?: string
  visual_direction?: string
}

type VideoPreviewRendererProps = {
  title?: string
  scenes?: Scene[]
  callToAction?: string
}

export function VideoPreviewRenderer({ title, scenes = [], callToAction }: VideoPreviewRendererProps) {
  const safeScenes = useMemo(() => {
    const base = scenes.length ? scenes : [{ label: 'Campaign', narration: title || 'Generated campaign preview', visual_direction: 'SignalBoost campaign preview' }]
    return base.map((scene, index) => ({
      label: scene.label || `Scene ${index + 1}`,
      narration: scene.narration || 'Narration pending.',
      visual_direction: scene.visual_direction || 'Visual direction pending.',
    }))
  }, [scenes, title])

  const [playing, setPlaying] = useState(false)
  const [audioEnabled, setAudioEnabled] = useState(false)
  const [sceneIndex, setSceneIndex] = useState(0)
  const current = safeScenes[sceneIndex] || safeScenes[0]

  function stopSpeech() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
  }

  function speak(text: string) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    stopSpeech()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 0.94
    utterance.pitch = 0.96
    window.speechSynthesis.speak(utterance)
  }

  function togglePlayback() {
    setPlaying((value) => !value)
  }

  function toggleAudio() {
    setAudioEnabled((value) => {
      const next = !value
      if (next) speak(current.narration)
      else stopSpeech()
      return next
    })
  }

  function nextScene() {
    setSceneIndex((index) => (index + 1) % safeScenes.length)
  }

  useEffect(() => {
    if (!playing) return
    const handle = setInterval(nextScene, 4500)
    return () => clearInterval(handle)
  }, [playing, safeScenes.length])

  useEffect(() => {
    if (audioEnabled) speak(current.narration)
    return () => stopSpeech()
  }, [sceneIndex, audioEnabled])

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{
        position: 'relative',
        aspectRatio: '16 / 9',
        borderRadius: 18,
        overflow: 'hidden',
        border: '1px solid rgba(255,195,0,0.32)',
        background: 'radial-gradient(circle at 20% 20%, rgba(255,195,0,0.24), transparent 26%), radial-gradient(circle at 80% 30%, rgba(26,240,255,0.16), transparent 28%), linear-gradient(145deg, #020617, #0f172a)',
        boxShadow: '0 24px 70px rgba(0,0,0,0.38)',
      }}>
        <div style={{ position: 'absolute', inset: 0, padding: 22, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <p style={{ margin: 0, color: GOLD, fontSize: 11, fontWeight: 950, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
              COSA Social Video Preview · Scene {sceneIndex + 1}/{safeScenes.length} · {audioEnabled ? 'Audio on' : 'Audio off'}
            </p>
            <h3 style={{ color: '#fff', fontSize: 26, lineHeight: 1.05, letterSpacing: '-0.04em', margin: '10px 0 0', maxWidth: 760 }}>
              {title || 'SignalBoost Campaign Preview'}
            </h3>
          </div>

          <div style={{ display: 'grid', gap: 10, maxWidth: 820 }}>
            <div style={{ display: 'inline-flex', alignSelf: 'flex-start', color: '#020617', background: GOLD, borderRadius: 999, padding: '6px 11px', fontWeight: 950, fontSize: 12 }}>
              {current.label}
            </div>
            <p style={{ color: '#fff', fontSize: 22, lineHeight: 1.22, fontWeight: 900, margin: 0, textShadow: '0 2px 22px rgba(0,0,0,0.8)' }}>
              {current.narration}
            </p>
            <p style={{ color: 'rgba(255,255,255,0.68)', fontSize: 13, lineHeight: 1.55, margin: 0 }}>
              Visual: {current.visual_direction}
            </p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {safeScenes.map((_, index) => (
                <span key={index} style={{ width: index === sceneIndex ? 26 : 8, height: 8, borderRadius: 999, background: index === sceneIndex ? GOLD : 'rgba(255,255,255,0.22)', transition: 'all .2s ease' }} />
              ))}
            </div>
            <p style={{ color: 'rgba(255,255,255,0.64)', fontSize: 12, margin: 0 }}>
              {callToAction || 'Owner approval required before publishing.'}
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button onClick={togglePlayback} style={buttonStyle}>{playing ? 'Pause preview' : 'Play preview'}</button>
        <button onClick={toggleAudio} style={buttonStyle}>{audioEnabled ? 'Mute narration' : 'Play narration'}</button>
        <button onClick={nextScene} style={buttonStyle}>Next scene</button>
      </div>
    </div>
  )
}

const buttonStyle: React.CSSProperties = {
  border: '1px solid rgba(255,195,0,0.36)',
  background: 'rgba(255,195,0,0.1)',
  color: GOLD,
  borderRadius: 12,
  padding: '9px 12px',
  fontWeight: 900,
  cursor: 'pointer',
}
