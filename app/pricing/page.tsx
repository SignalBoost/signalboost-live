'use client'

import Link from 'next/link'
import { signalBoostModules } from '@/lib/platform/unifiedPlatform'
import { useTranslation } from '@/lib/i18n/useTranslation'

const tiers = [
  { key: 'pricing.tier.launch', price: '$29', modules: ['Promote Business', 'Reviews', 'Calendar'] },
  { key: 'pricing.tier.growth', price: '$79', modules: ['Spreadsheets', 'Outreach', 'Personal Assistant'] },
  { key: 'pricing.tier.command', price: 'Custom', modules: ['Admin Console telemetry', 'Marketplace + SaaS Concierge', 'Priority migration support'] },
]

export default function PricingPage() {
  const { t } = useTranslation()

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <Link href="/" className="text-[#FFD700] no-underline">← SignalBoost</Link>
      <section className="mt-12 max-w-4xl">
        <p className="text-xs uppercase tracking-[0.35em] text-[#FFD700]">{t('pricing.kicker')}</p>
        <h1 className="mt-4 text-5xl font-black">{t('pages.pricing.title')}</h1>
        <p className="mt-5 text-xl text-neutral-400">{t('pricing.subtitle')}</p>
      </section>

      <section className="mt-10 grid gap-5 lg:grid-cols-3">
        {tiers.map((tier) => (
          <article key={tier.key} className="rounded-3xl border border-white/10 bg-white/[.04] p-6">
            <h2 className="text-2xl font-bold">{t(tier.key)}</h2>
            <p className="mt-3 text-4xl font-black text-[#FFD700]">{tier.price}</p>
            <ul className="mt-5 space-y-3 text-white/70">
              {tier.modules.map((module) => <li key={module}>✓ {module}</li>)}
            </ul>
            <Link href="/dashboard" className="mt-6 inline-block rounded-full bg-[#FFD700] px-5 py-3 font-bold text-black no-underline">{t('landing.cta')}</Link>
          </article>
        ))}
      </section>

      <section className="mt-10 rounded-3xl border border-[#FFD700]/20 bg-[#FFD700]/10 p-6">
        <h2 className="text-2xl font-bold text-[#FFD700]">{t('pricing.modules.title')}</h2>
        <p className="mt-2 text-white/70">{t('pricing.modules.subtitle')}</p>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {signalBoostModules.map((module) => (
            <Link key={module.key} href={module.href} className="rounded-2xl border border-white/10 bg-black/30 p-4 text-white no-underline transition hover:border-[#FFD700]">
              <span className="mr-2">{module.icon}</span>{module.label}
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}
