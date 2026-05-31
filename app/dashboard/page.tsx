'use client'

import Link from 'next/link'
import { cockpitWireframe, signalBoostModules } from '@/lib/platform/unifiedPlatform'
import { adminTelemetrySummary } from '@/lib/admin/saasTelemetry'
import { useTranslation } from '@/lib/i18n/useTranslation'

export default function DashboardPage() {
  const { t } = useTranslation()
  return (
    <main className="min-h-screen bg-[#05070b] text-white">
      <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,215,0,.2),transparent_35%),linear-gradient(135deg,#101827,#05070b)] p-8">
        <p className="text-xs uppercase tracking-[0.35em] text-[#FFD700]">{t('cockpit.kicker', 'Unified SignalBoost cockpit')}</p>
        <h1 className="mt-4 max-w-4xl text-4xl font-black md:text-6xl">Unified SignalBoost cockpit for Marketplace + SaaS.</h1>
        <p className="mt-5 max-w-3xl text-lg text-white/70">Calendar and Spreadsheets now live directly in the SignalBoost repo alongside Promote Business, Reviews, Outreach, and Personal Assistant.</p>
      </section>
      <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{signalBoostModules.map((module) => <Link key={module.key} href={module.href} className="rounded-3xl border border-white/10 bg-white/[.04] p-6 text-white no-underline transition hover:-translate-y-1 hover:border-[#FFD700]/50 hover:bg-[#FFD700]/10"><div className="text-3xl">{module.icon}</div><h2 className="mt-4 text-2xl font-bold">{t(module.labelKey, module.label)}</h2><p className="mt-3 text-sm leading-6 text-white/60">{t(module.descriptionKey, module.description)}</p><p className="mt-5 text-xs uppercase tracking-[0.2em] text-[#FFD700]">{module.telemetryEvent}</p></Link>)}</section>
      <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_.8fr]"><div className="rounded-3xl border border-white/10 bg-black/40 p-6"><h2 className="text-2xl font-bold">Wireframe preview</h2><div className="mt-5 space-y-3">{cockpitWireframe.map((line) => <div key={line.key} className="rounded-2xl border border-white/10 bg-white/[.03] p-4 text-white/70">{t(line.key, line.fallback)}</div>)}</div></div><aside className="rounded-3xl border border-[#FFD700]/20 bg-[#FFD700]/10 p-6"><h2 className="text-2xl font-bold text-[#FFD700]">{adminTelemetrySummary.title}</h2><p className="mt-3 text-white/70">{adminTelemetrySummary.description}</p><div className="mt-5 grid gap-3 sm:grid-cols-2">{adminTelemetrySummary.metrics.map((metric) => <div key={metric.label} className="rounded-2xl border border-white/10 bg-black/30 p-4"><p className="text-sm text-white/50">{metric.label}</p><p className="mt-1 font-bold">{metric.value}</p></div>)}</div></aside></section>
    </main>
  )
}
