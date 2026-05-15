"use client";

import React, { useRef, useState } from 'react';

// This tells TypeScript that "src" is a required string
interface WaveformPlayerProps {
  src: string;
}

export default function WaveformPlayer({ src }: WaveformPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const togglePlay = (e: React.MouseEvent) => {
    // Prevent the click from bubbling up to parent elements
    e.stopPropagation(); 
    
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
    <div className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-full px-6 py-3 min-w-[300px]">
      <audio 
        ref={audioRef} 
        src={src} 
        onEnded={() => setIsPlaying(false)} 
        preload="auto"
      />
      
      {/* This button is now clickable */}
      <button 
        onClick={togglePlay}
        type="button"
        className="w-10 h-10 rounded-full bg-yellow-400 flex items-center justify-center cursor-pointer hover:scale-110 active:scale-95 transition-all z-10"
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? (
          <div className="flex gap-1">
            <div className="w-1.5 h-4 bg-black rounded-full" />
            <div className="w-1.5 h-4 bg-black rounded-full" />
          </div>
        ) : (
          <div className="w-0 h-0 border-t-[6px] border-t-transparent border-l-[10px] border-l-black border-b-[6px] border-b-transparent ml-1" />
        )}
      </button>

      {/* Progress Bar Visual */}
      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div 
          className={`h-full bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.5)] transition-all duration-300 ${isPlaying ? 'w-full' : 'w-0'}`} 
        />
      </div>
    </div>
  );
}
