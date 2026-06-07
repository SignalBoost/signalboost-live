import Link from 'next/link'
import { FeatureCard, Footer, MarketingNavbar, MetricCard } from '@/components/saas/MarketingShell'

const features = [
  { icon: '🔐', title: 'Secure accounts', description: 'JWT authentication, bcrypt password hashing, and role-based access controls for owners, admins, editors, and viewers.' },
  { icon: '🏟️', title: 'Sports operations CRUD', description: 'REST-backed workflows for teams, matches, rankings, and content so operators can manage league data from one place.' },
  { icon: '💳', title: 'Subscription billing', description: 'Stripe checkout and MercadoPago preferences with plan-aware dashboards and Starter-to-Growth upgrade paths.' },
  { icon: '🚀', title: 'Production deployment', description: 'Docker, Vercel, PostgreSQL migrations, health checks, and CI/CD are included so teams can ship safely.' },
]

const metrics = [
  { label: 'Starter workspace', value: '3 seats', helper: 'Publish team pages, five upcoming matches, and basic rankings.' },
  { label: 'Growth workspace', value: '25 seats', helper: 'Unlock advanced content workflows, sponsor placements, and analytics.' },
  { label: 'API coverage', value: '7 domains', helper: 'Auth, users, teams, matches, rankings, content, and payments.' },
]

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#05070b] text-white">
      <MarketingNavbar />
      <section className="mx-auto grid max-w-7xl gap-10 px-4 pb-16 pt-8 sm:px-6 lg:grid-cols-[1.05fr_.95fr] lg:px-8 lg:pb-24 lg:pt-16">
        <div>
          <p className="inline-flex rounded-full border border-[#FFD700]/30 bg-[#FFD700]/10 px-4 py-2 text-xs font-black uppercase tracking-[0.25em] text-[#FFD700]">Complete SaaS foundation</p>
          <h1 className="mt-6 max-w-5xl text-5xl font-black tracking-tight md:text-7xl">Launch a subscription sports data platform in days, not months.</h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-white/65 md:text-xl">SignalBoost Live combines a polished Next.js interface, Express REST APIs, PostgreSQL migrations, secure authentication, and dual payment providers for sports organizations moving from spreadsheets to a real SaaS operating system.</p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link href="/dashboard" className="rounded-full bg-[#FFD700] px-6 py-3 font-black text-black no-underline shadow-[0_0_30px_rgba(255,215,0,.25)] transition hover:-translate-y-0.5">Open dashboard</Link>
            <Link href="/pricing" className="rounded-full border border-white/15 px-6 py-3 font-black text-white no-underline transition hover:border-[#FFD700]/50 hover:text-[#FFD700]">Compare plans</Link>
          </div>
        </div>
        <div className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,215,0,.18),transparent_35%),rgba(255,255,255,.04)] p-5 shadow-2xl shadow-black/40">
          <div className="rounded-[1.5rem] border border-white/10 bg-black/45 p-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <p className="text-sm text-white/45">Current plan</p>
                <p className="mt-1 text-2xl font-black text-[#FFD700]">Starter</p>
              </div>
              <Link href="/pricing" className="rounded-full bg-white px-4 py-2 text-sm font-black text-black no-underline">Upgrade</Link>
            </div>
            <div className="mt-5 grid gap-3">
              {['Team roster sync', 'Match schedule API', 'Ranking moderation', 'Sponsor content queue'].map((item, index) => (
                <div key={item} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[.03] p-4">
                  <span className="font-semibold text-white/80">{item}</span>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${index < 2 ? 'bg-emerald-400/10 text-emerald-200' : 'bg-[#FFD700]/10 text-[#FFD700]'}`}>{index < 2 ? 'Live' : 'Growth'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-7xl gap-4 px-4 pb-14 sm:px-6 md:grid-cols-3 lg:px-8">
        {metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}
      </section>
      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <div className="mb-8 max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-[#FFD700]">What is included</p>
          <h2 className="mt-3 text-3xl font-black md:text-5xl">Frontend, backend, data, billing, and deployment primitives.</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {features.map((feature) => <FeatureCard key={feature.title} {...feature} />)}
        </div>
      </section>
      <Footer />
    </main>
  )
}
