"use client";

import React, { useState } from "react";

export default function Hero() {
  const languages = [
    { code: "EN", label: "English", flag: "🇬🇧" },
    { code: "ES", label: "Spanish", flag: "🇪🇸" },
    { code: "PT", label: "Portuguese", flag: "🇵🇹" },
    { code: "PL", label: "Polish", flag: "🇵🇱" },
    { code: "RU", label: "Russian", flag: "🇷🇺" },
    { code: "JP", label: "Japanese", flag: "🇯🇵" },
  ];

  const [activeLang, setActiveLang] = useState(languages[0]);

  return (
    <section className="w-full bg-black py-20 px-6 text-white min-h-[70vh] flex flex-col items-center justify-center">
      <div className="max-w-5xl mx-auto text-center">
        {/* Badge */}
        <div className="inline-block px-4 py-1.5 mb-6 rounded-full border border-yellow-400/20 bg-yellow-400/10 text-yellow-400 text-sm font-medium">
          ⚡ AI review content engine
        </div>

        {/* Headline */}
        <h1 className="text-5xl md:text-7xl font-extrabold mb-6 tracking-tight">
          Turn reviews into <br />
          <span className="text-yellow-400">global content</span>
        </h1>

        <p className="text-lg md:text-xl text-gray-400 mb-12 max-w-2xl mx-auto">
          Transform customer feedback into branded graphics and voice ads in {languages.length} languages.
        </p>

        {/* Scalable Language Selector */}
        <div className="flex flex-wrap justify-center gap-3 mb-12">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => setActiveLang(lang)}
              className={`flex items-center gap-2 px-5 py-2 rounded-full border transition-all ${
                activeLang.code === lang.code
                  ? "bg-yellow-400 text-black border-yellow-400 font-bold shadow-lg shadow-yellow-400/20"
                  : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:border-white/30"
              }`}
            >
              <span>{lang.flag}</span>
              <span className="text-sm font-bold uppercase">{lang.label}</span>
            </button>
          ))}
        </div>

        {/* Preview Area */}
        <div className="relative max-w-4xl mx-auto border border-white/10 rounded-3xl bg-[#0a0a0a] p-10 shadow-2xl">
          <div className="flex flex-col items-center">
             <span className="text-[10px] font-mono text-yellow-400/60 uppercase tracking-[0.3em] mb-4">
               Live AI Demo • {activeLang.label}
             </span>
             <h2 className="text-2xl md:text-3xl font-semibold mb-8 italic">
                {activeLang.code === 'EN' ? '"This is the future of marketing!"' : 
                 activeLang.code === 'ES' ? '"¡Este es el futuro del marketing!"' :
                 activeLang.code === 'JP' ? '"これはマーケティングの未来です！"' :
                 `"Sample ad generated in ${activeLang.label}..."`}
             </h2>
             
             {/* Fake Audio Player */}
             <div className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-full px-6 py-3 w-full max-w-md">
                <div className="w-8 h-8 rounded-full bg-yellow-400 flex items-center justify-center">
                  <div className="w-0 h-0 border-t-[5px] border-t-transparent border-l-[9px] border-l-black border-b-[5px] border-b-transparent ml-1" />
                </div>
                <div className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden">
                  <div className="w-1/2 h-full bg-yellow-400" />
                </div>
             </div>
          </div>
        </div>

        <button className="mt-16 bg-yellow-400 hover:bg-yellow-350 transform hover:scale-105 transition-all px-12 py-4 rounded-full font-bold text-black text-lg shadow-xl shadow-yellow-400/30">
          Get started for free
        </button>
      </div>
    </section>
  );
}
