const steps = [
  { number: '01', title: 'Paste a review', description: 'Copy any customer review from Google, Yelp, Shopify, or anywhere.' },
  { number: '02', title: 'Choose a format', description: 'Pick from branded graphic, voice ad, social post, or video script.' },
  { number: '03', title: 'Generate & publish', description: 'Get polished content in seconds, ready to post or run as an ad.' },
]

export default function FeaturesFlow() {
  return (
    <section id="how-it-works" className="bg-[#0f0f0f] px-6 py-20">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-white mb-12">How it works</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {steps.map((step) => (
            <div key={step.number} className="bg-white/5 border border-white/10 rounded-2xl p-8">
              <div className="text-yellow-400 font-black text-4xl mb-4">{step.number}</div>
              <h3 className="text-white font-bold text-xl mb-2">{step.title}</h3>
              <p className="text-white/50 text-sm">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
