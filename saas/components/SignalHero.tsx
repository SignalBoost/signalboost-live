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
  { tx:  140, ty: -140 },
  { tx: -140, ty: -140 },
  { tx:  170, ty:  -60 },
  { tx: -170, ty:  -60 },
  { tx:   60, ty: -180 },
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
    const W = 560, H = 560
    canvas.width = W
    canvas.height = H
    const cx = W / 2
    const cy = W / 2

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
          Live transmissions
        </div>

        <h1
          className="font-black leading-none"
          style={{ fontSize: 'clamp(40px, 5vw, 72px)', letterSpacing: '-0.03em' }}>
          Your reviews,<br />
          heard <span style={{ color: '#ffc300' }}>everywhere</span>
        </h1>

        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 16, lineHeight: 1.7, maxWidth: 320 }}>
          We broadcast your content to global audiences — translated, voiced, and delivered instantly.
        </p>

        <div className="flex items-center gap-4">
          <button
            className="font-bold rounded-full text-black transition-all"
            style={{ background: '#ffc300', padding: '12px 32px', fontSize: 15 }}>
            Get started
          </button>
          <button
            style={{ color: 'rgba(255,255,255,0.4)', fontSize: 15, background: 'none', border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}>
            See how it works →
          </button>
        </div>

        <div className="flex flex-wrap gap-2" style={{ minHeight: 36 }}>
          {selected.length === 0 ? (
            <p style={{ color: 'rgba(255,255,255,0.18)', fontSize: 13 }}>
              Click a language signal to select it
            </p>
          ) : selected.map(name => {
            const l = LANGS.find(x => x.name === name)!
            return (
              <div key={name}
                className="flex items-center gap-2 rounded-full"
                style={{
                  padding: '6px 14px',
                  fontSize: 13,
                  fontWeight: 600,
                  background: 'rgba(255,195,0,0.12)',
                  border: '1px solid rgba(255,195,0,0.3)',
                  color: '#ffc300',
                }}>
                <span>{l.flag}</span>
                <span>{l.name}</span>
                <button
                  onClick={() => toggleLang(name)}
                  style={{ color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 4 }}>
                  ×
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* RIGHT — signal centered */}
      <div
        className="flex items-center justify-center"
        style={{ borderLeft: '1px solid rgba(255,255,255,0.05)', height: '100%' }}>
        <div style={{ position: 'relative', width: 560, height: 560 }}>
          <canvas
            ref={canvasRef}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />

          {tags.map(t => (
            <button
              key={t.id}
              onClick={() => toggleLang(t.lang.name)}
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: `translate(calc(-50% + ${t.pos.tx}px), calc(-50% + ${t.pos.ty}px))`,
                animation: 'tagFloat 3.5s ease-out forwards',
                background: selected.includes(t.lang.name) ? '#ffc300' : 'rgba(255,195,0,0.08)',
                border: `1px solid ${selected.includes(t.lang.name) ? '#ffc300' : 'rgba(255,195,0,0.3)'}`,
                color: selected.includes(t.lang.name) ? '#000' : '#ffc300',
                borderRadius: 999,
                padding: '8px 18px',
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.05em',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}>
              {t.lang.flag} {t.lang.name}
            </button>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes tagFloat {
          0%   { opacity: 0; transform: translate(calc(-50% + 0px), calc(-50% + 0px)) scale(0.8); }
          12%  { opacity: 1; }
          75%  { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </section>
  )
}
