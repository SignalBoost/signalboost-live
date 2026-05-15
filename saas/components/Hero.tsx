"use client"
import { useState } from "react"
import WaveformPlayer from '@/components/WaveformPlayer'

export default function Hero() {
  const campaigns: Record<string, string[]> = {
    EN: [
      "Boost your reach with SignalBoost today!",
      "SignalBoost helps you connect instantly!",
      "Grow your audience with SignalBoost now!"
    ],
    ES: [
      "¡Aumenta tu alcance con SignalBoost hoy!",
      "¡Conéctate al instante con SignalBoost!",
      "¡Haz crecer tu audiencia con SignalBoost!"
    ],
    PT: [
      "Amplie seu alcance com SignalBoost hoje!",
      "Conecte-se instantaneamente com SignalBoost!",
      "Cresça sua audiência com SignalBoost agora!"
    ],
    PL: [
      "Zwiększ swój zasięg dzięki SignalBoost już dziś!",
      "Połącz się natychmiast dzięki SignalBoost!",
      "Rozwijaj swoją publiczność z SignalBoost!"
    ],
    RU: [
      "Увеличьте охват с SignalBoost уже сегодня!",
      "Подключайтесь мгновенно с SignalBoost!",
      "Расширяйте аудиторию с SignalBoost!"
    ],
    JP: [
      "今すぐSignalBoostでリーチを拡大しましょう！",
      "SignalBoostで瞬時につながろう！",
      "SignalBoostでオーディエンスを増やそう！"
    ],
  }

  const [indexes, setIndexes] = useState<Record<string, number>>({
    EN: 0, ES: 0, PT: 0, PL: 0, RU: 0, JP: 0
  })

  const getNextText = (lang: string) => {
    const currentIndex = indexes[lang]
    const nextIndex = (currentIndex + 1) % campaigns[lang].length
    setIndexes(prev => ({ ...prev, [lang]: nextIndex }))
    return campaigns[lang][currentIndex]
  }

  return (
    <section className="w-full bg-black text-center py-20 px-4 text-white">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-4xl md:text-6xl font-extrabold mb-6 tracking-tight">
          Create Engaging Ads in <span className="text-yellow-400">6 Languages</span> Instantly!
        </h1>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-12">
          {Object.keys(campaigns).map((lang) => {
            const text = getNextText(lang)
            return (
              <div key={lang} className="border border-white/10 rounded-xl p-6 bg-white/5 backdrop-blur-sm">
                <span className="text-2xl font-bold block mb-3">{lang}</span>
                <WaveformPlayer src={`/api/tts?lang=${lang}&text=${encodeURIComponent(text)}`} />
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
