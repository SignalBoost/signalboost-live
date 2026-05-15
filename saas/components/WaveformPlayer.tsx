"use client"
import { useRef, useState } from 'react'

export default function WaveformPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  const togglePlay = async () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      try {
        await audioRef.current.play()   // ✅ await ensures browser handles autoplay restrictions
        setIsPlaying(true)
      } catch (err) {
        console.error("Playback failed:", err)
      }
    }
  }

  return (
    <div className="flex flex-col items-center">
      {/* Simple animated waveform bar */}
      <div className={`w-full h-12 rounded mb-2 ${isPlaying ? 'bg-gradient-to-r from-yellow-400 to-yellow-200 animate-pulse' : 'bg-gray-700'}`}></div>
      
      <button
        onClick={togglePlay}
        className="bg-yellow-400 text-black px-4 py-2 rounded-full font-bold hover:scale-105 transition-transform"
      >
        {isPlaying ? 'Pause' : 'Play'}
      </button>

      <audio ref={audioRef} src={src} preload="none" />
    </div>
  )
}
