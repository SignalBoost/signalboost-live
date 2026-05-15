"use client";

import React, { useState } from "react";

export default function Hero() {
  // You can easily add more languages to this list later
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
    <section className="w-full bg-black py-20 px-6 text-white">
      <div className="max-w-5xl mx-auto text-center">
        {/* Badge */}
        <div className="inline-block px-4 py-1.5 mb-6 rounded-full border border-yellow-400/20 bg-yellow-400/10 text-yellow-400 text-sm font-medium">
          ⚡ AI review content engine
        </div>

        {/* Headline */}
        <h1 className="text-4xl md:text-6xl font-extrabold mb-6 tracking-tight">
          Turn your reviews <br />
          <span className="text-yellow-400 text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
            into global content
          </span>
        </h1>

        <p className="text-lg md:text-xl text-gray-400 mb-12 max-w-2xl mx-auto leading-relaxed">
          Transform customer feedback into branded graphics and high-fidelity voice ads instantly in {languages.length} languages.
        </p>

        {/* Scalable Language Selector (Scrolls on Mobile) */}
        <div className="flex flex-wrap justify-center gap-3 mb-12 overflow-x-auto pb-4 scrollbar-hide">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => setActiveLang(lang)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full border transition-all duration-200 whitespace-nowrap ${
                activeLang.code === lang.code
                  ? "bg-yellow-400 text-black border-yellow-400 font-bold shadow-[0_0_20px_rgba(250,204,21,0.3)]"
                  : "bg-white/5 border-white/10 hover:border-white/30 text-gray-400 hover:bg-white/10"
              }`}
            >
              <span className="text-lg">{lang.flag}</span>
              <span className="text-sm uppercase tracking-wide">{lang.label}</span>
            </button>
          ))}
        </div>

        {/* Dashboard Preview Area */}
        <div className="relative group max-w-4xl mx-auto">
          {/* Decorative Glow */}
          <div className="absolute -inset-1 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-2xl blur opacity-20 group-hover:opacity-30 transition duration-1000"></div>
          
          <div className="relative border border-white/10 rounded-2xl bg-[#0a0a0a] overflow-hidden shadow-2xl">
            <div className="w-full aspect-video md:aspect-[21/9] flex flex-col items-center justify-center p-8 md:p-12">
              
              {/* Fake Audio Waveform / Visualizer */}
              <div className="flex items-end gap-1 mb-6 h-12">
                {[...Array(12)].map((_, i) => (
                  <div 
                    key={i} 
                    className="w-1.5 bg-yellow-400/40 rounded-full animate-pulse" 
                    style={{ height: `${Math.random() * 100}%`, animationDelay: `${i * 0.1}s` }}
                  ></div>
                ))}
              </div>

              <div className="text-center">
                <span className="text-xs font-mono text-yellow-400/60 uppercase tracking-[0.2em] mb-2 block">
                  AI Generated Voice • {activeLang.label}
                </span>
                <h2 className="text-xl md:text-3xl font-semibold mb-8 text-white/90">
                  {activeLang.code === 'EN' ? '"The best purchase I have ever made!"' : 
                   activeLang.code === 'ES' ? '"¡La mejor compra que he hecho!"' : 
                   activeLang.code === 'JP' ? '"これまでで最高の買い物でした！"' :
                   `"Generating ${activeLang.label} sample..."`}
                </h2>

                {/* Player UI */}
                <div className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-full px-6 py-3 min-w-[280px] md:min-w-[400px]">
                  <div className="w-8 h-8 rounded-full bg-yellow-400 flex items-center justify-center cursor-pointer hover:scale-110 transition-transform">
                    <div className="w-0 h-0 border-t-[5px] border-t-transparent border-l-[9px] border-l-black border-b-[5px] border-b-transparent ml-1" />
                  </div>
                  <div className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden">
                    <div className="w-1/3 h-full bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.6)]" />
                  </div>
                  <span className="text-[10px] font-mono text-gray-500">0:14 / 0:30</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CTA Button */}
        <div className="mt-16">
          <button className="bg-yellow-400 hover:bg-yellow-350 transform hover:scale-105 active:scale-95 transition-all px-10 py-4 rounded-full font-bold text-black text-lg shadow-xl shadow-yellow-400/20">
            Get started for free
          </button>
          <p className="mt-4 text-gray-500 text-sm">No credit card required • 7-day free trial</p>
        </div>
      </div>
    </section>
  );
}
