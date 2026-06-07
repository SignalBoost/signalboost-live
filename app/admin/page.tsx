'use client'

import Link from 'next/link'
import { adminTelemetryMetricKeys, saasTelemetryEvents } from '@/lib/admin/saasTelemetry'
import { useTranslation } from '@/lib/i18n/useTranslation'

export default function AdminConsolePage() {
  const { t } = useTranslation()

  return (
    <main className="min-h-screen bg-[#05070b] p-8 text-white">
      <Link href="/dashboard" className="text-[#FFD700] no-underline">{t('common.backToDashboard')}</Link>
      <section className="mt-10 rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,215,0,.18),transparent_35%),linear-gradient(135deg,#101827,#05070b)] p-8">
        <p className="text-xs uppercase tracking-[0.35em] text-[#FFD700]">{t('admin.overview.title')}</p>
        <h1 className="mt-4 text-4xl font-black">{t('admin.summary.title')}</h1>
        <p className="mt-4 max-w-3xl text-white/70">{t('admin.summary.description')}</p>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-4">
        {adminTelemetryMetricKeys.map((metric) => (
          <div key={metric.labelKey} className="rounded-3xl border border-white/10 bg-white/[.04] p-5">
            <p className="text-sm text-white/50">{t(metric.labelKey)}</p>
            <p className="mt-2 text-2xl font-bold text-[#FFD700]">{'valueKey' in metric ? t(metric.valueKey!) : metric.value}</p>
          </div>
        ))}
      </section>

      <section className="mt-8 rounded-3xl border border-white/10 bg-black/40 p-6">
        <h2 className="text-2xl font-bold">{t('admin.stream.title')}</h2>
        <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-white/[.06] text-white/60">
              <tr>
                <th className="p-4">{t('common.module')}</th>
                <th className="p-4">{t('common.eventColumn')}</th>
                <th className="p-4">{t('common.area')}</th>
                <th className="p-4">{t('common.detail')}</th>
                <th className="p-4">{t('common.statusColumn')}</th>
              </tr>
            </thead>
            <tbody>
              {saasTelemetryEvents.map((event) => (
                <tr key={event.id} className="border-t border-white/10">
                  <td className="p-4 font-semibold">{t(event.moduleKey)}</td>
                  <td className="p-4 text-[#FFD700]">{event.event}</td>
                  <td className="p-4 text-white/70">{t(event.areaKey)}</td>
                  <td className="p-4 text-white/60">{t(event.detailKey, '', { role: t(event.detailRoleKey) })}</td>
                  <td className="p-4"><span className="rounded-full bg-emerald-400/10 px-3 py-1 text-emerald-200">{t(event.statusKey)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
