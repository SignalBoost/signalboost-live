'use client'
import { useEffect, useRef } from 'react'

export default function SignalCanvas({ onSpawn }: { onSpawn: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lastSpawnRef = useRef(0)

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
        onSpawn()
      }
      rings = rings.filter(r => r.alpha > 0.005)
      for (const r of rings) {
        r.r += 1.8
        r.alpha -= 0.005
        const arcs = [1, 0.70, 0.44]
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
  }, [onSpawn])

  return (
    <canvas ref={canvasRef}
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
  )
}
