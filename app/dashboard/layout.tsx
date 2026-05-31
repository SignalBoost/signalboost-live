'use client'

import Link from 'next/link'
import { signalBoostModules } from '@/lib/platform/unifiedPlatform'
import { useTranslation } from '@/lib/i18n/useTranslation'
import '../globals.css'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="min-h-screen bg-[#05070b] text-white lg:flex">
      <aside className="border-b border-white/10 bg-black/70 p-5 backdrop-blur lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:border-b-0 lg:border-r">
        <Link href="/" className="block text-2xl font-black text-[#FFD700] no-underline">SignalBoost</Link>
        <p className="mt-2 text-xs uppercase tracking-[0.25em] text-white/40">Marketplace + SaaS</p>
        <nav className="mt-8 grid gap-2">
          <Link href="/dashboard" className="rounded-2xl px-4 py-3 text-white/75 no-underline transition hover:bg-white/10 hover:text-white">{t('dashboard.overview', 'Cockpit Overview')}</Link>
          {signalBoostModules.map((module) => <Link key={module.key} href={module.href} className="rounded-2xl px-4 py-3 text-white/75 no-underline transition hover:bg-[#FFD700]/10 hover:text-[#FFD700]"><span className="mr-3">{module.icon}</span>{t(module.labelKey, module.label)}</Link>)}
        </nav>
        <div className="mt-8 rounded-3xl border border-[#FFD700]/20 bg-[#FFD700]/10 p-4 text-sm text-white/70"><p className="font-bold text-[#FFD700]">{t('dashboard.telemetryActive', 'Telemetry active')}</p><p className="mt-2">{t('dashboard.telemetryCopy', 'Module usage, Concierge intents, and Marketplace context are logged in SignalBoost Admin Console.')}</p></div>
        <Link href="/login" className="mt-6 block rounded-full border border-white/15 px-4 py-3 text-center font-bold text-white no-underline hover:border-[#FFD700] hover:text-[#FFD700]">{t('nav.logout', 'Log out')}</Link>
      </aside>
      <main className="flex-1 p-5 md:p-8">{children}</main>
    </div>
  )
}
