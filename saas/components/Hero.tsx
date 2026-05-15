"use client"
import WaveformPlayer from '@/components/WaveformPlayer'

export default function Hero() {
  const campaigns = {
    EN: "Boost your reach with SignalBoost today!",
    ES: "¡Aumenta tu alcance con SignalBoost hoy!",
    PT: "Amplie seu alcance com SignalBoost hoje!",
    PL: "Zwiększ swój zasięg dzięki SignalBoost już dziś!",
    RU: "Увеличьте охват с SignalBoost уже сегодня!",
    JP: "今すぐSignalBoostでリーチを拡大しましょう！",
  }

  return (
    <section className="w-full bg-black text-center py-20 px-4 text-white">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-4xl md:text-6xl font-extrabold mb-6 tracking-tight">
          Create Engaging Ads in <span className="text-yellow-400">6 Languages</span> Instantly!
        </h1>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-12">
          {Object.entries(campaigns).map(([lang, text]) => (
            <div key={lang} className="border border-white/10 rounded-xl p-6 bg-white/5 backdrop-blur-sm">
              <span className="text-2xl font-bold block mb-3">{lang}</span>
              <WaveformPlayer src={`/api/tts?lang=${lang}&text=${encodeURIComponent(text)}`} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
