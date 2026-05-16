'use client'

import { useEffect, useRef, useState } from 'react'

const LANGS = [
  { name: 'English',    flag: '🇺🇸' },
  { name: 'Português',  flag: '🇧🇷' },
  { name: 'Español',    flag: '🇪🇸' },
  { name: 'Polski',     flag: '🇵🇱' },
  { name: 'Русский',    flag: '🇷🇺' },
]

const POSITIONS = [
  { tx:  100, ty: -120 },
  { tx: -100, ty: -120 },
  { tx:  120, ty:  -65 },
  { tx: -120, ty:  -65 },
  { tx:   55, ty: -150 },
]

export default function SignalHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [tags, setTags] = useState<{ id: number; lang: typeof LANGS[0]; pos: typeof POSITIONS[0]; alive: boolean }[]>([])
  const tagIdRef = useRef(0)
  const langIdxRef = useRef(0)
  const posIdxRef = useRef(0)

  // Canvas signal animation
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    canvas.width = 320
    canvas.height = 340
    const cx = 160, cy = 280

    let rings: { r: number; alpha: number }[] = []
    let lastSpawn = 0
    let raf: number

    function draw(ts: number) {
      ctx.clearRect(0, 0, 320, 340)

      if (!lastSpawn || ts - lastSpawn > 2200) {
        rings.push({ r: 0, alpha: 1 })
        lastSpawn = ts
        spawnTag()
      }

      rings = rings.filter(r => r.alpha > 0.005)
      for (const r of rings) {
        r.r += 1.4
        r.alpha -= 0.006
        const arcs = [1, 0.68, 0.42]
        const widths = [1.8, 1.2, 0.8]
        const alphas = [0.75, 0.45, 0.25]
        for (let i = 0; i < 3; i++) {
          if (r.r * arcs[i] < 8) continue
          ctx.globalAlpha = Math.max(0, r.alpha * alphas[i])
          ctx.strokeStyle = '#ffc300'
          ctx.lineWidth = widths[i]
          ctx.beginPath()
          ctx.arc(cx, cy, r.r * arcs[i], Math.PI, 0)
          ctx.stroke()
        }
      }

      ctx.globalAlpha = 1
      ctx.fillStyle = '#ffc300'
      ctx.beginPath()
      ctx.arc(cx, cy, 7, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#0a0a0f'
      ctx.beginPath()
      ctx.arc(cx, cy, 3.5, 0, Math.PI * 2)
      ctx.fill()

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  function spawnTag() {
    const lang = LANGS[langIdxRef.current % LANGS.length]
    const pos = POSITIONS[posIdxRef.current % POSITIONS.length]
    langIdxRef.current++
    posIdxRef.current++
    const id = tagIdRef.current++
    setTags(prev => [...prev, { id, lang, pos, alive: true }])
    setTimeout(() => {
      setTags(prev => prev.filter(t => t.id !== id))
    }, 3200)
  }

  function selectLang(name: string) {
    setSelected(prev => prev.includes(name) ? prev : [...prev, name])
  }

  function removeLang(name: string) {
    setSelected(prev => prev.filter(l => l !== name))
  }

  return (
    <section className="grid grid-cols-2 items-center min-h-[calc(100vh-65px)]">
      {/* Left */}
      <div className="px-12 py-16 flex flex-col">
        <div className="inline-flex items-center gap-2 glass rounded-full px-3 py-1.5 text-xs font-semibold text-gold tracking-widest uppercase mb-6 w-fit">
          <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
          Live transmissions
        </div>

        <h1 className="text-5xl font-bold leading-[1.1] mb-4">
          Your reviews,<br />
          heard <span className="text-gold">everywhere</span>
        </h1>

        <p className="text-sm text-white/40 leading-relaxed max-w-xs mb-8">
          We broadcast your content to global audiences — translated, voiced, and delivered instantly.
        </p>

        <div className="flex items-center gap-3 mb-8">
          <button className="bg-gold text-black text-sm font-bold px-6 py-2.5 rounded-full hover:bg-yellow-300 transition-colors">
            Get started
          </button>
          <button className="text-sm text-white/40 hover:text-white transition-colors flex items-center gap-1.5">
            See how it works →
          </button>
        </div>

        {/* Selected languages */}
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {selected.map(name => {
              const l = LANGS.find(x => x.name === name)!
              return (
                <div key={name} className="flex items-center gap-2 glass rounded-full px-3 py-1.5 text-xs font-semibold text-gold">
                  <span>{l.flag}</span>
                  <span>{l.name}</span>
                  <button onClick={() => removeLang(name)} className="text-white/30 hover:text-white ml-1 leading-none">×</button>
                </div>
              )
            })}
          </div>
        )}

        {selected.length === 0 && (
          <p className="text-xs text-white/20 mt-2">Click a language signal to select it</p>
        )}
      </div>

      {/* Right — signal */}
      <div className="flex items-center justify-center border-l border-white/[0.05] h-full">
        <div className="relative" style={{ width: 320, height: 340 }}>
          <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />

          {/* Floating language tags */}
          {tags.map(t => (
            <div
              key={t.id}
              onClick={() => selectLang(t.lang.name)}
              className={`absolute cursor-pointer text-xs font-bold tracking-widest uppercase rounded-full px-3 py-1.5 border transition-all duration-200
                ${selected.includes(t.lang.name)
                  ? 'bg-gold text-black border-gold'
                  : 'glass text-gold border-gold/30 hover:border-gold hover:bg-gold/20'
                }`}
              style={{
                left: '50%',
                top: '82%',
                transform: `translate(calc(-50% + ${t.pos.tx}px), calc(-50% + ${t.pos.ty}px))`,
                animation: `tagFloat 3.2s ease-out forwards`,
              }}
            >
              {t.lang.flag} {t.lang.name}
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes tagFloat {
          0%   { opacity: 0; transform: translate(calc(-50% + ${0}px), calc(-50% + 0px)) scale(0.8); }
          15%  { opacity: 1; }
          70%  { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </section>
  )
}
