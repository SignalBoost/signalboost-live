'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { answerSignalBoostConcierge } from '@/lib/concierge/unifiedConcierge'

export default function PersonalAssistantPage() {
  const [query, setQuery] = useState('How should I use Calendar and Spreadsheets with Marketplace bookings?')
  const answer = useMemo(() => answerSignalBoostConcierge(query), [query])

  return (
    <main className="min-h-screen bg-[#05070b] text-white">
      <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,215,0,.2),transparent_35%),linear-gradient(135deg,#101827,#05070b)] p-8">
        <p className="text-xs uppercase tracking-[0.35em] text-[#FFD700]">Concierge AI</p>
        <h1 className="mt-4 text-4xl font-black">Personal Assistant</h1>
        <p className="mt-3 max-w-3xl text-white/70">Ask one assistant about SignalBoost Marketplace partners, categories, bookings, pricing, and SaaS modules inside the same cockpit.</p>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
        <div className="rounded-3xl border border-white/10 bg-white/[.04] p-6">
          <label className="text-sm font-bold text-white/70" htmlFor="concierge-query">Mission question</label>
          <textarea
            id="concierge-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="mt-3 min-h-44 w-full rounded-2xl border border-white/10 bg-black/40 p-4 text-white outline-none focus:border-[#FFD700]"
          />
        </div>
        <div className="rounded-3xl border border-[#FFD700]/20 bg-black/50 p-6 shadow-[0_0_45px_rgba(255,215,0,.08)]">
          <p className="text-sm text-[#FFD700]">{answer.scope}</p>
          <p className="mt-4 text-lg leading-8 text-white/80">{answer.reply}</p>
          <p className="mt-5 rounded-2xl border border-white/10 bg-white/[.04] p-4 text-sm text-white/60">Telemetry: {answer.telemetryEvent}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            {answer.nextActions.map((action) => (
              <Link key={action.href} href={action.href} className="rounded-full border border-white/10 px-4 py-2 text-sm text-white no-underline hover:border-[#FFD700]">
                {action.label}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
