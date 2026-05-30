import Link from 'next/link'
import { cockpitWireframe, signalBoostModules } from '@/lib/platform/unifiedPlatform'
import { adminTelemetrySummary, executiveTelemetry } from '@/lib/admin/saasTelemetry'

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-[#05070b] text-white">
      <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,215,0,.2),transparent_35%),linear-gradient(135deg,#101827,#05070b)] p-8">
        <p className="text-xs uppercase tracking-[0.35em] text-[#FFD700]">NASA-style mission control</p>
        <h1 className="mt-4 max-w-4xl text-4xl font-black md:text-6xl">Unified SignalBoost cockpit for Marketplace + SaaS.</h1>
        <p className="mt-5 max-w-3xl text-lg text-white/70">Calendar and Spreadsheets now live directly in the SignalBoost repo alongside Promote Business, Reviews, Outreach, and Personal Assistant.</p>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {signalBoostModules.map((module) => (
          <Link key={module.key} href={module.href} className="rounded-3xl border border-white/10 bg-white/[.04] p-6 text-white no-underline transition hover:-translate-y-1 hover:border-[#FFD700]/50 hover:bg-[#FFD700]/10">
            <div className="text-3xl">{module.icon}</div>
            <h2 className="mt-4 text-2xl font-bold">{module.label}</h2>
            <p className="mt-3 text-sm leading-6 text-white/60">{module.description}</p>
            <p className="mt-5 text-xs uppercase tracking-[0.2em] text-[#FFD700]">{module.telemetryEvent}</p>
          </Link>
        ))}
      </section>


      <section aria-label="Executive cockpit" className="mt-8 rounded-[2rem] border border-[#FFD700]/20 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,.12),transparent_30%),rgba(255,215,0,.08)] p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-[#FFD700]">Owner/admin executive dashboard</p>
            <h2 className="mt-3 text-3xl font-black">Financials, KPIs, CRM, Forecasting, and Outreach telemetry</h2>
          </div>
          <Link href="/admin" className="rounded-full border border-[#FFD700]/40 px-5 py-3 text-sm font-bold text-[#FFD700] no-underline hover:bg-[#FFD700]/10">Open restricted console</Link>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-5">
          {[
            ['Financials', executiveTelemetry.financials[0].value, executiveTelemetry.financials[0].trend],
            ['KPIs', executiveTelemetry.kpis[0].value, executiveTelemetry.kpis[0].trend],
            ['CRM pipeline', executiveTelemetry.crmPipeline[0].value, executiveTelemetry.crmPipeline[0].trend],
            ['Forecasting', executiveTelemetry.forecasts[0].confidence, executiveTelemetry.forecasts[0].prediction],
            ['Outreach', executiveTelemetry.outreach[0].value, executiveTelemetry.outreach[0].trend],
          ].map(([label, value, trend]) => (
            <article key={label} className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <p className="text-sm text-white/50">{label}</p>
              <p className="mt-2 text-2xl font-black text-[#FFD700]">{value}</p>
              <p className="mt-2 text-xs leading-5 text-white/60">{trend}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_.8fr]">
        <div className="rounded-3xl border border-white/10 bg-black/40 p-6">
          <h2 className="text-2xl font-bold">Wireframe preview</h2>
          <div className="mt-5 space-y-3">
            {cockpitWireframe.map((line) => (
              <div key={line} className="rounded-2xl border border-white/10 bg-white/[.03] p-4 text-white/70">{line}</div>
            ))}
          </div>
        </div>
        <aside className="rounded-3xl border border-[#FFD700]/20 bg-[#FFD700]/10 p-6">
          <h2 className="text-2xl font-bold text-[#FFD700]">{adminTelemetrySummary.title}</h2>
          <p className="mt-3 text-white/70">{adminTelemetrySummary.description}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {adminTelemetrySummary.metrics.map((metric) => (
              <div key={metric.label} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <p className="text-sm text-white/50">{metric.label}</p>
                <p className="mt-1 font-bold">{metric.value}</p>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </main>
  )
}
