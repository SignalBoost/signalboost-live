import WaveformPlayer from './WaveformPlayer'

// ...
{languages.map(lang => (
  <div 
    key={lang} 
    className="border border-white/10 rounded-xl p-6 bg-white/5 backdrop-blur-sm hover:border-yellow-400/50 transition-colors"
  >
    <span className="text-2xl font-bold block mb-1">{lang}</span>
    <WaveformPlayer src={`/audio/${lang}.mp3`} />
  </div>
))}
