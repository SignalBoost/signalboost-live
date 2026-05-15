// saas/components/WaveformPlayer.tsx
import { useRef, useState } from 'react'

export default function WaveformPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  const togglePlay = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }

  return (
    <div className="flex flex-col items-center">
      {/* Placeholder waveform bar */}
      <div className="w-full h-12 bg-gradient-to-r from-yellow-400 to-yellow-200 rounded mb-2 animate-pulse"></div>
      
      <button
        onClick={togglePlay}
        className="bg-yellow-400 text-black px-4 py-2 rounded-full font-bold hover:scale-105 transition-transform"
      >
        {isPlaying ? 'Pause' : 'Play'}
      </button>

      <audio ref={audioRef} src={src} />
    </div>
  )
}
