'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import { SERVICES } from '@/lib/services/catalog'

const CONTACT_EMAIL = 'support@signalboostapp.com'

export default function PricingPage() {
  const { dict } = useI18n()
  const [loading, setLoading] = useState<string | null>(null)

  const plans = [
    { name: t(dict, 'pricing_page.free.name', 'Free'), plan: 'free', price: t(dict, 'pricing_page.priceFree', 'Free'), seats: t(dict, 'pricing_page.free.seats', '1 seat'), description: t(dict, 'pricing_page.free.description', 'Preview the workspace and build your first idea.'), cta: t(dict, 'pricing_page.free.cta', 'Start building'), highlight: false, features: [1,2,3,4].map((i) => t(dict, `pricing_page.free.feature${i}`, ['1 website preview', '1 language', 'Limited AI credits', 'Community support'][i - 1])) },
    { name: t(dict, 'pricing_page.starter.name', 'Starter'), plan: 'starter', price: '$19', seats: t(dict, 'pricing_page.starter.seats', '1 seat'), description: t(dict, 'pricing_page.starter.description', 'For solo businesses ready to publish and promote.'), cta: t(dict, 'pricing_page.starter.cta', 'Launch my business'), highlight: false, features: [1,2,3,4].map((i) => t(dict, `pricing_page.starter.feature${i}`, ['Publish 1 website', '2 languages', 'Review collection', '10 AI video credits/month'][i - 1])) },
    { name: t(dict, 'pricing_page.pro.name', 'Pro'), plan: 'pro', price: '$49', seats: t(dict, 'pricing_page.pro.seats', '3 seats'), description: t(dict, 'pricing_page.pro.description', 'For growing teams that need more campaigns and channels.'), cta: t(dict, 'pricing_page.pro.cta', 'Scale faster'), highlight: true, features: [1,2,3,4].map((i) => t(dict, `pricing_page.pro.feature${i}`, ['5 websites', 'All core languages', 'Review suite + video', 'Team collaboration'][i - 1])) },
    { name: t(dict, 'pricing_page.business.name', 'Business'), plan: 'business', price: '$149', seats: t(dict, 'pricing_page.business.seats', '10+ seats'), description: t(dict, 'pricing_page.business.description', 'For agencies and multi-location brands.'), cta: t(dict, 'pricing_page.business.cta', 'Get Business'), highlight: false, features: [1,2,3,4].map((i) => t(dict, `pricing_page.business.feature${i}`, ['Unlimited websites', 'White label', 'Dedicated onboarding', 'API & integrations'][i - 1])) },
  ]

  const serviceTiers = SERVICES.map((service) => ({
    key: service.key,
    icon: service.icon,
    href: service.dashboardHref,
    name: t(dict, `services.${service.key}.title`, service.titleFallback),
    description: t(dict, `services.${service.key}.desc`, service.descFallback),
    price: service.key === 'improve' ? '$29' : service.key === 'podcastStudio' ? '$19' : t(dict, 'pricing_page.included', 'Included'),
    suffix: service.key === 'improve' || service.key === 'podcastStudio' ? t(dict, 'pricing_page.perMonth', '/month') : '',
    cta: t(dict, `services.${service.key}.cta`, service.ctaFallback),
  }))

  async function handleCheckout(plan: string) {
    if (plan === 'free') {
      window.location.href = '/dashboard'
      return
    }

    try {
      setLoading(plan)
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else alert(t(dict, 'pricing_page.errorGeneric', 'Something went wrong.'))
    } catch {
      alert(t(dict, 'pricing_page.errorNetwork', `Unable to start checkout. Please contact ${CONTACT_EMAIL}`))
    } finally {
      setLoading(null)
    }
  }

  return (
    <main className="sb-page-shell sb-section sb-pricing">
      <section className="sb-cockpit-panel" style={{ textAlign: 'center', marginBottom: 'var(--sb-space-xl)', padding: 'var(--sb-space-xl)' }}>
        <span className="sb-eyebrow">{t(dict, 'pricing_page.kicker', 'Docs-clear pricing')}</span>
        <h1 className="sb-h1" style={{ marginTop: 12 }}>{t(dict, 'pricing_page.title', 'Start free. Publish when ready.')}</h1>
        <p className="sb-body" style={{ maxWidth: 680, margin: '18px auto 0' }}>{t(dict, 'pricing_page.subtitle', 'Simple plan tiers arranged by human intent: test, launch, scale, or operate a larger growth system.')}</p>
      </section>

      <section className="sb-responsive-grid">
        {plans.map(plan => (
          <article key={plan.plan} className="sb-card sb-pricing-card" style={{ padding: 'var(--sb-space-lg)', borderColor: plan.highlight ? 'rgba(255,215,0,.52)' : undefined }}>
            {plan.highlight && <span className="sb-eyebrow">{t(dict, 'pricing_page.mostPopular', 'Most popular')}</span>}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', marginTop: plan.highlight ? 12 : 0 }}>
              <h2 className="sb-h3">{plan.name}</h2>
              <span className="sb-caption">{plan.seats}</span>
            </div>
            <div style={{ fontSize: 44, fontWeight: 700, marginTop: 'var(--sb-space-md)', fontFamily: 'var(--sb-font-heading)' }}>{plan.price}<span className="sb-caption">{plan.price.startsWith('$') ? t(dict, 'pricing_page.perMonthShort', '/mo') : ''}</span></div>
            <p className="sb-body" style={{ fontSize: 14 }}>{plan.description}</p>
            <button className={plan.highlight ? 'sb-button-primary' : 'sb-button-secondary'} style={{ width: '100%', border: plan.highlight ? 'none' : undefined, cursor: 'pointer' }} onClick={() => handleCheckout(plan.plan)} disabled={loading === plan.plan}>
              {loading === plan.plan ? t(dict, 'common.loading', 'Loading…') : plan.cta}
            </button>
            <ul style={{ listStyle: 'none', padding: 0, margin: 'var(--sb-space-lg) 0 0', display: 'grid', gap: 'var(--sb-space-sm)' }}>
              {plan.features.map(feature => <li key={feature} className="sb-caption">✦ {feature}</li>)}
            </ul>
          </article>
        ))}
      </section>

      <section style={{ marginTop: 'var(--sb-space-xl)' }}>
        <span className="sb-eyebrow">{t(dict, 'pricing_page.servicePricingKicker', 'Service pricing')}</span>
        <h2 className="sb-h2" style={{ marginTop: 10 }}>{t(dict, 'pricing_page.servicePricingTitle', 'Every service has a direct workspace CTA.')}</h2>
        <div className="sb-responsive-grid" style={{ marginTop: 'var(--sb-space-lg)' }}>
          {serviceTiers.map((tier) => (
            <article key={tier.key} className="sb-card sb-pricing-card" style={{ padding: 'var(--sb-space-lg)' }}>
              <div style={{ fontSize: 28 }}>{tier.icon}</div>
              <h3 className="sb-h3">{tier.name}</h3>
              <div style={{ fontSize: 32, fontWeight: 700, fontFamily: 'var(--sb-font-heading)' }}>{tier.price}<span className="sb-caption">{tier.suffix}</span></div>
              <p className="sb-body" style={{ fontSize: 13 }}>{tier.description}</p>
              <Link className="sb-button-secondary" href={tier.href}>{tier.cta}</Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
