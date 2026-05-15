// saas/components/Hero.tsx
export default function Hero() {
  const languages = ['EN', 'ES', 'PT', 'PL', 'RU', 'JP']
  return (
    <section className="w-full bg-black text-center py-16 text-white">
      <h1 className="text-4xl font-bold mb-4">
        Create Engaging Ads in 6 Languages Instantly!
      </h1>
      <p className="text-lg text-gray-300 mb-8">
        Transform reviews into native voice and graphic ads in English, Spanish, Portuguese, Polish, Russian, and Japanese.
      </p>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-4 mb-8 px-8">
        {languages.map(lang => (
          <div key={lang} className="border rounded-lg p-4 shadow-sm bg-white text-black">
            <span className="font-semibold">{lang}</span>
            <p className="text-sm mt-2">Sample Ad Preview</p>
          </div>
        ))}
      </div>
      <button className="bg-yellow-400 px-6 py-3 rounded font-semibold text-black">
        Get Started Now
      </button>
    </section>
  )
}
