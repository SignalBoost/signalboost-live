"use client"
import { useRef, useState } from "react"

interface WaveformPlayerProps {
  src: string
}

export default function WaveformPlayer({ src }: WaveformPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
    } else {
      audio.play()
      setIsPlaying(true)
    }
  }

  return (
    <div className="flex flex-col items-center">
      <button
        onClick={togglePlay}
        className="px-4 py-2 bg-yellow-400 text-black font-bold rounded-lg hover:bg-yellow-500 transition"
      >
        {isPlaying ? "Pause" : "Play"}
      </button>
      <audio ref={audioRef} src={src} preload="auto" onEnded={() => setIsPlaying(false)} />
    </div>
  )
}
