'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { COCKPIT_COPY, LOCALE_META, MARKETPLACE_CATEGORIES, MODULE_SLUGS, MODULES, formatMissionDate, normalizeCockpitLocale } from '@/lib/cockpit/missionControl'

export default function CockpitMarketplaceHome() {
  const { lang } = useI18n()
  const locale = normalizeCockpitLocale(lang)
  const copy = COCKPIT_COPY[locale]
  const [query, setQuery] = useState('')
  const guidance = useMemo(() => {
    const signal = query.trim() || copy.searchPlaceholder
    return `${copy.conciergePrompt}: ${signal}. ${copy.conciergeReply}`
  }, [copy, query])

  return (
    <main className="sb-page-shell sb-section sb-cockpit-home" dir={LOCALE_META[locale].dir}>
      <section className="sb-nasa-hero" aria-label="Marketplace mission search">
        <div className="sb-nasa-hero__copy">
          <span className="sb-eyebrow">NASA HMI · Marketplace + SaaS</span>
          <h1 className="sb-h1">SignalBoost mission control for travel, marketplace partners, and growth modules.</h1>
          <p className="sb-body">A cockpit-grade interface that replaces clutter with AI-guided search, telemetry panels, multilingual Concierge routing, and direct SaaS actions.</p>
          <label className="sb-ai-search" htmlFor="mission-search">
            <span>⌕</span>
            <input id="mission-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.searchPlaceholder} aria-label="Ask Concierge AI" />
            <Link href="/modules/personal-assistant">AI</Link>
          </label>
          <div className="sb-telemetry-strip" aria-label="Locale telemetry">
            <span>{LOCALE_META[locale].label}</span>
            <span>{LOCALE_META[locale].region}</span>
            <span>{copy.lastSyncLabel}: {formatMissionDate(locale)}</span>
          </div>
        </div>
        <aside className="sb-concierge-dock" aria-label="Concierge AI guidance">
          <div className="sb-orbit-ring" aria-hidden="true"><span /><span /><span /></div>
          <h2>{copy.conciergePrompt}</h2>
          <p>{guidance}</p>
          <Link className="sb-button-primary" href="/dashboard">Route to workspace</Link>
        </aside>
      </section>

      <section aria-label="Marketplace categories" className="sb-cockpit-panel-grid">
        {MARKETPLACE_CATEGORIES.map((category) => (
          <Link href={category.href} key={category.key} className="sb-cockpit-panel">
            <span className="sb-cockpit-panel__icon">{category.icon}</span>
            <strong>{category.key}</strong>
            <small>{category.signal}</small>
            <em>Telemetry ready →</em>
          </Link>
        ))}
      </section>

      <section className="sb-module-rail" aria-label="SaaS mission modules">
        <div>
          <span className="sb-eyebrow">SaaS modules</span>
          <h2 className="sb-h2">Six cockpit panels for operational clarity.</h2>
        </div>
        <div className="sb-module-rail__grid">
          {MODULE_SLUGS.map((slug) => {
            const module = MODULES[slug]
            return (
              <Link href={module.href} key={slug} className="sb-module-tile" style={{ borderColor: `${module.accent}66` }}>
                <span>{module.icon}</span>
                <strong>{module.title[locale]}</strong>
                <small>{module.subtitle[locale]}</small>
              </Link>
            )
          })}
        </div>
      </section>
    </main>
  )
}
