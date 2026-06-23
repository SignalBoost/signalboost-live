'use client'

import Link from 'next/link'
import { useTranslation } from '@/lib/i18n/useTranslation'

export default function ExecutivePage() {
  const { t } = useTranslation()
  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <Link href="/" className="text-[#FFD700] no-underline">{t('exec.back', '← SignalBoost')}</Link>
      <section className="mt-12 max-w-4xl rounded-[2rem] border border-white/10 bg-white/[.04] p-8">
        <p className="text-xs uppercase tracking-[0.35em] text-[#FFD700]">{t('exec.kicker', 'Executive')}</p>
        <h1 className="mt-4 text-5xl font-black">{t('exec.title', 'SignalBoost executive command.')}</h1>
        <p className="mt-5 text-xl leading-8 text-neutral-400">
          {t('exec.body', 'Review growth plans, Concierge direction, pricing, and owner-level operations without adding the Stationary SaaS Station module list to the marketing navbar.')}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/admin" className="rounded-full bg-[#FFD700] px-5 py-3 font-bold text-black no-underline">{t('exec.openAdmin', 'Open admin console')}</Link>
          <Link href="/pricing" className="rounded-full border border-white/15 px-5 py-3 font-bold text-white no-underline">{t('exec.reviewPricing', 'Review pricing')}</Link>
        </div>
      </section>
    </main>
  )
}
