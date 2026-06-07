'use client'

import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="min-h-screen bg-black text-white font-sans">
      {/* Hero */}
      <section className="px-6 py-20 text-center md:px-12">
        <h1 className="text-5xl font-extrabold tracking-tight md:text-7xl">
          SignalBoost: Your Growth Cockpit
        </h1>
        <p className="mt-6 max-w-2xl mx-auto text-lg text-neutral-400">
          Run promotions, reviews, outreach, and analytics from one workspace.
        </p>
        <Link
          href="/signup"
          className="mt-8 inline-block rounded-full bg-[#FFD700] px-6 py-3 font-bold text-black hover:bg-yellow-400"
        >
          Get Started
        </Link>
      </section>

      {/* Value Proposition */}
      <section className="px-6 py-16 md:px-12">
        <h2 className="text-3xl font-bold">Why SignalBoost?</h2>
        <p className="mt-4 max-w-3xl text-neutral-400">
          Designed for local operators, SignalBoost unifies marketing, customer engagement, and growth tracking into one cockpit.
        </p>
      </section>

      {/* Social Proof */}
      <section className="px-6 py-16 md:px-12 bg-white/[.04] rounded-3xl">
        <h2 className="text-3xl font-bold">Trusted by Local Leaders</h2>
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          <blockquote className="rounded-xl border border-white/10 bg-black/40 p-6">
            <p className="text-lg">“SignalBoost doubled our outreach efficiency.”</p>
            <footer className="mt-4 text-sm text-neutral-400">— Maria, Restaurante Owner</footer>
          </blockquote>
          <blockquote className="rounded-xl border border-white/10 bg-black/40 p-6">
            <p className="text-lg">“Finally, a cockpit that feels designed for us.”</p>
            <footer className="mt-4 text-sm text-neutral-400">— João, Football Club Manager</footer>
          </blockquote>
          <blockquote className="rounded-xl border border-white/10 bg-black/40 p-6">
            <p className="text-lg">“Professional quality without agency costs.”</p>
            <footer className="mt-4 text-sm text-neutral-400">— Ana, Boutique Owner</footer>
          </blockquote>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-16 md:px-12">
        <h2 className="text-3xl font-bold">Features</h2>
        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <div>
            <h3 className="text-xl font-semibold">Promotions</h3>
            <p className="mt-2 text-neutral-400">Plan and launch campaigns with clear ROI tracking.</p>
          </div>
          <div>
            <h3 className="text-xl font-semibold">Reviews</h3>
            <p className="mt-2 text-neutral-400">Collect and showcase customer feedback seamlessly.</p>
          </div>
          <div>
            <h3 className="text-xl font-semibold">Outreach</h3>
            <p className="mt-2 text-neutral-400">Coordinate leads and follow-ups with structured workflows.</p>
          </div>
          <div>
            <h3 className="text-xl font-semibold">Analytics</h3>
            <p className="mt-2 text-neutral-400">Monitor growth metrics in real time.</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20 text-center md:px-12">
        <h2 className="text-4xl font-bold">Ready to boost your business?</h2>
        <Link
          href="/signup"
          className="mt-6 inline-block rounded-full bg-[#FFD700] px-8 py-4 font-bold text-black hover:bg-yellow-400"
        >
          Start Free Trial
        </Link>
      </section>

      {/* Footer */}
      <footer className="px-6 py-10 border-t border-white/10 text-center text-sm text-neutral-400">
        © {new Date().getFullYear()} SignalBoost. All rights reserved.
      </footer>
    </main>
  )
}
