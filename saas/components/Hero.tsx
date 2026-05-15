export default function Hero() {
  return (
    <section className="bg-[#0f0f0f] px-6 py-24 flex flex-col items-start max-w-6xl mx-auto">
      <span className="text-xs font-semibold bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 px-3 py-1 rounded-full mb-6">
        ⚡ AI review content engine
      </span>
      <h1 className="text-5xl md:text-7xl font-black text-white leading-tight mb-6">
        Turn your reviews<br />into content
      </h1>
      <p className="text-white/50 text-lg max-w-xl mb-10">
        Transform customer reviews into branded graphics and voice ads with one powerful dashboard.
      </p>
      <div className="flex flex-wrap gap-3">
        <a href="/signup" className="bg-yellow-400 text-black font-bold px-6 py-3 rounded-full hover:bg-yellow-300 transition">
          Generate a Voice Ad
        </a>
        <a href="#features" className="bg-white/10 text-white font-semibold px-6 py-3 rounded-full hover:bg-white/20 transition">
          Turn Reviews into Graphics
        </a>
        <a href="#how-it-works" className="bg-white/10 text-white font-semibold px-6 py-3 rounded-full hover:bg-white/20 transition">
          See How It Works
        </a>
      </div>
    </section>
  )
}
