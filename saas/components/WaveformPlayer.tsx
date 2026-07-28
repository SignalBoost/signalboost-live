"use client"
import { useRef, useState } from "react"
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


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
      // reload ensures fresh campaign text plays each time
      audio.load()
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
        {isPlaying ? uiCopy('u_de3022f0dde3670d') : uiCopy('u_1ada1ed660a60e6c')}
      </button>
      <audio
        ref={audioRef}
        src={src}
        preload="auto"
        onEnded={() => setIsPlaying(false)}
      />
    </div>
  )
}
