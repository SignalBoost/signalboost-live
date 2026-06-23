'use client'

import Link from 'next/link'
import { adminTelemetrySummary, saasTelemetryEvents } from '@/lib/admin/saasTelemetry'
import { useTranslation } from '@/lib/i18n/useTranslation'

export default function AdminConsolePage() {
  const { t } = useTranslation()
  return (
    <main className="min-h-screen bg-[#05070b] p-8 text-white">
      <Link href="/dashboard" className="text-[#FFD700] no-underline">{t('admin.back', '← SignalBoost cockpit')}</Link>
      <section className="mt-10 rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,215,0,.18),transparent_35%),linear-gradient(135deg,#101827,#05070b)] p-8">
        <p className="text-xs uppercase tracking-[0.35em] text-[#FFD700]">{t('admin.kicker', 'Admin Console')}</p>
        <h1 className="mt-4 text-4xl font-black">{adminTelemetrySummary.title}</h1>
        <p className="mt-4 max-w-3xl text-white/70">{adminTelemetrySummary.description}</p>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-4">
        {adminTelemetrySummary.metrics.map((metric) => (
          <div key={metric.label} className="rounded-3xl border border-white/10 bg-white/[.04] p-5">
            <p className="text-sm text-white/50">{metric.label}</p>
            <p className="mt-2 text-2xl font-bold text-[#FFD700]">{metric.value}</p>
          </div>
        ))}
      </section>

      <section className="mt-8 rounded-3xl border border-white/10 bg-black/40 p-6">
        <h2 className="text-2xl font-bold">{t('admin.streamTitle', 'SaaS usage stream inside SignalBoost')}</h2>
        <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-white/[.06] text-white/60">
              <tr>
                <th className="p-4">{t('admin.colModule', 'Module')}</th>
                <th className="p-4">{t('admin.colEvent', 'Event')}</th>
                <th className="p-4">{t('admin.colArea', 'Area')}</th>
                <th className="p-4">{t('admin.colDetail', 'Detail')}</th>
                <th className="p-4">{t('admin.colStatus', 'Status')}</th>
              </tr>
            </thead>
            <tbody>
              {saasTelemetryEvents.map((event) => (
                <tr key={event.id} className="border-t border-white/10">
                  <td className="p-4 font-semibold">{event.module}</td>
                  <td className="p-4 text-[#FFD700]">{event.event}</td>
                  <td className="p-4 text-white/70">{event.area}</td>
                  <td className="p-4 text-white/60">{event.detail}</td>
                  <td className="p-4"><span className="rounded-full bg-emerald-400/10 px-3 py-1 text-emerald-200">{event.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
