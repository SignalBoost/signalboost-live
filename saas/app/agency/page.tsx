'use client'

import AgencyPricing from '@/components/agency/AgencyPricing'
import PublicAgencyClient from '@/components/agency/PublicAgencyClient'
import { useI18n } from '@/components/i18n/I18nProvider'
import { getAgencyCopy } from '@/lib/i18n/agencyCopy'

export default function AgencyPage() {
  const { lang } = useI18n()
  const copy = getAgencyCopy(lang)

  return (
    <main>
      <section className="sb-page-shell sb-section" aria-label={copy.hero.eyebrow}>
        <div className="sb-glass" style={{ padding: 32, display: 'grid', gap: 18 }}>
          <span className="sb-eyebrow">{copy.hero.eyebrow}</span>
          <h1 className="sb-hero-title" style={{ margin: 0 }}>{copy.hero.title}</h1>
          <p className="sb-body" style={{ maxWidth: 820 }}>{copy.hero.body}</p>
          <div className="sb-cta-row">
            <a className="sb-button-primary" href="#agency-client">{copy.hero.primaryCta}</a>
            <a className="sb-button-secondary" href="#agency-pricing">{copy.hero.secondaryCta}</a>
          </div>
        </div>
      </section>
      <div id="agency-client"><PublicAgencyClient copy={copy.client} /></div>
      <AgencyPricing copy={copy.pricing} />
      <section className="sb-page-shell sb-section" aria-label={copy.notes.complianceTitle}>
        <div className="sb-glass" style={{ padding: 28, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18 }}>
          <article className="sb-card" style={{ padding: 22 }}>
            <h2 className="sb-h3">{copy.notes.complianceTitle}</h2>
            <p className="sb-body">{copy.notes.complianceBody}</p>
          </article>
          <article className="sb-card" style={{ padding: 22 }}>
            <h2 className="sb-h3">{copy.notes.enterpriseTitle}</h2>
            <p className="sb-body">{copy.notes.enterpriseBody}</p>
          </article>
        </div>
      </section>
    </main>
  )
}
