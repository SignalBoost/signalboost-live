'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

import { useEffect, useMemo, useRef, useState } from 'react'
import { SignalBoostGuide } from '@/lib/cos/ui/SignalBoostGuide'
import { uiText } from '@/lib/i18n/uiText'

const GOLD = '#ffc300'
const CYAN = '#1af0ff'
const SAAS_URL = 'www.' + 'saas.signalboostapp.com'
const VOICE_ENGINE_KEY = 'speech' + 'Synthesis'
const VOICE_LINE_KEY = 'Speech' + 'Synthesis' + 'Utterance'

const scenes = [
  {
    label: uiText('generatedUi.u_536ff5051d2541c9'),
    line: 'Hi, I am SignalBoost AI. I will give you a quick tour so you can see how we can help your company.',
    caption: uiText('generatedUi.u_7fa45e631489b427'),
    card: 'Official platform guide',
  },
  {
    label: uiText('generatedUi.u_a1c5ae7bcb34bbf4'),
    line: 'Many companies lose time jumping between dashboards, reviews, content tools, and approval steps.',
    caption: uiText('generatedUi.u_7c35f6b391218e08'),
    card: 'Scattered work',
  },
  {
    label: uiText('generatedUi.u_c0323ea228dc7712'),
    line: 'SignalBoost brings the work into one console so you can see what needs attention and what should happen next.',
    caption: uiText('generatedUi.u_f84c985f6f8074d2'),
    card: 'Command console',
  },
  {
    label: uiText('generatedUi.u_32d7e82082479b8c'),
    line: 'COSA can prepare recommendations and campaign drafts while you stay in control of approval.',
    caption: uiText('generatedUi.u_f4c326e52d26a9e0'),
    card: 'Approval workflow',
  },
  {
    label: uiText('generatedUi.u_020620132bbb140f'),
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
        <p className="sb-eyebrow" style={{ margin: 0 }}><LocalizedText fallback={uiText('generatedUi.u_7a0a9cf58d9b6ced')} /></p>
        <h1 style={{ color: '#fff', margin: '8px 0 0', fontSize: 34, letterSpacing: '-0.04em' }}>{uiText('generatedUi.u_805f28d1fb580d2b')}</h1>
        <p style={{ color: 'rgba(255,255,255,.68)', lineHeight: 1.7, maxWidth: 880 }}><LocalizedText fallback={uiText('generatedUi.u_9154369fa326bb0b')} /></p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={playing ? pause : start} style={primaryButton}>{playing ? uiText('generatedUi.u_06bdee6bbf1bdb4a') : uiText('generatedUi.u_425586dacde792e3')}</button>
          <button onClick={next} style={secondaryButton}><LocalizedText fallback={uiText('generatedUi.u_b36a68683301b14f')} /></button>
          <a href="/dashboard/cosa/video/draft" style={{ ...secondaryButton, textDecoration: 'none' }}><LocalizedText fallback={uiText('generatedUi.u_a7c564f97e266224')} /></a>
        </div>
      </section>

      <section style={stageWrap}>
        <div style={phoneFrame}>
          <style>{"\n            @keyframes freeScan { 0%{transform:translateX(-120%);opacity:0} 20%{opacity:1} 100%{transform:translateX(120%);opacity:0} }\n            @keyframes freePop { 0%,100%{transform:scale(.96);opacity:.72} 50%{transform:scale(1.04);opacity:1} }\n            @keyframes freeCard { 0%{transform:translateY(14px);opacity:.45} 100%{transform:translateY(0);opacity:1} }\n          "}</style>
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
            {["Console", "Reviews", "Approvals", "Content"].map((label, itemIndex) => (
              <div key={label} style={{ borderRadius: 12, padding: 8, background: itemIndex === index % 4 ? 'rgba(255,195,0,.18)' : 'rgba(255,255,255,.06)', border: itemIndex === index % 4 ? '1px solid rgba(255,195,0,.35)' : '1px solid rgba(255,255,255,.08)', color: '#fff', fontSize: 11, fontWeight: 850 }}>
                {label}
              </div>
            ))}
          </div>

          <div style={{ position: 'absolute', left: 18, right: 18, bottom: 18, zIndex: 5, borderRadius: 999, padding: '10px 12px', background: GOLD, color: '#020617', textAlign: 'center', fontWeight: 950, fontSize: 13 }}>
            {SAAS_URL}
          </div>

          <div style={{ position: 'absolute', left: 18, right: 18, top: 18, display: 'flex', justifyContent: 'space-between', zIndex: 4 }}>
            <span style={{ color: GOLD, fontWeight: 950, fontSize: 12 }}><LocalizedText fallback={uiText('generatedUi.u_7200fc7bdc9fa562')} /></span>
            <span style={{ color: 'rgba(255,255,255,.58)', fontSize: 12 }}>{index + 1}/{scenes.length}</span>
          </div>
        </div>

        <section style={infoPanel}>
          <p className="sb-eyebrow" style={{ margin: 0 }}><LocalizedText fallback={uiText('generatedUi.u_7b1f22020bc86744')} /></p>
          <h2 style={{ color: '#fff', margin: '8px 0 0', fontSize: 24 }}><LocalizedText fallback={uiText('generatedUi.u_b187fef74f036969')} /></h2>
          <p style={{ color: 'rgba(255,255,255,.72)', lineHeight: 1.7 }}><LocalizedText fallback={uiText('generatedUi.u_a7c2ff34b954f41f')} /></p>
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
