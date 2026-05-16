'use client'

import { useEffect, useRef, useState } from 'react'

const LANGS = [
  { name: 'English',   flag: '🇺🇸' },
  { name: 'Português', flag: '🇧🇷' },
  { name: 'Español',   flag: '🇪🇸' },
  { name: 'Polski',    flag: '🇵🇱' },
  { name: 'Русский',   flag: '🇷🇺' },
]

const POSITIONS = [
  { tx:  140, ty: -160 },
  { tx: -140, ty: -160 },
  { tx:  170, ty:  -80 },
  { tx: -170, ty:  -80 },
  { tx:   60, ty: -200 },
]

export default function SignalHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [tags, setTags] = useState<{ id: number; lang: typeof LANGS[0]; pos: typeof POSITIONS[0] }[]>([])
  const [headlineLang, setHeadlineLang] = useState(0)
  const tagIdRef = useRef(0)
  const langIdxRef = useRef(0)
  const posIdxRef = useRef(0)
  const lastSpawnRef = useRef(0)

  useEffect(() => {
    const t = setInterval(() => setHeadlineLang(i => (i + 1) % LANGS.length), 2000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const W = 560, H = 560
    canvas.width = W
    canvas.height = H
    const cx = W / 2
    const cy = H - 100

    let rings: { r: number; alpha: number }[] = []
    let raf: number

    function draw(ts: number) {
      ctx.clearRect(0, 0, W, H)

      if (!lastSpawnRef.current || ts - lastSpawnRef.current > 2200) {
        rings.push({ r: 0, alpha: 1 })
        lastSpawnRef.current = ts
        spawnTag()
      }

      rings = rings.filter(r => r.alpha > 0.005)
      for (const r of rings) {
        r.r += 1.8
        r.alpha -= 0.005
        const arcs   = [1, 0.70, 0.44]
        const widths = [2.5, 1.6, 1.0]
        const alphas = [0.85, 0.50, 0.28]
        for (let i = 0; i < 3; i++) {
          if (r.r * arcs[i] < 10) continue
          ctx.globalAlpha = Math.max(0, r.alpha * alphas[i])
          ctx.strokeStyle = '#ffc300'
          ctx.lineWidth = widths[i]
          ctx.beginPath()
          ctx.arc(cx, cy, r.r * arcs[i], Math.PI, 0)
          ctx.stroke()
        }
      }

      ctx.globalAlpha = 0.2
      ctx.fillStyle = '#ffc300'
      ctx.beginPath()
      ctx.arc(cx, cy, 32, 0, Math.PI * 2)
      ctx.fill()

      ctx.globalAlpha = 1
      ctx.fillStyle = '#ffc300'
      ctx.beginPath()
      ctx.arc(cx, cy, 10, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#0a0a0f'
      ctx.beginPath()
      ctx.arc(cx, cy, 5, 0, Math.PI * 2)
      ctx.fill()

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  function spawnTag() {
    const lang = LANGS[langIdxRef.current % LANGS.length]
    const pos  = POSITIONS[posIdxRef.current % POSITIONS.length]
    langIdxRef.current++
    posIdxRef.current++
    const id = tagIdRef.current++
    setTags(prev => [...prev, { id, lang, pos }])
    setTimeout(() => setTags(prev => prev.filter(t => t.id !== id)), 3500)
  }

  function toggleLang(name: string) {
    setSelected(prev =>
      prev.includes(name) ? prev.filter(l => l !== name) : [...prev, name]
    )
  }

  return (
    <section
      style={{ minHeight: 'calc(100vh - 65px)' }}
      className="grid grid-cols-2 items-center">

      {/* LEFT */}
      <div className="flex flex-col gap-7 px-16">

        <div
          className="flex items-center gap-2 w-fit rounded-full px-4 py-2 text-xs font-bold tracking-widest uppercase"
          style={{ background: 'rgba(255,195,0,0.1)', border: '1px solid rgba(255,195,0,0.25)', color: '#ffc300' }}>
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#ffc300' }} />
          Build · Review · Broadcast
        </div>

        <h1
          className="font-black leading-none"
          style={{ fontSize: 'clamp(40px, 5vw, 68px)', letterSpacing: '-0.03em' }}>
          Build your brand<br />
          in{' '}
          <span
            key={headlineLang}
            style={{
              color: '#ffc300',
              display: 'inline-block',
              animation: 'fadeSlide 0.4s ease-out',
            }}>
            {LANGS[headlineLang].name}
          </span>
        </h1>

        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 16, lineHeight: 1.7, maxWidth: 340 }}>
          Create your website, collect customer reviews, and produce native audio & video content — all in your language,
