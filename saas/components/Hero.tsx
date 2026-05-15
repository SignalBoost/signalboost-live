"use client";

import React, { useState, useRef } from "react";

export default function Hero() {
  // MUST match the filenames in your GitHub screenshot (EN.mp3, ES.mp3, etc.)
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

  const playAudio = (src: string, code: string) => {
    if (audioRef.current) {
      // If clicking the same one that's already playing, pause it
      if (playingCode === code) {
        audioRef.current.pause();
        setPlayingCode(null);
      } else {
        audioRef.current.src = src;
        audioRef.current.play();
        setPlayingCode(code);
      }
    }
  };

  return (
    <section className="w-full bg-black py-20 px-6 text-white text-center">
      <audio ref={audioRef} onEnded={() => setPlayingCode(null)} />
      
      <h1 className="text-4xl md:text-6xl font-bold mb-4">
        Create Engaging Ads in 6 Languages Instantly!
      </h1>
      <p className="text-gray-400 mb-12">
        Transform reviews into native voice and graphic ads.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 max-w-6xl mx-auto">
        {languages.map((lang) => (
          <button
            key={lang.code}
            onClick={() => playAudio(lang.src, lang.code)}
            className={`p-6 rounded-xl transition-all border ${
              playingCode === lang.code 
              ? "bg-yellow-400 text-black border-yellow-400 scale-105 shadow-lg" 
              : "bg-white text-black border-white hover:bg-gray-100"
            }`}
          >
            <div className="text-xl font-bold mb-1">{lang.code}</div>
            <div className="text-xs uppercase opacity-70">
              {playingCode === lang.code ? "Playing..." : "Sample Ad Preview"}
            </div>
            
            {/* Simple Play Icon */}
            <div className={`mt-4 mx-auto w-8 h-8 rounded-full flex items-center justify-center ${playingCode === lang.code ? "bg-black" : "bg-yellow-400"}`}>
               {playingCode === lang.code ? (
                 <div className="w-2 h-2 bg-yellow-400 rounded-sm" /> 
               ) : (
                 <div className="w-0 h-0 border-t-[4px] border-t-transparent border-l-[7px] border-l-black border-b-[4px] border-b-transparent ml-0.5" />
               )}
            </div>
          </button>
        ))}
      </div>
      
      <button className="mt-12 bg-yellow-400 text-black px-8 py-3 rounded-md font-bold hover:bg-yellow-500 transition-colors">
        Get Started Now
      </button>
    </section>
  );
}
