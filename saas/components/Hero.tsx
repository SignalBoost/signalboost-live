"use client";

import React, { useState, useRef } from "react";

export default function Hero() {
  const languages = [
    { code: "EN", label: "English", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" },
    { code: "ES", label: "Spanish", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.2mp3" },
    { code: "PT", label: "Portuguese", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3" },
    { code: "PL", label: "Polish", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3" },
    { code: "RU", label: "Russian", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3" },
    { code: "JP", label: "Japanese", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3" },
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
        audioRef.current.pause();
        audioRef.current.src = src;
        audioRef.current.load();
        await audioRef.current.play();
        setPlayingCode(code);
      }
    } catch (err) {
      console.error("Playback failed:", err);
    }
  };

  return (
    // Outer section with a dark base and a subtle deep radial accent so the frost pops
    <section className="relative w-full bg-[#0a0a0a] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-neutral-900 via-black to-black py-24 px-6 text-white text-center overflow-hidden">
      <audio ref={audioRef} onEnded={() => setPlayingCode(null)} />
      
      {/* Main Container featuring the Frosted Glassmorphism look */}
      <div className="relative max-w-5xl mx-auto p-12 rounded-3xl bg-white/[0.02] border border-white/[0.08] backdrop-blur-xl shadow-2xl">
        
        <h1 className="text-5xl md:text-7xl font-extrabold mb-6 tracking-tight bg-gradient-to-b from-white to-neutral-400 bg-clip-text text-transparent">
          Turn reviews into <span className="text-yellow-400">global content</span>
        </h1>
        
        <p className="text-neutral-400 mb-12 text-lg max-w-xl mx-auto">
          Click a language below to sample our dynamic cloud-streamed audio tracks.
        </p>

        {/* Grid for language selection items */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => playAudio(lang.src, lang.code)}
              className={`p-6 rounded-2xl border transition-all duration-300 flex flex-col items-center ${
                playingCode === lang.code 
                ? "bg-yellow-400 text-black border-yellow-400 scale-105 shadow-yellow-400/10 shadow-2xl" 
                : "bg-white/[0.03] border-white/[0.06] backdrop-blur-md hover:bg-white/[0.08] hover:border-white/[0.15]"
              }`}
            >
              <span className="text-2xl font-bold tracking-wider">{lang.code}</span>
              <div className={`mt-4 w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                playingCode === lang.code ? "bg-black" : "bg-yellow-400 hover:bg-yellow-300"
              }`}>
                 {playingCode === lang.code ? (
                    <div className="flex gap-1 items-center justify-center">
                      <div className="w-1 h-3 bg-yellow-400 animate-pulse" />
                      <div className="w-1 h-3 bg-yellow-400 animate-pulse delay-75" />
                    </div>
                 ) : (
                   <div className="w-0 h-0 border-t-[5px] border-t-transparent border-l-[9px] border-l-black border-b-[5px] border-b-transparent ml-1" />
                 )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
