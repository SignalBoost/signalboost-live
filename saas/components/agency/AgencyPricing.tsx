'use client'

import { useI18n } from '@/components/i18n/I18nProvider'
import { agencyFallback } from '@/lib/i18n/agencyCopy'

export default function AgencyPricing() {
  const { lang } = useI18n()
  return (
    <section id="agency-pricing" className="sb-page-shell sb-section">
      <h2 className="sb-h2">{agencyFallback(lang, 'pricingTitle')}</h2>
      <p className="sb-body">{agencyFallback(lang, 'pricingSubtitle')}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 18 }}>
        <article className="sb-card" style={{ padding: 24 }}>
          <h3 className="sb-h3">{agencyFallback(lang, 'creatorPlan')}</h3>
          <p className="sb-body">{agencyFallback(lang, 'creatorPrice')}</p>
          <p className="sb-caption">{agencyFallback(lang, 'creatorFee')}</p>
        </article>
        <article className="sb-card" style={{ padding: 24 }}>
          <h3 className="sb-h3">{agencyFallback(lang, 'enterprisePlan')}</h3>
          <p className="sb-body">{agencyFallback(lang, 'enterprisePrice')}</p>
          <p className="sb-caption">{agencyFallback(lang, 'enterpriseFee')}</p>
        </article>
      </div>
    </section>
  )
}
