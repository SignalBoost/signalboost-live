"use client"
import WaveformPlayer from '@/components/WaveformPlayer'

export default function Hero() {
  const languages = ['EN','ES','PT','PL','RU','JP']

  return (
    <section className="w-full bg-black text-center py-20 px-4 text-white">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-4xl md:text-6xl font-extrabold mb-6 tracking-tight">
          Create Engaging Ads in <span className="text-yellow-400">6 Languages</span> Instantly!
        </h1>

        <p className="text-xl text-gray-400 mb-12 max-w-2xl mx-auto">
          Transform reviews into native voice and graphic ads in English, Spanish, Portuguese, Polish, Russian, and Japanese.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-12">
          {languages.map(lang => (
            <div 
              key={lang} 
              className="border border-white/10 rounded-xl p-6 bg-white/5 backdrop-blur-sm hover:border-yellow-400/50 transition-colors"
            >
              <span className="text-2xl font-bold block mb-3">{lang}</span>
              <WaveformPlayer src={`/api/tts?lang=${lang}`} />
            </div>
          ))}
        </div>

        <button className="bg-yellow-400 hover:bg-yellow-350 transform hover:scale-105 transition-all px-8 py-4 rounded-full font-bold text-black text-lg shadow-lg shadow-yellow-400/20">
          Get Started Now
        </button>
      </div>
    </section>
  )
}
