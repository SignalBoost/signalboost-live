import Link from 'next/link'

const modules = [
  {
    name: 'Promote Business',
    route: '/dashboard/promote',
    focus: 'Campaign launch flow, partner messaging, and AI-generated business copy.',
  },
  {
    name: 'Reviews',
    route: '/dashboard/reviews',
    focus: 'Review response cockpit, reputation prompts, and trust-signal summaries.',
  },
  {
    name: 'Calendar',
    route: '/dashboard/calendar',
    focus: 'Mission timeline, booking handoffs, and localized schedule review.',
  },
  {
    name: 'Spreadsheets',
    route: '/dashboard/spreadsheets',
    focus: 'Data-grid imports, KPI validation, and reporting export readiness.',
  },
  {
    name: 'Outreach',
    route: '/dashboard/outreach',
    focus: 'Email drafts, partner notifications, and follow-up sequencing.',
  },
  {
    name: 'Personal Assistant',
    route: '/dashboard/assistant',
    focus: 'Concierge guidance, multilingual fallback, and operator handoff quality.',
  },
]

const qaLayers = [
  'Repo targeting confirms signalboost-live is staging-only.',
  'TypeScript verifies cockpit routes compile before temporary deployment.',
  'Next build validates Vercel-compatible rendering for the SaaS test surface.',
  'Manual smoke testing covers Marketplace, pricing, dashboard, and module routes.',
]

export default function StagingDeploymentPage() {
  return (
    <main className="min-h-screen bg-[#030712] px-6 py-8 text-white md:px-10">
      <section className="mx-auto max-w-6xl rounded-[2rem] border border-cyan-300/20 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.24),transparent_34%),linear-gradient(135deg,rgba(15,23,42,.96),rgba(3,7,18,1))] p-8 shadow-[0_0_60px_rgba(34,211,238,.12)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link href="/" className="text-sm font-bold uppercase tracking-[0.3em] text-cyan-200 no-underline">
            SignalBoost Live
          </Link>
          <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.25em] text-cyan-100">
            Staging deployment
          </span>
        </div>
        <div className="mt-16 grid gap-8 lg:grid-cols-[1.2fr_.8fr] lg:items-end">
          <div>
            <p className="text-sm uppercase tracking-[0.35em] text-[#FFD700]">Temporary SaaS testing orbit</p>
            <h1 className="mt-5 text-4xl font-black leading-tight md:text-6xl">
              Staging command center for validating cockpit modules before production merge.
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">
              This signalboost-live route is intentionally limited to staging, QA, and experimental deployments. It gives reviewers a single launchpad for smoke-testing the unified Marketplace + SaaS cockpit without treating this repository as production.
            </p>
          </div>
          <aside className="rounded-3xl border border-white/10 bg-black/30 p-6">
            <p className="text-xs uppercase tracking-[0.28em] text-cyan-200">Deployment rule</p>
            <p className="mt-4 text-2xl font-bold">Use for temporary SaaS validation only.</p>
            <p className="mt-4 text-sm leading-6 text-slate-400">
              Production homepage redesigns, permanent pricing updates, and executive cockpit launches belong in the main SignalBoost repository after QA approval.
            </p>
          </aside>
        </div>
      </section>

      <section className="mx-auto mt-8 grid max-w-6xl gap-5 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((module) => (
          <Link
            key={module.name}
            href={module.route}
            className="rounded-3xl border border-white/10 bg-white/[.04] p-6 text-white no-underline transition hover:-translate-y-1 hover:border-cyan-300/50 hover:bg-cyan-300/10"
          >
            <p className="text-xs uppercase tracking-[0.25em] text-[#FFD700]">SaaS module smoke test</p>
            <h2 className="mt-4 text-2xl font-black">{module.name}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">{module.focus}</p>
            <p className="mt-5 text-sm font-semibold text-cyan-200">Open {module.route} →</p>
          </Link>
        ))}
      </section>

      <section className="mx-auto mt-8 max-w-6xl rounded-3xl border border-[#FFD700]/20 bg-[#FFD700]/10 p-6">
        <div className="grid gap-6 lg:grid-cols-[.7fr_1fr]">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-[#FFD700]">QA checklist</p>
            <h2 className="mt-3 text-3xl font-black">Pre-flight checks for reviewers</h2>
          </div>
          <ul className="grid gap-3 text-sm leading-6 text-slate-200 md:grid-cols-2">
            {qaLayers.map((layer) => (
              <li key={layer} className="rounded-2xl border border-white/10 bg-black/30 p-4">✓ {layer}</li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  )
}
