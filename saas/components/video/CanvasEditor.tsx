'use client'
import React, { useRef, useEffect, useState } from 'react'

interface Caption {
  text: string
  start: number
  end: number
  x: number
  y: number
  style: { fontSize: string; color: string; fontFamily: string }
}

export default function CanvasEditor({ videoSrc, captions }: { videoSrc: string; captions: Caption[] }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [currentTime, setCurrentTime] = useState(0)

  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    const ctx = canvas.getContext('2d')!
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      captions.forEach(caption => {
        if (currentTime >= caption.start && currentTime <= caption.end) {
          ctx.font = `${caption.style.fontSize} ${caption.style.fontFamily}`
          ctx.fillStyle = caption.style.color
          ctx.fillText(caption.text, caption.x, caption.y)
        }
      })

      requestAnimationFrame(draw)
    }
    draw()
  }, [captions, currentTime])

  return (
    <div>
      <video
        ref={videoRef}
        src={videoSrc}
        controls
        onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
        style={{ display: 'none' }}
      />
      <canvas ref={canvasRef} width={640} height={360} />
    </div>
  )
}
