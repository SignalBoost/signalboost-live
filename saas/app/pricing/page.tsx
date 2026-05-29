'use client'

import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'
import { COCKPIT_COPY, LOCALE_META, MODULES, PRICING_TIERS, formatMissionCurrency, normalizeCockpitLocale } from '@/lib/cockpit/missionControl'

const tierNames = {
  ignite: { en: 'Ignite', es: 'Ignición', pt: 'Ignição', pl: 'Start', ru: 'Запуск' },
  orbit: { en: 'Orbit', es: 'Órbita', pt: 'Órbita', pl: 'Orbita', ru: 'Орбита' },
  mission: { en: 'Mission Control', es: 'Control de misión', pt: 'Controle de missão', pl: 'Kontrola misji', ru: 'Центр миссии' },
} as const

export default function PricingPage() {
  const { lang } = useI18n()
  const locale = normalizeCockpitLocale(lang)
  const copy = COCKPIT_COPY[locale]

  return (
    <main className="sb-page-shell sb-section" dir={LOCALE_META[locale].dir}>
      <section className="sb-pricing-hero" aria-label="Unified SaaS pricing">
        <span className="sb-eyebrow">SignalBoost SaaS · {LOCALE_META[locale].label}</span>
        <h1 className="sb-h1">{copy.pricingTitle}</h1>
        <p className="sb-body">{copy.pricingSubtitle}</p>
      </section>

      <section className="sb-pricing-grid" aria-label="Pricing tiers">
        {PRICING_TIERS.map((tier) => (
          <article key={tier.key} className={`sb-pricing-card ${tier.highlighted ? 'sb-pricing-card--hot' : ''}`}>
            {tier.highlighted && <span className="sb-eyebrow">Recommended orbit</span>}
            <h2>{tierNames[tier.key][locale]}</h2>
            <div className="sb-pricing-card__price">
              {formatMissionCurrency(locale, tier.monthly)}<span>{copy.perMonth}</span>
            </div>
            <div className="sb-pricing-card__modules">
              {tier.modules.map((slug) => {
                const module = MODULES[slug]
                return (
                  <Link href={module.href} key={slug} style={{ borderColor: `${module.accent}55` }}>
                    <span>{module.icon}</span>
                    <strong>{module.title[locale]}</strong>
                    <small>{copy.moduleCta} →</small>
                  </Link>
                )
              })}
            </div>
            <Link className={tier.highlighted ? 'sb-button-primary' : 'sb-button-secondary'} href={MODULES[tier.modules[0]].href}>
              {copy.moduleCta}
            </Link>
          </article>
        ))}
      </section>
    </main>
  )
}
