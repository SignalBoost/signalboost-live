import Link from 'next/link'

const navigation = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'League Ops', href: '/dashboard/league' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Docs', href: '/docs' },
]

export function MarketingNavbar() {
  return (
    <header className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <Link href="/" className="flex items-center gap-3 text-white no-underline">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#FFD700] font-black text-black shadow-[0_0_30px_rgba(255,215,0,.35)]">SB</span>
        <span>
          <span className="block text-lg font-black leading-none">SignalBoost Live</span>
          <span className="text-xs uppercase tracking-[0.25em] text-white/40">Sports SaaS</span>
        </span>
      </Link>
      <nav className="flex flex-wrap items-center gap-2 rounded-full border border-white/10 bg-white/[.04] p-1 backdrop-blur">
        {navigation.map((item) => (
          <Link key={item.href} href={item.href} className="rounded-full px-4 py-2 text-sm font-semibold text-white/70 no-underline transition hover:bg-white/10 hover:text-white">
            {item.label}
          </Link>
        ))}
      </nav>
      <Link href="/login" className="rounded-full bg-white px-5 py-2.5 text-sm font-black text-black no-underline transition hover:bg-[#FFD700]">
        Sign in
      </Link>
    </header>
  )
}

export function Footer() {
  return (
    <footer className="border-t border-white/10 px-4 py-10 text-white/55 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <p className="font-bold text-white">SignalBoost Live</p>
          <p className="mt-2 max-w-2xl text-sm leading-6">Production-ready foundation for sports organizations that need subscriptions, content operations, rankings, match data, and team collaboration.</p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/pricing" className="text-white/60 no-underline hover:text-[#FFD700]">Pricing</Link>
          <Link href="/support" className="text-white/60 no-underline hover:text-[#FFD700]">Support</Link>
          <Link href="/dashboard" className="text-white/60 no-underline hover:text-[#FFD700]">Dashboard</Link>
        </div>
      </div>
    </footer>
  )
}

export function MetricCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[.04] p-5 shadow-2xl shadow-black/20">
      <p className="text-sm text-white/45">{label}</p>
      <p className="mt-2 text-3xl font-black text-white">{value}</p>
      <p className="mt-2 text-sm leading-6 text-white/55">{helper}</p>
    </div>
  )
}

export function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <article className="rounded-[2rem] border border-white/10 bg-black/30 p-6 transition hover:-translate-y-1 hover:border-[#FFD700]/40 hover:bg-[#FFD700]/10">
      <span className="text-3xl">{icon}</span>
      <h3 className="mt-5 text-xl font-black text-white">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-white/60">{description}</p>
    </article>
  )
}
