import Link from 'next/link'
import { redirect } from 'next/navigation'
import AdminManagerPanel from '@/components/admin/AdminManagerPanel'
import ZapierPanel from '@/components/admin/ZapierPanel'
import { adminTelemetrySummary, saasTelemetryEvents } from '@/lib/admin/saasTelemetry'
import { getCurrentAdminSession } from '@/lib/admin/adminAccess'
import { signalBoostModules } from '@/lib/platform/unifiedPlatform'

export const dynamic = 'force-dynamic'

const analyticsPanels = [
  ['Real-time traffic', 'Live module and marketing-page activity stream'],
  ['Page performance', 'Core navigation, rendering, and conversion page timing'],
  ['Funnels', 'Landing → login → cockpit → module workflow tracking'],
  ['Events', 'Module views, Zapier tests, Concierge intents, and export actions'],
  ['Module usage', 'Cowork module usage by admin testing session'],
  ['Review sentiment analytics', 'Positive, neutral, and attention-needed review signals'],
  ['AI usage analytics', 'Concierge and generation usage by feature area'],
  ['Geo + device analytics', 'Country, city, browser, and device family breakdowns'],
]

const systemHealth = [
  ['Admin access', 'Supabase admin table only'],
  ['Primary admin', 'Immutable and protected from deletion'],
  ['Billing', 'Not available to admin role'],
  ['Destructive actions', 'User deletion and owner controls disabled'],
]

export default async function AdminConsolePage() {
  const session = await getCurrentAdminSession()
  if (session.role !== 'admin') redirect('/login?next=/admin')

  return (
    <main className="min-h-screen bg-[#05070b] p-8 text-white">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link href="/dashboard" className="text-[#FFD700] no-underline">← SignalBoost cockpit</Link>
        <span className="rounded-full border border-[#FFD700]/30 bg-[#FFD700]/10 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-[#FFD700]">
          Admin only · {session.user?.is_primary ? 'Primary admin' : 'Limited admin'}
        </span>
      </div>

      <section className="mt-10 rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,215,0,.18),transparent_35%),linear-gradient(135deg,#101827,#05070b)] p-8">
        <p className="text-xs uppercase tracking-[0.35em] text-[#FFD700]">Admin Dashboard</p>
        <h1 className="mt-4 text-4xl font-black">Secure SignalBoost Admin Console</h1>
        <p className="mt-4 max-w-3xl text-white/70">Limited admin access for testing Cowork tools, triggering workflows, managing Zapier, viewing analytics, and promoting companies without owner, billing, user deletion, or destructive system permissions.</p>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-4" aria-label="Admin dashboard overview">
        {adminTelemetrySummary.metrics.map((metric) => (
          <div key={metric.label} className="rounded-3xl border border-white/10 bg-white/[.04] p-5">
            <p className="text-sm text-white/50">{metric.label}</p>
            <p className="mt-2 text-2xl font-bold text-[#FFD700]">{metric.value}</p>
          </div>
        ))}
      </section>

      <section className="mt-8 rounded-3xl border border-white/10 bg-white/[.04] p-6" aria-labelledby="cowork-title">
        <p className="text-xs uppercase tracking-[0.35em] text-[#FFD700]">Cowork Access</p>
        <h2 id="cowork-title" className="mt-2 text-2xl font-black">Quick links to Cowork modules</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {signalBoostModules.map((module) => (
            <Link key={module.key} href={module.href} className="rounded-2xl border border-white/10 bg-black/30 p-5 text-white no-underline transition hover:border-[#FFD700]/60 hover:bg-[#FFD700]/10">
              <p className="text-2xl">{module.icon}</p>
              <h3 className="mt-3 text-xl font-bold">{module.label}</h3>
              <p className="mt-2 text-sm text-white/60">{module.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <ZapierPanel />

      <section className="mt-8 rounded-3xl border border-white/10 bg-black/40 p-6" aria-labelledby="analytics-title">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-[#FFD700]">Analytics Dashboard</p>
            <h2 id="analytics-title" className="mt-2 text-2xl font-black">Traffic, performance, funnels, events, AI, sentiment, geo, and device reporting</h2>
          </div>
          <a href="/api/admin/analytics/export" className="rounded-full bg-[#FFD700] px-5 py-3 font-black text-black no-underline">Export CSV</a>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          {analyticsPanels.map(([title, description]) => (
            <article key={title} className="rounded-2xl border border-white/10 bg-white/[.04] p-5">
              <h3 className="font-bold text-[#FFD700]">{title}</h3>
              <p className="mt-2 text-sm text-white/60">{description}</p>
            </article>
          ))}
        </div>
        <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-white/[.06] text-white/60"><tr><th className="p-4">Module</th><th className="p-4">Event</th><th className="p-4">Area</th><th className="p-4">Status</th></tr></thead>
            <tbody>{saasTelemetryEvents.map((event) => <tr key={event.id} className="border-t border-white/10"><td className="p-4 font-semibold">{event.module}</td><td className="p-4 text-[#FFD700]">{event.event}</td><td className="p-4 text-white/60">{event.area}</td><td className="p-4"><span className="rounded-full bg-emerald-400/10 px-3 py-1 text-emerald-200">{event.status}</span></td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-4" aria-label="System health and access limitations">
        {systemHealth.map(([label, value]) => <article key={label} className="rounded-2xl border border-white/10 bg-white/[.04] p-5"><p className="text-sm text-white/50">{label}</p><p className="mt-2 font-bold text-white">{value}</p></article>)}
      </section>

      <AdminManagerPanel />
    </main>
  )
}
