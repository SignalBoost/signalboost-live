import Link from 'next/link'
import { headers } from 'next/headers'
import { requireAdminAccess } from '@/lib/admin/accessControl'
import { adminTelemetrySummary, executiveTelemetry, saasTelemetryEvents } from '@/lib/admin/saasTelemetry'

export default async function AdminConsolePage() {
  const access = requireAdminAccess(await headers())

  if (!access.allowed) {
    return (
      <main className="min-h-screen bg-[#05070b] p-8 text-white">
        <Link href="/dashboard" className="text-[#FFD700] no-underline">← SignalBoost cockpit</Link>
        <section role="alert" className="mt-10 rounded-[2rem] border border-[#FFD700]/30 bg-[#FFD700]/10 p-8 shadow-[0_0_40px_rgba(255,215,0,.12)]">
          <p className="text-xs uppercase tracking-[0.35em] text-[#FFD700]">Restricted executive telemetry</p>
          <h1 className="mt-4 text-4xl font-black">Owner/admin access required</h1>
          <p className="mt-4 max-w-3xl text-white/75">{access.reason}</p>
          <p className="mt-3 text-sm text-white/50">Detected role: {access.role}</p>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#05070b] p-8 text-white">
      <Link href="/dashboard" className="text-[#FFD700] no-underline">← SignalBoost cockpit</Link>
      <section className="mt-10 rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,215,0,.18),transparent_35%),linear-gradient(135deg,#101827,#05070b)] p-8">
        <p className="text-xs uppercase tracking-[0.35em] text-[#FFD700]">Admin Console</p>
        <h1 className="mt-4 text-4xl font-black">{adminTelemetrySummary.title}</h1>
        <p className="mt-4 max-w-3xl text-white/70">{adminTelemetrySummary.description}</p>
        <p className="mt-4 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-100">Access verified: {access.role}</p>
      </section>

      <section aria-label="Admin telemetry metrics" className="mt-8 grid gap-4 md:grid-cols-4">
        {adminTelemetrySummary.metrics.map((metric) => (
          <div key={metric.label} className="rounded-3xl border border-white/10 bg-white/[.04] p-5">
            <p className="text-sm text-white/50">{metric.label}</p>
            <p className="mt-2 text-2xl font-bold text-[#FFD700]">{metric.value}</p>
          </div>
        ))}
      </section>

      <section aria-label="Executive dashboard telemetry" className="mt-8 grid gap-4 xl:grid-cols-2">
        {Object.entries(executiveTelemetry)
          .filter(([key]) => key !== 'forecasts')
          .map(([group, cards]) => (
            <div key={group} className="rounded-3xl border border-white/10 bg-black/40 p-6">
              <h2 className="text-2xl font-bold capitalize text-[#FFD700]">{group.replace(/([A-Z])/g, ' $1')}</h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {cards.map((card) => (
                  <article key={card.label} className="rounded-2xl border border-white/10 bg-white/[.04] p-4">
                    <p className="text-sm text-white/50">{card.label}</p>
                    <p className="mt-2 text-xl font-black">{card.value}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.18em] text-white/50">{card.trend}</p>
                  </article>
                ))}
              </div>
            </div>
          ))}
      </section>

      <section aria-label="Forecasting predictions" className="mt-8 rounded-3xl border border-[#FFD700]/20 bg-[#FFD700]/10 p-6">
        <h2 className="text-2xl font-bold text-[#FFD700]">Forecasting predictions</h2>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {executiveTelemetry.forecasts.map((forecast) => (
            <article key={forecast.segment} className="rounded-2xl border border-white/10 bg-black/30 p-5">
              <p className="text-sm uppercase tracking-[0.2em] text-white/50">{forecast.segment}</p>
              <p className="mt-3 text-white/80">{forecast.prediction}</p>
              <p className="mt-4 text-sm font-bold text-[#FFD700]">Confidence {forecast.confidence}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-3xl border border-white/10 bg-black/40 p-6">
        <h2 className="text-2xl font-bold">SaaS usage stream inside SignalBoost</h2>
        <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-white/[.06] text-white/60">
              <tr>
                <th className="p-4">Module</th>
                <th className="p-4">Event</th>
                <th className="p-4">Area</th>
                <th className="p-4">Detail</th>
                <th className="p-4">Status</th>
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
