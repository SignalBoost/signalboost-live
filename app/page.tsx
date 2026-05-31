'use client'

import Link from 'next/link'
import { useTranslation } from '@/lib/i18n/useTranslation'

export default function HomePage() {
  const { t } = useTranslation()
  return (
    <main className="min-h-screen bg-black text-white p-8 pt-20">
      <section className="max-w-4xl">
        <p className="text-sm text-[#FFD700] mb-3">{t('landing.kicker')}</p>
        <h1 className="text-5xl font-bold mb-5">{t('landing.title')}</h1>
        <p className="text-neutral-400 text-xl mb-8">{t('landing.subtitle')}</p>
        <div className="flex flex-wrap gap-4">
          <Link href="/dashboard/promote" className="px-5 py-3 rounded-lg bg-[#FFD700] text-black font-semibold no-underline">{t('landing.cta')}</Link>
          <Link href="/pricing" className="px-5 py-3 rounded-lg border border-neutral-700 text-white no-underline">{t('landing.secondary')}</Link>
        </div>
      </section>
    </main>
  )
}
