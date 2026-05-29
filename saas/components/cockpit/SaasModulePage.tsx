'use client'

import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'
import { COCKPIT_COPY, LOCALE_META, MODULES, type ModuleSlug, formatMissionDate, normalizeCockpitLocale } from '@/lib/cockpit/missionControl'

export default function SaasModulePage({ slug }: { slug: ModuleSlug }) {
  const { lang } = useI18n()
  const locale = normalizeCockpitLocale(lang)
  const module = MODULES[slug]
  const copy = COCKPIT_COPY[locale]

  return (
    <main className="sb-page-shell sb-section" dir={LOCALE_META[locale].dir}>
      <section className="sb-module-hero" style={{ '--module-accent': module.accent } as React.CSSProperties}>
        <div>
          <span className="sb-eyebrow">SaaS cockpit module · {LOCALE_META[locale].label}</span>
          <h1 className="sb-h1"><span aria-hidden="true">{module.icon}</span> {module.title[locale]}</h1>
          <p className="sb-body">{module.subtitle[locale]}</p>
          <div className="sb-cta-row">
            <Link className="sb-button-primary" href="/dashboard">Open live workspace</Link>
            <Link className="sb-button-secondary" href="/pricing">View pricing</Link>
          </div>
        </div>
        <aside className="sb-module-telemetry" aria-label="Localized telemetry">
          <span>{copy.lastSyncLabel}</span>
          <strong>{formatMissionDate(locale)}</strong>
          <small>{LOCALE_META[locale].region} · {LOCALE_META[locale].currency}</small>
        </aside>
      </section>

      <section className="sb-mission-grid" aria-label="Module workflow telemetry">
        {module.workflows.map((workflow, index) => (
          <article className="sb-glass-panel" key={workflow} tabIndex={0}>
            <h3>{String(index + 1).padStart(2, '0')} · {workflow}</h3>
            <p>{module.telemetry[index]} is monitored through a dark-neon glass panel with hover focus, approval state, and CRM handoff.</p>
          </article>
        ))}
      </section>

      <section className="sb-glass sb-module-command" aria-label="Concierge module command">
        <div>
          <span className="sb-eyebrow">Concierge</span>
          <h2 className="sb-h2">{copy.conciergePrompt}</h2>
          <p className="sb-body">{copy.conciergeReply}</p>
        </div>
        <Link className="sb-button-primary" href="/dashboard/outreach/pipeline">Send to CRM pipeline</Link>
      </section>
    </main>
  )
}
