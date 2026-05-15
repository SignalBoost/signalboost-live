"use client"; // CRITICAL: This allows useRef and useState to work

import { useRef, useState } from 'react';

export default function WaveformPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-full px-6 py-3 min-w-[280px] md:min-w-[400px]">
      <audio ref={audioRef} src={src} onEnded={() => setIsPlaying(false)} />
      
      <button 
        onClick={togglePlay}
        className="w-8 h-8 rounded-full bg-yellow-400 flex items-center justify-center cursor-pointer hover:scale-110 transition-transform"
      >
        {isPlaying ? (
          <div className="flex gap-1">
            <div className="w-1 h-3 bg-black" />
            <div className="w-1 h-3 bg-black" />
          </div>
        ) : (
          <div className="w-0 h-0 border-t-[5px] border-t-transparent border-l-[9px] border-l-black border-b-[5px] border-b-transparent ml-1" />
        )}
      </button>

      <div className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden">
        <div className="w-1/3 h-full bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.6)]" />
      </div>
      <span className="text-[10px] font-mono text-gray-500">0:14 / 0:30</span>
    </div>
  );
}
