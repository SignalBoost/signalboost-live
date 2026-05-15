"use client";

import React, { useState, useRef } from "react";

export default function Hero() {
  const languages = [
    { code: "EN", label: "English", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" },
    { code: "ES", label: "Spanish", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3" },
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
        // Since we are using external links, we set the source directly
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
    <section className="w-full bg-black py-20 px-6 text-white text-center">
      <audio ref={audioRef} onEnded={() => setPlayingCode(null)} />
      
      <div className="max-w-5xl mx-auto">
        <h1 className="text-5xl md:text-7xl font-extrabold mb-6">
          Turn reviews into <span className="text-yellow-400">global content</span>
        </h1>
        <p className="text-gray-400 mb-12">Click a language to hear a live demo from the web.</p>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => playAudio(lang.src, lang.code)}
              className={`p-6 rounded-2xl border transition-all flex flex-col items-center ${
                playingCode === lang.code 
                ? "bg-yellow-400 text-black border-yellow-400 scale-105 shadow-xl" 
                : "bg-white/5 border-white/10 hover:bg-white/10"
              }`}
            >
              <span className="text-2xl font-bold">{lang.code}</span>
              <div className={`mt-4 w-10 h-10 rounded-full flex items-center justify-center ${
                playingCode === lang.code ? "bg-black" : "bg-yellow-400"
              }`}>
                 {playingCode === lang.code ? (
                    <div className="flex gap-1">
                      <div className="w-1 h-3 bg-yellow-400 animate-pulse" />
                      <div className="w-1 h-3 bg-yellow-400 animate-pulse" />
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
