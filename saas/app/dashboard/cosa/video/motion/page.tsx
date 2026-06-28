'use client'

import { useState } from 'react'
import { AnimatedVideoBackdrop } from '@/lib/cos/ui/AnimatedVideoBackdrop'

const GOLD = '#ffc300'
const SCENES = ['Signals', 'Console', 'Checklist', 'Results']
const LANGUAGES = ['English', 'Spanish', 'Portuguese', 'Polish', 'Russian']

export default function CosaMotionPreviewPage() {
  const [sceneIndex, setSceneIndex] = useState(0)
  return (
    <main style={{ maxWidth: 1080, margin: '0 auto', display: 'grid', gap: 18 }}>
      <section style={{ border: '1px solid rgba(255,195,0,.22)', borderRadius: 24, padding: 24, background: 'rgba(15,23,42,.88)' }}>
        <p className="sb-eyebrow" style={{ margin: 0 }}>COSA motion preview</p>
        <h1 style={{ color: '#fff', margin: '8px 0 0', fontSize: 32 }}>Animated product story</h1>
        <p style={{ color: 'rgba(255,255,255,.68)', lineHeight: 1.7 }}>A better product video should include motion, narration, scene changes, workflow cards, and all five language versions.</p>
        <button onClick={() => setSceneIndex((value) => (value + 1) % SCENES.length)} style={primaryButton}>Next scene</button>
      </section>

      <section style={{ position: 'relative', aspectRatio: '16 / 9', borderRadius: 22, overflow: 'hidden', background: '#020617', border: '1px solid rgba(255,195,0,.28)' }}>
        <AnimatedVideoBackdrop sceneIndex={sceneIndex} />
        <div style={{ position: 'absolute', inset: 0, zIndex: 2, padding: 24, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <p style={{ color: GOLD, margin: 0, fontSize: 11, fontWeight: 950, letterSpacing: '.14em', textTransform: 'uppercase' }}>Scene {sceneIndex + 1}/{SCENES.length}</p>
            <h2 style={{ color: '#fff', fontSize: 38, margin: '8px 0 0' }}>{SCENES[sceneIndex]}</h2>
          </div>
          <p style={{ color: '#fff', fontSize: 24, fontWeight: 900, lineHeight: 1.25, maxWidth: 820 }}>Show the viewer how scattered business work becomes a clear guided workflow inside the console.</p>
          <div style={{ display: 'flex', gap: 6 }}>
            {SCENES.map((_, index) => <span key={index} style={{ width: index === sceneIndex ? 28 : 8, height: 8, borderRadius: 99, background: index === sceneIndex ? GOLD : 'rgba(255,255,255,.24)' }} />)}
          </div>
        </div>
      </section>

      <section style={{ border: '1px solid rgba(255,255,255,.09)', borderRadius: 18, padding: 18, background: 'rgba(15,23,42,.72)' }}>
        <p className="sb-eyebrow" style={{ margin: 0 }}>Language versions</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {LANGUAGES.map((language) => <span key={language} style={{ color: '#fff', border: '1px solid rgba(255,255,255,.12)', borderRadius: 999, padding: '8px 11px' }}>{language}</span>)}
        </div>
      </section>
    </main>
  )
}

const primaryButton: React.CSSProperties = { border: 'none', background: GOLD, color: '#000', borderRadius: 12, padding: '10px 14px', fontWeight: 950, cursor: 'pointer' }
