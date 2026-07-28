'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

import { useEffect, useMemo, useRef, useState } from 'react'
import { SignalBoostGuide } from '@/lib/cos/ui/SignalBoostGuide'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


const GOLD = '#ffc300'
const CYAN = '#1af0ff'
const SAAS_URL = 'www.' + 'saas.signalboostapp.com'
const VOICE_ENGINE_KEY = 'speech' + 'Synthesis'
const VOICE_LINE_KEY = 'Speech' + 'Synthesis' + 'Utterance'

const scenes = [
  {
    label: uiCopy('u_3b15ceee3ea3971c'),
    line: 'Hi, I am SignalBoost AI. I will give you a quick tour so you can see how we can help your company.',
    caption: uiCopy('u_8ad8d9ba961501c2'),
    card: 'Official platform guide',
  },
  {
    label: uiCopy('u_295d29ab022b69e5'),
    line: 'Many companies lose time jumping between dashboards, reviews, content tools, and approval steps.',
    caption: uiCopy('u_4f3803dcd60310ce'),
    card: 'Scattered work',
  },
  {
    label: uiCopy('u_4e25292c2db00d6f'),
    line: 'SignalBoost brings the work into one console so you can see what needs attention and what should happen next.',
    caption: uiCopy('u_b0199c277b3616de'),
    card: 'Command console',
  },
  {
    label: uiCopy('u_fda14b9bf4743d24'),
    line: 'COSA can prepare recommendations and campaign drafts while you stay in control of approval.',
    caption: uiCopy('u_6fe0a8fd57463cd7'),
    card: 'Approval workflow',
  },
  {
    label: uiCopy('u_01fc71856332cc49'),
    line: `Visit ${SAAS_URL} and see how SignalBoost can help your company turn scattered work into approved action.`,
    caption: `Visit ${SAAS_URL}`,
    card: 'Start the tour',
  },
]

function getVoiceEngine(): any {
  if (typeof window === 'undefined') return null
  return (window as any)[VOICE_ENGINE_KEY] || null
}

export default function FreeSignalBoostAiVideoPage() {
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const playingRef = useRef(false)
  const current = scenes[index]

  useEffect(() => { playingRef.current = playing }, [playing])

  function stopVoice() {
    const engine = getVoiceEngine()
    if (engine) engine.cancel()
    setSpeaking(false)
  }

  function next() {
    setIndex(value => (value + 1) % scenes.length)
  }

  function speak(sceneIndex: number) {
    if (typeof window === 'undefined') return
    const engine = getVoiceEngine()
    const VoiceLine = (window as any)[VOICE_LINE_KEY]
    if (!engine || !VoiceLine) return
    engine.cancel()
    const item = scenes[sceneIndex]
    const line = new VoiceLine(item.line)
    line.rate = 0.96
    line.pitch = 0.98
    line.onstart = () => setSpeaking(true)
    line.onend = () => {
      setSpeaking(false)
      if (playingRef.current) window.setTimeout(next, 350)
    }
    line.onerror = () => setSpeaking(false)
    engine.speak(line)
  }

  function start() {
    setPlaying(true)
    speak(index)
  }

  function pause() {
    setPlaying(false)
    stopVoice()
  }

  useEffect(() => {
    if (!playing) return
    speak(index)
    return () => stopVoice()
  }, [index])

  const script = useMemo(() => scenes.map((scene, sceneIndex) => `${sceneIndex + 1}. ${scene.label}: ${scene.line}`).join('\n'), [])

  return (
    <main style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gap: 18 }}>
      <section style={heroCard}>
        <p className="sb-eyebrow" style={{ margin: 0 }}><LocalizedText fallback={uiCopy('u_05e2f924ab864f84')} /></p>
        <h1 style={{ color: '#fff', margin: '8px 0 0', fontSize: 34, letterSpacing: '-0.04em' }}>{uiCopy('u_0e449292d2611174')}</h1>
        <p style={{ color: 'rgba(255,255,255,.68)', lineHeight: 1.7, maxWidth: 880 }}><LocalizedText fallback={uiCopy('u_f373631719de8bd0')} /></p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={playing ? pause : start} style={primaryButton}>{playing ? uiCopy('u_d0156b50b1e8e2ed') : uiCopy('u_835459db365cb873')}</button>
          <button onClick={next} style={secondaryButton}><LocalizedText fallback={uiCopy('u_5a3959c48df883d6')} /></button>
          <a href="/dashboard/cosa/video/draft" style={{ ...secondaryButton, textDecoration: 'none' }}><LocalizedText fallback={uiCopy('u_fe7842749fb0018c')} /></a>
        </div>
      </section>

      <section style={stageWrap}>
        <div style={phoneFrame}>
          <style>{uiCopy('u_53bd4d71dd2c85f5')}</style>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 30% 8%, rgba(255,195,0,.24), transparent 34%), linear-gradient(180deg, #020617, #0f172a)' }} />
          <span style={{ position: 'absolute', left: 0, right: 0, top: 126, height: 3, background: `linear-gradient(90deg, transparent, ${CYAN}, ${GOLD}, transparent)`, animation: 'freeScan 3s linear infinite' }} />

          <div style={{ position: 'absolute', left: '50%', top: 34, transform: 'translateX(-50%) scale(.92)', zIndex: 3 }}>
            <SignalBoostGuide active={playing || speaking} />
          </div>

          <div style={{ position: 'absolute', left: 18, right: 18, top: 300, zIndex: 4, textAlign: 'center' }}>
            <div style={{ color: GOLD, fontWeight: 950, fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase' }}>{current.label}</div>
            <h2 style={{ color: '#fff', fontSize: 30, lineHeight: 1.02, margin: '8px 0 0' }}>{current.caption}</h2>
          </div>

          <div style={{ position: 'absolute', left: 18, right: 18, bottom: 116, zIndex: 4, borderRadius: 20, padding: 16, background: 'rgba(2,6,23,.82)', border: '1px solid rgba(255,195,0,.28)', animation: 'freeCard .35s ease-out' }}>
            <p style={{ color: '#fff', fontSize: 19, lineHeight: 1.28, fontWeight: 850, margin: 0 }}>{current.line}</p>
          </div>

          <div style={{ position: 'absolute', left: 18, right: 18, bottom: 62, zIndex: 4, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[uiCopy('u_34e92f38e9c75d38'), uiCopy('u_6216dd66a5616f8b'), uiCopy('u_afacf1b589b97a02'), uiCopy('u_27ada089270225e1')].map((label, itemIndex) => (
              <div key={label} style={{ borderRadius: 12, padding: 8, background: itemIndex === index % 4 ? 'rgba(255,195,0,.18)' : 'rgba(255,255,255,.06)', border: itemIndex === index % 4 ? '1px solid rgba(255,195,0,.35)' : '1px solid rgba(255,255,255,.08)', color: '#fff', fontSize: 11, fontWeight: 850 }}>
                {label}
              </div>
            ))}
          </div>

          <div style={{ position: 'absolute', left: 18, right: 18, bottom: 18, zIndex: 5, borderRadius: 999, padding: '10px 12px', background: GOLD, color: '#020617', textAlign: 'center', fontWeight: 950, fontSize: 13 }}>
            {SAAS_URL}
          </div>

          <div style={{ position: 'absolute', left: 18, right: 18, top: 18, display: 'flex', justifyContent: 'space-between', zIndex: 4 }}>
            <span style={{ color: GOLD, fontWeight: 950, fontSize: 12 }}><LocalizedText fallback={uiCopy('u_17c6b295c3a1402e')} /></span>
            <span style={{ color: 'rgba(255,255,255,.58)', fontSize: 12 }}>{index + 1}/{scenes.length}</span>
          </div>
        </div>

        <section style={infoPanel}>
          <p className="sb-eyebrow" style={{ margin: 0 }}><LocalizedText fallback={uiCopy('u_a1001041dbc117df')} /></p>
          <h2 style={{ color: '#fff', margin: '8px 0 0', fontSize: 24 }}><LocalizedText fallback={uiCopy('u_2a3a20fb6907cb40')} /></h2>
          <p style={{ color: 'rgba(255,255,255,.72)', lineHeight: 1.7 }}><LocalizedText fallback={uiCopy('u_9834f4c654a960e8')} /></p>
          <pre style={{ whiteSpace: 'pre-wrap', color: 'rgba(255,255,255,.82)', background: 'rgba(0,0,0,.26)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: 14, fontSize: 12, lineHeight: 1.6, maxHeight: 340, overflow: 'auto' }}>{script}</pre>
        </section>
      </section>
    </main>
  )
}

const heroCard: React.CSSProperties = { border: '1px solid rgba(255,195,0,.22)', borderRadius: 24, padding: 24, background: 'linear-gradient(145deg, rgba(15,23,42,.94), rgba(2,6,23,.98))' }
const stageWrap: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(320px, 440px) 1fr', gap: 18, alignItems: 'start' }
const phoneFrame: React.CSSProperties = { position: 'relative', width: '100%', maxWidth: 420, aspectRatio: '9 / 16', borderRadius: 34, overflow: 'hidden', border: '2px solid rgba(255,195,0,.38)', background: '#020617', boxShadow: '0 28px 90px rgba(0,0,0,.45)' }
const infoPanel: React.CSSProperties = { border: '1px solid rgba(255,255,255,.09)', borderRadius: 18, padding: 18, background: 'rgba(15,23,42,.72)' }
const primaryButton: React.CSSProperties = { border: 'none', background: GOLD, color: '#000', borderRadius: 12, padding: '10px 14px', fontWeight: 950, cursor: 'pointer' }
const secondaryButton: React.CSSProperties = { border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.06)', color: '#fff', borderRadius: 12, padding: '10px 14px', fontWeight: 850, cursor: 'pointer' }
