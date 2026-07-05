'use client'

// saas/components/AutomatedVideoStudio.tsx
// Zero-subscription programmatic video generation engine with deterministic
// frame-driven React composition, glassmorphic transitions, image layers, and
// pay-as-you-go TTS telemetry for EN/PT/ES/PL/RU.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import { avStudioFallback } from '@/lib/i18n/avStudioCopy'

export type CompositionLayer =
  | { kind: 'headline'; text: string }
  | { kind: 'tagline'; text: string }
  | { kind: 'cta'; text: string }
  | { kind: 'image'; src: string; alt: string }

export type CompositionScene = {
  id: string
  durationInFrames: number
  background: string
  layers: CompositionLayer[]
}

export type CompositionSpec = {
  fps: number
  width: number
  height: number
  scenes: CompositionScene[]
  voiceoverLang: string
  voiceoverScript: string
  estimatedNarrationSeconds: number
  estimatedTtsCostUsd: number
  brandBanner: { primary: string; secondary: string }
}

const FPS = 30
const TRANSITION_FRAMES = 18
const TTS_RATE_PER_1K_CHARS = 0.18
const WORDS_PER_MINUTE = 150

const VOICE_LANGS: { code: string; label: string; bcp47: string }[] = [
  { code: 'en', label: 'English', bcp47: 'en-US' },
  { code: 'pt', label: 'Português', bcp47: 'pt-BR' },
  { code: 'es', label: 'Español', bcp47: 'es-MX' },
  { code: 'pl', label: 'Polski', bcp47: 'pl-PL' },
  { code: 'ru', label: 'Русский', bcp47: 'ru-RU' },
]

const AVAILABLE_LANG_CODES = new Set(VOICE_LANGS.map((voice) => voice.code))

function clamp01(value: number) {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

function interpolate(frame: number, from: number, to: number, a: number, b: number) {
  if (to === from) return b
  return a + (b - a) * clamp01((frame - from) / (to - from))
}

function easeOutCubic(value: number) {
  const p = clamp01(value)
  return 1 - Math.pow(1 - p, 3)
}

function springIn(frame: number, delay: number, duration: number) {
  const p = easeOutCubic((frame - delay) / duration)
  return { opacity: clamp01((frame - delay) / (duration * 0.6)), translateY: (1 - p) * 42 }
}

function HeadlineLayer({ text, frame }: { text: string; frame: number }) {
  const s = springIn(frame, 6, 26)
  return (
    <h2
      className="text-center font-black leading-tight"
      style={{
        fontFamily: 'var(--sb-font-display)',
        fontSize: 'clamp(1.4rem, 4.2vw, 2.9rem)',
        color: '#ffffff',
        textShadow: '0 4px 30px rgba(0,0,0,0.85), 0 1px 2px rgba(0,0,0,0.9)',
        opacity: s.opacity,
        transform: `translateY(${s.translateY}px)`,
        letterSpacing: '-0.02em',
      }}
    >
      {text}
    </h2>
  )
}

function TaglineLayer({ text, frame }: { text: string; frame: number }) {
  const s = springIn(frame, 20, 24)
  return (
    <p
      className="text-center font-semibold"
      style={{
        fontFamily: 'var(--sb-font-display)',
        fontSize: 'clamp(0.9rem, 2.2vw, 1.35rem)',
        color: '#e8f6ff',
        textShadow: '0 2px 18px rgba(0,0,0,0.9)',
        opacity: s.opacity,
        transform: `translateY(${s.translateY}px)`,
        maxWidth: '78%',
        margin: '0 auto',
      }}
    >
      {text}
    </p>
  )
}

function CtaLayer({ text, frame }: { text: string; frame: number }) {
  const s = springIn(frame, 34, 22)
  const pulse = 1 + Math.sin(frame / 9) * 0.015
  return (
    <div className="flex justify-center" style={{ opacity: s.opacity, transform: `translateY(${s.translateY}px)` }}>
      <span
        className="rounded-full px-6 py-2 font-bold"
        style={{
          fontFamily: 'var(--sb-font-display)',
          fontSize: 'clamp(0.8rem, 1.8vw, 1.05rem)',
          color: '#07111f',
          background: 'linear-gradient(120deg, #ffc300 0%, #ffd94d 100%)',
          boxShadow: '0 8px 32px rgba(255,195,0,0.35)',
          transform: `scale(${pulse})`,
          display: 'inline-block',
        }}
      >
        {text}
      </span>
    </div>
  )
}

function ImageLayer({ src, alt, frame, durationInFrames }: { src: string; alt: string; frame: number; durationInFrames: number }) {
  const scale = interpolate(frame, 0, durationInFrames, 1.04, 1.14)
  const drift = interpolate(frame, 0, durationInFrames, 0, -14)
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="h-full w-full object-cover" style={{ transform: `scale(${scale}) translateX(${drift}px)`, filter: 'saturate(1.08) contrast(1.05)' }} />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(3,7,18,0.25) 0%, rgba(3,7,18,0.72) 100%)' }} />
    </div>
  )
}

function BrandBanner() {
  return (
    <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-5 py-2" style={{ background: 'rgba(3, 7, 18, 0.78)', backdropFilter: 'blur(8px)', borderTop: '1px solid rgba(26,240,255,0.25)' }}>
      <span className="font-black tracking-wide" style={{ color: '#ffc300', fontFamily: 'var(--sb-font-display)', fontSize: 'clamp(0.7rem, 1.6vw, 0.95rem)' }}>SignalBoostAi</span>
      <span className="font-semibold" style={{ color: '#1af0ff', fontFamily: 'var(--sb-font-mono)', fontSize: 'clamp(0.62rem, 1.4vw, 0.85rem)' }}>www.saas.signalboostapp.com</span>
    </div>
  )
}

function SceneFrame({ scene, frame }: { scene: CompositionScene; frame: number }) {
  const imageLayer = scene.layers.find((layer) => layer.kind === 'image') as Extract<CompositionLayer, { kind: 'image' }> | undefined
  const textLayers = scene.layers.filter((layer) => layer.kind !== 'image')
  const inProgress = easeOutCubic(frame / TRANSITION_FRAMES)
  const outStart = scene.durationInFrames - TRANSITION_FRAMES
  const outProgress = frame > outStart ? easeOutCubic((frame - outStart) / TRANSITION_FRAMES) : 0
  const glassOpacity = Math.max(1 - inProgress, outProgress)
  const glassBlur = 6 + glassOpacity * 14

  return (
    <div className="absolute inset-0" style={{ background: scene.background }}>
      {imageLayer ? <ImageLayer src={imageLayer.src} alt={imageLayer.alt} frame={frame} durationInFrames={scene.durationInFrames} /> : null}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6">
        {textLayers.map((layer, index) => {
          if (layer.kind === 'headline') return <HeadlineLayer key={index} text={layer.text} frame={frame} />
          if (layer.kind === 'tagline') return <TaglineLayer key={index} text={layer.text} frame={frame} />
          if (layer.kind === 'cta') return <CtaLayer key={index} text={layer.text} frame={frame} />
          return null
        })}
      </div>
      {glassOpacity > 0.01 ? <div className="pointer-events-none absolute inset-0" style={{ opacity: glassOpacity, background: 'linear-gradient(135deg, rgba(26,240,255,0.10) 0%, rgba(255,195,0,0.08) 60%, rgba(7,17,31,0.55) 100%)', backdropFilter: `blur(${glassBlur}px)`, border: '1px solid rgba(255,255,255,0.08)' }} /> : null}
      <BrandBanner />
    </div>
  )
}

export type AutomatedVideoStudioProps = {
  imageAssets?: { src: string; alt: string }[]
  onExportSpec?: (spec: CompositionSpec) => void
}

export default function AutomatedVideoStudio({ imageAssets, onExportSpec }: AutomatedVideoStudioProps) {
  const { dict, lang } = useI18n()
  const tt = useCallback((key: string) => t(dict, `avstudio.${key}`, avStudioFallback(lang, key)), [dict, lang])
  const [voiceLang, setVoiceLang] = useState<string>(lang && AVAILABLE_LANG_CODES.has(lang) ? lang : 'en')
  const [isPlaying, setIsPlaying] = useState(false)
  const [frame, setFrame] = useState(0)
  const [speaking, setSpeaking] = useState(false)
  const [notice, setNotice] = useState('')
  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef(0)
  const frameRef = useRef(0)

  const creative = useMemo(() => ({ headline: avStudioFallback(voiceLang, 'headline'), tagline: avStudioFallback(voiceLang, 'tagline'), cta: avStudioFallback(voiceLang, 'cta') }), [voiceLang])

  const scenes: CompositionScene[] = useMemo(() => {
    const assets = imageAssets && imageAssets.length > 0 ? imageAssets : []
    return [
      { id: 'intro', durationInFrames: FPS * 3, background: 'radial-gradient(120% 120% at 20% 10%, #0d2b4a 0%, #07111f 55%, #030712 100%)', layers: [{ kind: 'headline', text: creative.headline }] },
      { id: 'value', durationInFrames: FPS * 4, background: 'linear-gradient(160deg, #07111f 0%, #0a1d33 60%, #030712 100%)', layers: [...(assets[0] ? [{ kind: 'image', src: assets[0].src, alt: assets[0].alt } as CompositionLayer] : []), { kind: 'headline', text: creative.headline }, { kind: 'tagline', text: creative.tagline }] },
      { id: 'cta', durationInFrames: FPS * 3, background: 'radial-gradient(110% 140% at 80% 90%, #123a5e 0%, #07111f 50%, #030712 100%)', layers: [{ kind: 'tagline', text: creative.tagline }, { kind: 'cta', text: creative.cta }] },
    ]
  }, [creative, imageAssets])

  const totalFrames = useMemo(() => scenes.reduce((sum, scene) => sum + scene.durationInFrames, 0), [scenes])

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      return
    }
    const tick = (timestamp: number) => {
      if (!lastTsRef.current) lastTsRef.current = timestamp
      const elapsed = timestamp - lastTsRef.current
      const advance = Math.floor(elapsed / (1000 / FPS))
      if (advance > 0) {
        lastTsRef.current = timestamp
        frameRef.current += advance
        if (frameRef.current >= totalFrames) {
          frameRef.current = totalFrames - 1
          setFrame(frameRef.current)
          setIsPlaying(false)
          return
        }
        setFrame(frameRef.current)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      lastTsRef.current = 0
    }
  }, [isPlaying, totalFrames])

  const restart = useCallback(() => {
    frameRef.current = 0
    lastTsRef.current = 0
    setFrame(0)
    setIsPlaying(true)
  }, [])

  const { activeScene, localFrame, sceneIndex } = useMemo(() => {
    let cursor = 0
    for (let i = 0; i < scenes.length; i += 1) {
      const scene = scenes[i]
      if (frame < cursor + scene.durationInFrames) return { activeScene: scene, localFrame: frame - cursor, sceneIndex: i }
      cursor += scene.durationInFrames
    }
    const last = scenes[scenes.length - 1]
    return { activeScene: last, localFrame: last.durationInFrames - 1, sceneIndex: scenes.length - 1 }
  }, [frame, scenes])

  const script = useMemo(() => `${creative.headline} ${creative.tagline} ${creative.cta}`, [creative])
  const charCount = script.length
  const wordCount = script.trim().split(/\s+/).filter(Boolean).length
  const estimatedNarrationSeconds = Math.max(1, Math.round((wordCount / WORDS_PER_MINUTE) * 60))
  const estimatedCost = (charCount / 1000) * TTS_RATE_PER_1K_CHARS

  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [])

  const speak = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setNotice(tt('ttsUnavailable'))
      return
    }
    const synth = window.speechSynthesis
    synth.cancel()
    const utterance = new SpeechSynthesisUtterance(script)
    const target = VOICE_LANGS.find((voice) => voice.code === voiceLang) || VOICE_LANGS[0]
    utterance.lang = target.bcp47
    const match = synth.getVoices().find((voice) => voice.lang && voice.lang.toLowerCase().startsWith(voiceLang))
    if (match) utterance.voice = match
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)
    setSpeaking(true)
    synth.speak(utterance)
  }, [script, voiceLang, tt])

  useEffect(() => () => stopSpeaking(), [stopSpeaking])

  const exportSpec = useCallback(async () => {
    const spec: CompositionSpec = { fps: FPS, width: 1280, height: 720, scenes, voiceoverLang: voiceLang, voiceoverScript: script, estimatedNarrationSeconds, estimatedTtsCostUsd: estimatedCost, brandBanner: { primary: 'SignalBoostAi', secondary: 'www.saas.signalboostapp.com' } }
    if (onExportSpec) onExportSpec(spec)
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(JSON.stringify(spec, null, 2))
        setNotice(tt('specCopied'))
      }
    } catch {}
  }, [scenes, voiceLang, script, estimatedNarrationSeconds, estimatedCost, onExportSpec, tt])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 3500)
    return () => clearTimeout(timer)
  }, [notice])

  const progress = totalFrames > 0 ? frame / (totalFrames - 1) : 0

  return (
    <section className="w-full rounded-2xl p-5" style={{ background: 'linear-gradient(160deg, #07111f 0%, #0a1a2e 100%)', border: '1px solid rgba(26,240,255,0.18)' }}>
      <header className="mb-4">
        <h3 className="text-lg font-black" style={{ color: '#ffc300', fontFamily: 'var(--sb-font-display)' }}>🎬 {tt('title')}</h3>
        <p className="text-sm" style={{ color: '#9db4cc' }}>{tt('subtitle')}</p>
      </header>
      <div className="relative mx-auto w-full overflow-hidden rounded-xl" style={{ aspectRatio: '16 / 9', maxWidth: 860, boxShadow: '0 18px 60px rgba(0,0,0,0.55)' }}>
        <SceneFrame scene={activeScene} frame={localFrame} />
      </div>
      <div className="mx-auto mt-4 flex w-full max-w-[860px] flex-wrap items-center gap-3">
        <button type="button" onClick={() => (frame >= totalFrames - 1 ? restart() : setIsPlaying((value) => !value))} className="rounded-lg px-4 py-2 text-sm font-bold" style={{ background: '#ffc300', color: '#07111f' }}>{isPlaying ? `⏸ ${tt('pause')}` : `▶ ${tt('play')}`}</button>
        <button type="button" onClick={restart} className="rounded-lg px-4 py-2 text-sm font-bold" style={{ background: 'rgba(26,240,255,0.12)', color: '#1af0ff', border: '1px solid rgba(26,240,255,0.35)' }}>↺ {tt('restart')}</button>
        <span className="text-xs font-semibold" style={{ color: '#9db4cc', fontFamily: 'var(--sb-font-mono)' }}>{tt('scene')} {sceneIndex + 1}/{scenes.length} · {tt('durationLabel')} {(totalFrames / FPS).toFixed(1)}s · {tt('fpsLabel')} {FPS}</span>
        <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}><div className="h-full rounded-full" style={{ width: `${progress * 100}%`, background: 'linear-gradient(90deg, #1af0ff 0%, #ffc300 100%)', transition: 'width 60ms linear' }} /></div>
      </div>
      <div className="mx-auto mt-5 w-full max-w-[860px] rounded-xl p-4" style={{ background: 'rgba(3,7,18,0.55)', border: '1px solid rgba(255,195,0,0.22)' }}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-black" style={{ color: '#1af0ff', fontFamily: 'var(--sb-font-display)' }}>🔊 {tt('ttsBlock')}</h4>
          <label className="flex items-center gap-2 text-xs font-semibold" style={{ color: '#9db4cc' }}>{tt('voiceLang')}<select value={voiceLang} onChange={(event) => { stopSpeaking(); setVoiceLang(event.target.value) }} className="rounded-md px-2 py-1 text-xs font-bold" style={{ background: '#0a1a2e', color: '#e8f6ff', border: '1px solid rgba(26,240,255,0.3)' }}>{VOICE_LANGS.map((voice) => <option key={voice.code} value={voice.code}>{voice.label}</option>)}</select></label>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <button type="button" onClick={() => (speaking ? stopSpeaking() : speak())} className="rounded-lg px-4 py-2 text-sm font-bold" style={{ background: speaking ? 'rgba(255,80,80,0.15)' : 'rgba(26,240,255,0.12)', color: speaking ? '#ff8080' : '#1af0ff', border: '1px solid rgba(26,240,255,0.35)' }}>{speaking ? `■ ${tt('ttsStop')}` : `▶ ${tt('ttsPreview')}`}</button>
          <span className="text-xs" style={{ color: '#9db4cc', fontFamily: 'var(--sb-font-mono)' }}>{tt('ttsChars')}: {charCount} · {tt('ttsDuration')}: {estimatedNarrationSeconds}s · {tt('ttsRate')}: ${TTS_RATE_PER_1K_CHARS.toFixed(2)}/1k · {tt('ttsCost')}: ${estimatedCost.toFixed(4)}</span>
        </div>
        <p className="mt-3 text-xs italic" style={{ color: '#6f88a3' }}>“{script}”</p>
      </div>
      <div className="mx-auto mt-4 flex w-full max-w-[860px] items-center justify-between gap-3">
        <button type="button" onClick={exportSpec} className="rounded-lg px-4 py-2 text-sm font-bold" style={{ background: 'rgba(255,195,0,0.12)', color: '#ffc300', border: '1px solid rgba(255,195,0,0.4)' }}>⬇ {tt('exportSpec')}</button>
        {notice ? <span className="text-xs font-semibold" style={{ color: '#1af0ff' }}>{notice}</span> : null}
      </div>
    </section>
  )
}
