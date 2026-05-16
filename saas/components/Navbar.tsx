'use client'
import Link from 'next/link'
import { useEffect, useRef } from 'react'

export default function Navbar() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const W = 40, H = 40
    canvas.width = W
    canvas.height = H
    const cx = W / 2
    const cy = H - 8

    let rings: { r: number; alpha: number }[] = []
    let last = 0
    let raf: number

    function draw(ts: number) {
      ctx.clearRect(0, 0, W, H)

      if (!last || ts - last > 2000) {
        rings.push({ r: 0, alpha: 1 })
        last = ts
      }

      rings = rings.filter(r => r.alpha > 0.01)
      for (const r of rings) {
        r.r += 0.8
        r.alpha -= 0.012

        const arcs   = [1, 0.65]
        const widths = [1.2, 0.8]
        const alphas = [0.9, 0.5]

        for (let i = 0; i < 2; i++) {
          if (r.r * arcs[i] < 3) continue
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
      ctx.arc(cx, cy, 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#0a0a0f'
      ctx.beginPath()
      ctx.arc(cx, cy, 1.5, 0, Math.PI * 2)
      ctx.fill()

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <nav style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px 32px',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      background: 'rgba(10,10,15,0.85)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ position: 'relative', width: 40, height: 40, flexShrink: 0 }}>
          <canvas ref={canvasRef}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
        </div>
        <span style={{ fontWeight: 800, fontSize: 17, color: '#fff', letterSpacing: '-0.02em' }}>
          signal<span style={{ color: '#ffc300' }}>boost</span>
        </span>
      </Link>

      <div style={{ display: 'flex', gap: 28 }}>
        {['Home', 'Dashboard', 'Pricing', 'Docs'].map(item => (
          <Link key={item} href={item === 'Home' ? '/' : `/${item.toLowerCase()}`}
            style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', textDecoration: 'none', transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.45)')}>
            {item}
          </Link>
        ))}
      </div>

      <button style={{
        background: '#ffc300',
        color: '#000',
        fontSize: 13,
        fontWeight: 800,
        padding: '9px 22px',
        borderRadius: 999,
        border: 'none',
        cursor: 'pointer',
      }}>
        Get started
      </button>
    </nav>
  )
}
