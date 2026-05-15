"use client";

import React, { useRef, useState } from 'react';

// Explicitly define the props interface
interface WaveformPlayerProps {
  src: string;
}

export default function WaveformPlayer({ src }: WaveformPlayerProps) {
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
    <div className="flex items-center gap-2 mt-2">
      <audio 
        ref={audioRef} 
        src={src} 
        onEnded={() => setIsPlaying(false)} 
        preload="none"
      />
      <button 
        onClick={togglePlay}
        className="w-8 h-8 rounded-full bg-yellow-400 flex items-center justify-center hover:scale-110 transition-transform"
      >
        {isPlaying ? (
          <div className="flex gap-1"><div className="w-1 h-3 bg-black" /><div className="w-1 h-3 bg-black" /></div>
        ) : (
          <div className="w-0 h-0 border-t-[5px] border-t-transparent border-l-[8px] border-l-black border-b-[5px] border-b-transparent ml-0.5" />
        )}
      </button>
      <div className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden min-w-[60px]">
        <div className={`h-full bg-yellow-400 ${isPlaying ? 'w-full transition-all duration-[30s] ease-linear' : 'w-0'}`} />
      </div>
    </div>
  );
}
