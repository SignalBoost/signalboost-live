'use client'

import Link from 'next/link'
import LanguageSwitcher from '@/components/i18n/LanguageSwitcher'
import { useI18n } from '@/components/i18n/I18nProvider'
import { useTranslation } from '@/lib/i18n/useTranslation'

const nav = [
  ['Promote', '/dashboard/promote'],
  ['Personal Assistant', '/dashboard/assistant'],
  ['Pricing', '/pricing'],
  ['Executive', '/executive'],
]

export default function HomePage() {
  const { lang, setLang } = useI18n()
  const { t } = useTranslation()
  return (
    <main className="min-h-screen bg-black text-white p-8">
      <header className="flex flex-wrap items-center justify-between gap-4 mb-16">
        <Link href="/" className="text-2xl font-bold text-[#FFD700] no-underline">SignalBoost</Link>
        <nav className="flex flex-wrap gap-4 text-sm">
          {nav.map(([label, href]) => <Link key={href} href={href} className="text-white/70 hover:text-white no-underline">{label}</Link>)}
        </nav>
        <Link href="/login" className="rounded-full border border-[#FFD700]/40 px-4 py-2 text-sm font-bold text-[#FFD700] no-underline hover:bg-[#FFD700] hover:text-black">Login</Link>
        <LanguageSwitcher current={lang} onChange={setLang} />
      </header>
      <section className="max-w-4xl">
        <p className="text-sm text-[#FFD700] mb-3">{t('landing.kicker')}</p>
        <h1 className="text-5xl font-bold mb-5">{t('landing.title')}</h1>
        <p className="text-neutral-400 text-xl mb-8">{t('landing.subtitle')}</p>
        <div className="flex flex-wrap gap-4">
          <Link href="/dashboard" className="px-5 py-3 rounded-lg bg-[#FFD700] text-black font-semibold no-underline">{t('landing.cta')}</Link>
          <Link href="/pricing" className="px-5 py-3 rounded-lg border border-neutral-700 text-white no-underline">{t('landing.secondary')}</Link>
        </div>
      </section>
    </main>
  )
}
