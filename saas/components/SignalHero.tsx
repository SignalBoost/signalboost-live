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
  { tx:  130, ty: -160 },
  { tx: -130, ty: -160 },
  { tx:  160, ty:  -80 },
  { tx: -160, ty:  -80 },
  { tx:   50, ty: -190 },
]

export default function SignalHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [tags, setTags] = useState<{ id: number; lang: typeof LANGS[0]; pos: typeof POSITIONS[0] }[]>([])
  const tagIdRef = useRef(0)
  const langIdxRef = useRef(0)
  const posIdxRef = useRef(0)
  const lastSpawnRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const W = 500, H = 420
    canvas.width = W
    canvas.height = H
    const cx = W / 2, cy = H - 80

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

      ctx.globalAlpha = 0.18
      ctx.fillStyle = '#ffc300'
      ctx.beginPath()
      ctx.arc(cx, cy, 28, 0, Math.PI * 2)
      ctx.fill()

      ctx.globalAlpha = 1
      ctx.fillStyle = '#ffc300'
      ctx.beginPath()
      ctx.arc(cx, cy, 9, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#0a0a0f'
      ctx.beginPath()
      ctx.arc(cx, cy, 4, 0, Math.PI * 2)
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
    <section style={{ minHeight: 'calc(100vh - 65px)' }}
      className="grid grid-cols-2 items-center px-6">

      <div className="flex flex-col gap-6 pl-8 pr-4">
        <div className="flex items-center gap-2 w-fit rounded-full px-4 py-2 text-xs font-bold tracking-widest uppercase"
          style={{ background: 'rgba(255,195,0,0.1)', border: '1px solid rgba(255,195,0,0.25)', color: '#ffc300' }}>
          <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
          Live transmissions
        </div>

        <h1 className="text-6xl font-black leading-tight" style={{ letterSpacing: '-0.02em' }}>
          Your reviews,<br />
          heard <span style={{ color: '#ffc300' }}>everywhere</span>
        </h1>

        <p className="text-lg max-w-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
          We broadcast your content to global audiences — translated, voiced, and delivered instantly.
        </p>

        <div className="flex items-center gap-4">
          <button className="font-bold px-8 py-3 rounded-full text-black text-base transition-all hover:scale-105"
            style={{ background: '#ffc300' }}>
            Get started
          </button>
          <button className="text-base transition-colors" style={{ color: 'rgba(255,255,255,0.45)' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.45)')}>
            See how it works →
          </button>
        </div>

        <div className="flex flex-wrap gap-2 min-h-[36px]">
          {selected.length === 0 ? (
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.2)' }}>
              Click a language signal to select it
            </p>
          ) : selected.map(name => {
            const l = LANGS.find(x => x.name === name)!
            return (
              <div key={name}
                className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold"
                style={{ background: 'rgba(255,195,0,0.12)', border: '1px solid rgba(255,195,0,0.3)', color: '#ffc300' }}>
                <span>{l.flag}</span>
                <span>{l.name}</span>
                <button onClick={() => toggleLang(name)}
                  className="ml-1 leading-none"
                  style={{ color: 'rgba(255,255,255,0.35)' }}>×</button>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex items-center justify-center h-full"
        style={{ borderLeft: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="relative" style={{ width: 500, height: 420 }}>
          <canvas ref={canvasRef}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />

          {tags.map(t => (
            <button key={t.id}
              onClick={() => toggleLang(t.lang.name)}
              className="absolute text-sm font-bold tracking-widest uppercase rounded-full px-4 py-2 cursor-pointer"
              style={{
                left: '50%',
                top: '81%',
                transform: `translate(calc(-50% + ${t.pos.tx}px), calc(-50% + ${t.pos.ty}px))`,
                animation: 'tagFloat 3.5s ease-out forwards',
                background: selected.includes(t.lang.name) ? '#ffc300' : 'rgba(255,195,0,0.08)',
                border: `1px solid ${selected.includes(t.lang.name) ? '#ffc300' : 'rgba(255,195,0,0.3)'}`,
                color: selected.includes(t.lang.name) ? '#000' : '#ffc300',
                whiteSpace: 'nowrap',
              }}>
              {t.lang.flag} {t.lang.name}
            </button>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes tagFloat {
          0%   { opacity: 0; transform: translate(calc(-50% + 0px), calc(-50% + 0px)) scale(0.85); }
          12%  { opacity: 1; }
          75%  { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </section>
  )
}
