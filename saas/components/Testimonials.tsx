const testimonials = [
  { name: 'Sarah K.', role: 'Shopify Store Owner', text: 'SignalBoost turned our 5-star reviews into ads overnight. Our ROAS doubled in the first week.' },
  { name: 'Marcus T.', role: 'Local Business Owner', text: 'I had no idea how powerful my reviews were until I saw them as voice ads. Incredible tool.' },
  { name: 'Priya N.', role: 'Marketing Manager', text: 'Fast, professional, easy from start to finish. This is now a core part of our content workflow.' },
]

export default function Testimonials() {
  return (
    <section className="bg-[#0f0f0f] px-6 py-20">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-white mb-12">What our customers say</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <div key={t.name} className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <div className="text-yellow-400 text-lg mb-3">★★★★★</div>
              <p className="text-white/70 text-sm mb-4">"{t.text}"</p>
              <div className="text-white font-semibold text-sm">{t.name}</div>
              <div className="text-white/40 text-xs">{t.role}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
