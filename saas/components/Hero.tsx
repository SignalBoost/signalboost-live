"use client";

import React, { useState, useRef } from "react";

export default function Hero() {
  const languages = [
    { code: "EN", label: "English", src: "/audio/EN.mp3" },
    { code: "ES", label: "Spanish", src: "/audio/ES.mp3" },
    { code: "PT", label: "Portuguese", src: "/audio/PT.mp3" },
    { code: "PL", label: "Polish", src: "/audio/PL.mp3" },
    { code: "RU", label: "Russian", src: "/audio/RU.mp3" },
    { code: "JP", label: "Japanese", src: "/audio/JP.mp3" },
  ];

  const audioRef = useRef<HTMLAudioElement>(null);
  const [playingCode, setPlayingCode] = useState<string | null>(null);

  const playAudio = async (src: string, code: string) => {
    if (!audioRef.current) return;

    try {
      if (playingCode === code) {
        audioRef.current.pause();
        setPlayingCode(null);
      } else {
        // Reset the player
        audioRef.current.pause();
        audioRef.current.src = src;
        audioRef.current.load(); // CRITICAL: Forces browser to find the file
        
        await audioRef.current.play();
        setPlayingCode(code);
      }
    } catch (err) {
      console.error("Playback failed. Is the file at " + src + "?", err);
    }
  };

  return (
    <section className="w-full bg-black py-20 px-6 text-white text-center">
      <audio ref={audioRef} onEnded={() => setPlayingCode(null)} preload="auto" />
      
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 max-w-6xl mx-auto">
        {languages.map((lang) => (
          <button
            key={lang.code}
            onClick={() => playAudio(lang.src, lang.code)}
            className={`p-6 rounded-xl transition-all border flex flex-col items-center ${
              playingCode === lang.code 
              ? "bg-yellow-400 text-black border-yellow-400" 
              : "bg-white text-black border-white hover:bg-gray-100"
            }`}
          >
            <span className="text-xl font-bold">{lang.code}</span>
            <span className="text-[10px] uppercase mt-1">Sample Ad</span>
            
            <div className={`mt-4 w-10 h-10 rounded-full flex items-center justify-center ${playingCode === lang.code ? "bg-black" : "bg-yellow-400"}`}>
               {playingCode === lang.code ? (
                 <div className="flex gap-1"><div className="w-1 h-3 bg-yellow-400" /><div className="w-1 h-3 bg-yellow-400" /></div>
               ) : (
                 <div className="w-0 h-0 border-t-[5px] border-t-transparent border-l-[9px] border-l-black border-b-[5px] border-b-transparent ml-1" />
               )}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
