'use client'

import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

export default function Header() {
  const { dict } = useI18n()

  return (
    <header className="w-full px-6 py-4 flex items-center justify-between bg-[#0f0f0f] border-b border-white/10">
      <Link href="/" className="text-white font-bold text-xl tracking-tight no-underline">⚡ SignalBoost</Link>
      <nav className="hidden md:flex gap-6 text-sm text-white/60">
        <Link href="/podcasters" className="hover:text-white transition">{t(dict, 'podcasters', 'Podcasters')}</Link>
        <Link href="/pricing" className="hover:text-white transition">{t(dict, 'pricing', 'Pricing')}</Link>
        <Link href="/docs" className="hover:text-white transition">{t(dict, 'docs', 'Docs')}</Link>
        <Link href="/dashboard" className="hover:text-white transition">{t(dict, 'dashboard', 'Dashboard')}</Link>
      </nav>
      <div className="flex gap-3">
        <Link href="/faq" className="text-sm text-white/70 hover:text-white transition px-4 py-2">{t(dict, 'support.faq', 'FAQ')}</Link>
        <Link href="/dashboard" className="text-sm bg-yellow-400 text-black font-semibold px-4 py-2 rounded-full hover:bg-yellow-300 transition">{t(dict, 'getStarted', 'Get started')}</Link>
      </div>
    </header>
  )
}
