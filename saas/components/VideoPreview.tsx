// saas/components/VideoPreview.tsx
import { useRef, useState } from 'react'

export default function VideoPreview({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  const togglePlay = () => {
    if (!videoRef.current) return
    if (isPlaying) {
      videoRef.current.pause()
    } else {
      videoRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }

  return (
    <div className="flex flex-col items-center">
      <video
        ref={videoRef}
        src={src}
        className="w-full rounded-lg shadow-lg mb-2"
        loop
        muted
      />
      <button
        onClick={togglePlay}
        className="bg-yellow-400 text-black px-4 py-2 rounded-full font-bold hover:scale-105 transition-transform"
      >
        {isPlaying ? 'Pause' : 'Play'}
      </button>
    </div>
  )
}
