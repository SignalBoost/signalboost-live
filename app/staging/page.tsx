'use client'

import Link from 'next/link'
import { getStagingModules, stagingDeployment } from '@/lib/deployment/staging'
import { useTranslation } from '@/lib/i18n/useTranslation'

export default function StagingPage() {
  const { t } = useTranslation()
  const modules = getStagingModules()

  return (
    <main className="min-h-screen bg-[#05070b] px-6 py-8 text-white md:px-10">
      <Link href="/" className="text-[#FFD700] no-underline">{t('staging.back', '← SignalBoost')}</Link>

      <section className="mt-10 rounded-[2rem] border border-[#FFD700]/25 bg-[radial-gradient(circle_at_top_left,rgba(255,215,0,.22),transparent_34%),linear-gradient(135deg,#111827,#05070b)] p-8 shadow-2xl">
        <p className="text-xs uppercase tracking-[0.35em] text-[#FFD700]">{t('staging.kicker', 'Temporary deployment')}</p>
        <h1 className="mt-4 max-w-4xl text-4xl font-black md:text-6xl">{t('staging.title', 'Staging cockpit for SignalBoost SaaS testing.')}</h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-white/72">{stagingDeployment.purpose}{t('staging.leadTail', ' Use this page as the QA entry point for Marketplace, pricing, dashboard modules, and multilingual smoke checks before promoting a build.')}</p>
        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <span className="rounded-full border border-white/10 bg-white/[.06] px-4 py-2">{t('staging.projectLabel', 'Project:')} {stagingDeployment.project}</span>
          <span className="rounded-full border border-white/10 bg-white/[.06] px-4 py-2">{t('staging.envLabel', 'Environment:')} {stagingDeployment.environment}</span>
          <span className="rounded-full border border-white/10 bg-white/[.06] px-4 py-2">{t('staging.releaseLabel', 'Release:')} {stagingDeployment.releaseLabel}</span>
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_.8fr]">
        <article className="rounded-3xl border border-white/10 bg-white/[.04] p-6">
          <h2 className="text-2xl font-bold">{t('staging.smokeTitle', 'SaaS module smoke test matrix')}</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {modules.map((module) => (
              <Link key={module.key} href={module.href} className="rounded-2xl border border-white/10 bg-black/30 p-4 text-white no-underline transition hover:border-[#FFD700]/60">
                <p className="font-bold">{module.label}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[#FFD700]">{module.telemetryEvent}</p>
              </Link>
            ))}
          </div>
        </article>

        <aside className="rounded-3xl border border-[#FFD700]/20 bg-[#FFD700]/10 p-6">
          <h2 className="text-2xl font-bold text-[#FFD700]">{t('staging.qaTitle', 'QA checklist')}</h2>
          <ul className="mt-5 space-y-3">
            {stagingDeployment.checks.map((check) => (
              <li key={check} className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm leading-6 text-white/75">✓ {check}</li>
            ))}
          </ul>
        </aside>
      </section>

      <section className="mt-8 rounded-3xl border border-white/10 bg-black/35 p-6">
        <h2 className="text-xl font-bold">{t('staging.routeCoverageTitle', 'Localized route coverage')}</h2>
        <p className="mt-2 text-white/60">{t('staging.routeCoverageLead', 'Verify each route with the language switcher across')} {stagingDeployment.locales.join(', ')}.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          {stagingDeployment.routes.map((route) => (
            <Link key={route} href={route} className="rounded-full border border-white/10 px-4 py-2 text-white no-underline hover:border-[#FFD700]">{route}</Link>
          ))}
        </div>
      </section>
    </main>
  )
}
