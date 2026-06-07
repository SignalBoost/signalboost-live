import Link from 'next/link'
import { signalBoostModules } from '@/lib/platform/unifiedPlatform'
import { adminTelemetrySummary } from '@/lib/admin/saasTelemetry'

const onboardingChecklist = [
  { label: 'Confirm business profile', detail: 'Add brand name, service area, and primary customer segment.', href: '/dashboard/brand', done: true },
  { label: 'Plan first promotion', detail: 'Choose an offer, language, and launch window.', href: '/dashboard/promote', done: false },
  { label: 'Import lead or customer list', detail: 'Prepare CSV rows for Outreach and review requests.', href: '/dashboard/spreadsheets', done: false },
  { label: 'Schedule follow-up rhythm', detail: 'Block review asks, partner check-ins, and campaign reporting.', href: '/dashboard/calendar', done: false },
]

const recentActivity = [
  { title: 'Promote Business workspace prepared', meta: 'Campaign checklist ready for launch planning', time: 'Today' },
  { title: 'Admin telemetry connected', meta: 'Module views and Concierge intents roll up for operators', time: 'Today' },
  { title: 'Video Studio quota guardrails active', meta: 'Exports validate plan and overage status before render', time: 'This week' },
]

const quickActions = [
  { label: 'Launch promotion', href: '/dashboard/promote', icon: '🚀' },
  { label: 'Ask Concierge', href: '/dashboard/assistant', icon: '🤖' },
  { label: 'Import spreadsheet', href: '/dashboard/spreadsheets', icon: '📊' },
  { label: 'Review pricing', href: '/pricing', icon: '💳' },
]

export default function DashboardPage() {
  const completedItems = onboardingChecklist.filter((item) => item.done).length
  const completion = Math.round((completedItems / onboardingChecklist.length) * 100)

  return (
    <main className="min-h-screen bg-[#05070b] text-white">
      <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,215,0,.2),transparent_35%),linear-gradient(135deg,#101827,#05070b)] p-6 shadow-2xl md:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-[#FFD700]">SignalBoost operations cockpit</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-black tracking-tight md:text-6xl">Run promotions, reviews, outreach, and local growth from one workspace.</h1>
            <p className="mt-5 max-w-3xl text-lg text-white/70">Start with a focused onboarding path, then move work through Calendar, Spreadsheets, Reviews, Outreach, Promote Business, and Concierge AI.</p>
          </div>
          <div className="rounded-3xl border border-[#FFD700]/25 bg-black/35 p-5 xl:w-80">
            <p className="text-sm text-white/50">Onboarding progress</p>
            <p className="mt-2 text-4xl font-black text-[#FFD700]">{completion}%</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-[#FFD700]" style={{ width: `${completion}%` }} />
            </div>
            <p className="mt-3 text-sm text-white/60">{completedItems} of {onboardingChecklist.length} foundation steps complete.</p>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {quickActions.map((action) => (
          <Link key={action.label} href={action.href} className="rounded-3xl border border-white/10 bg-white/[.04] p-5 text-white no-underline transition hover:-translate-y-1 hover:border-[#FFD700]/50 hover:bg-[#FFD700]/10">
            <span className="text-3xl">{action.icon}</span>
            <p className="mt-4 font-bold">{action.label}</p>
            <p className="mt-2 text-sm text-white/50">Open workflow →</p>
          </Link>
        ))}
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <div className="rounded-3xl border border-white/10 bg-white/[.04] p-5 md:p-6">
          <div className="flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-[#FFD700]">Foundation checklist</p>
              <h2 className="mt-2 text-2xl font-bold">Next best setup actions</h2>
            </div>
            <Link href="/dashboard/assistant" className="rounded-full border border-white/15 px-4 py-2 text-sm font-bold text-white no-underline hover:border-[#FFD700]/50">Get guidance</Link>
          </div>
          <div className="mt-5 grid gap-3">
            {onboardingChecklist.map((item) => (
              <Link key={item.label} href={item.href} className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/30 p-4 text-white no-underline transition hover:border-[#FFD700]/50 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-3">
                  <span className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${item.done ? 'bg-emerald-400 text-black' : 'border border-[#FFD700]/40 text-[#FFD700]'}`}>{item.done ? '✓' : '○'}</span>
                  <div>
                    <p className="font-bold">{item.label}</p>
                    <p className="mt-1 text-sm text-white/55">{item.detail}</p>
                  </div>
                </div>
                <span className="text-sm text-[#FFD700]">Open</span>
              </Link>
            ))}
          </div>
        </div>

        <aside className="rounded-3xl border border-white/10 bg-black/40 p-5 md:p-6">
          <p className="text-sm uppercase tracking-[0.2em] text-[#FFD700]">Recent activity</p>
          <h2 className="mt-2 text-2xl font-bold">Workspace signal feed</h2>
          <div className="mt-5 space-y-3">
            {recentActivity.map((activity) => (
              <div key={activity.title} className="rounded-2xl border border-white/10 bg-white/[.03] p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-bold">{activity.title}</p>
                  <span className="shrink-0 text-xs text-white/40">{activity.time}</span>
                </div>
                <p className="mt-2 text-sm text-white/55">{activity.meta}</p>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_.8fr]">
        <div className="rounded-3xl border border-white/10 bg-black/40 p-5 md:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-[#FFD700]">Module health</p>
              <h2 className="mt-2 text-2xl font-bold">Operations workspaces</h2>
            </div>
            <p className="text-sm text-white/50">{signalBoostModules.length} active modules</p>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {signalBoostModules.map((module) => (
              <Link key={module.key} href={module.href} className="rounded-3xl border border-white/10 bg-white/[.04] p-5 text-white no-underline transition hover:-translate-y-1 hover:border-[#FFD700]/50 hover:bg-[#FFD700]/10">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-3xl">{module.icon}</span>
                  <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">Ready</span>
                </div>
                <h3 className="mt-4 text-xl font-bold">{module.label}</h3>
                <p className="mt-3 text-sm leading-6 text-white/60">{module.description}</p>
              </Link>
            ))}
          </div>
        </div>
        <aside className="rounded-3xl border border-[#FFD700]/20 bg-[#FFD700]/10 p-5 md:p-6">
          <p className="text-sm uppercase tracking-[0.2em] text-[#FFD700]">Admin rollup</p>
          <h2 className="mt-2 text-2xl font-bold text-[#FFD700]">{adminTelemetrySummary.title}</h2>
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
