'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

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

  const moduleTiers = [
    { key: 'promote', icon: '📣', href: '/dashboard/promote', price: t(dict, 'pricing_page.included', 'Included'), name: t(dict, 'wireframes.modules.promote.title', 'Promote Business'), description: t(dict, 'wireframes.modules.promote.description', 'Build launches with multilingual campaign blocks, live telemetry, and AI concierge next steps.') },
    { key: 'reviews', icon: '⭐', href: '/dashboard/reviews', price: t(dict, 'pricing_page.included', 'Included'), name: t(dict, 'wireframes.modules.reviews.title', 'Reviews'), description: t(dict, 'wireframes.modules.reviews.description', 'Capture localized reviews, monitor sentiment, and route moderation work without leaving the console.') },
    { key: 'calendar', icon: '📅', href: '/dashboard/calendar', price: '$9', name: t(dict, 'wireframes.modules.calendar.title', 'Calendar'), description: t(dict, 'wireframes.modules.calendar.description', 'Plan monthly operations with event creation overlays and mission-style reminder timelines.') },
    { key: 'spreadsheets', icon: '▦', href: '/dashboard/spreadsheets', price: '$12', name: t(dict, 'wireframes.modules.spreadsheets.title', 'Spreadsheets'), description: t(dict, 'wireframes.modules.spreadsheets.description', 'Coordinate shared utility tables with permissions, comments, and real-time activity signals.') },
    { key: 'outreach', icon: '📡', href: '/dashboard/outreach', price: '$19', name: t(dict, 'wireframes.modules.outreach.title', 'Outreach'), description: t(dict, 'wireframes.modules.outreach.description', 'Launch email, social, and partner pushes while the concierge recommends the next channel.') },
    { key: 'assistant', icon: '🛰️', href: '/dashboard/assistant', price: '$15', name: t(dict, 'wireframes.modules.assistant.title', 'Personal Assistant'), description: t(dict, 'wireframes.modules.assistant.description', 'Turn work into prioritized tasks, reminders, and productivity telemetry for the day.') },
  ]

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
    <main className="sb-page-shell sb-section sb-pricing-cockpit">
      <section style={{ textAlign: 'center', marginBottom: 32 }}>
        <span className="sb-eyebrow">{t(dict, 'pricing_page.kicker', 'Docs-clear pricing')}</span>
        <h1 className="sb-h1" style={{ marginTop: 12 }}>{t(dict, 'pricing_page.title', 'Start free. Publish when ready.')}</h1>
        <p className="sb-body" style={{ maxWidth: 680, margin: '18px auto 0' }}>{t(dict, 'pricing_page.subtitle', 'Simple plan tiers arranged by human intent: test, launch, scale, or operate a larger growth system.')}</p>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        {plans.map(plan => (
          <article key={plan.plan} className="sb-card sb-pricing-panel" style={{ padding: 24, borderColor: plan.highlight ? 'rgba(255,195,0,.42)' : undefined }}>
            {plan.highlight && <span className="sb-eyebrow">{t(dict, 'pricing_page.mostPopular', 'Most popular')}</span>}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', marginTop: plan.highlight ? 12 : 0 }}>
              <h2 className="sb-h3">{plan.name}</h2>
              <span className="sb-caption">{plan.seats}</span>
            </div>
            <div style={{ fontSize: 44, fontWeight: 950, marginTop: 16 }}>{plan.price}<span className="sb-caption">{plan.price.startsWith('$') ? t(dict, 'pricing_page.perMonthShort', '/mo') : ''}</span></div>
            <p className="sb-body" style={{ fontSize: 14 }}>{plan.description}</p>
            <button className={plan.highlight ? 'sb-button-primary' : 'sb-button-secondary'} style={{ width: '100%', border: plan.highlight ? 'none' : undefined, cursor: 'pointer' }} onClick={() => handleCheckout(plan.plan)} disabled={loading === plan.plan}>
              {loading === plan.plan ? t(dict, 'common.loading', 'Loading…') : plan.cta}
            </button>
            <ul style={{ listStyle: 'none', padding: 0, margin: '20px 0 0', display: 'grid', gap: 10 }}>
              {plan.features.map(feature => <li key={feature} className="sb-caption">✦ {feature}</li>)}
            </ul>
          </article>
        ))}
      </section>

      <section style={{ marginTop: 34 }} id="saas-modules">
        <span className="sb-eyebrow">{t(dict, 'pricing_page.servicePricingKicker', 'SaaS module pricing')}</span>
        <h2 className="sb-h2" style={{ marginTop: 10 }}>{t(dict, 'pricing_page.servicePricingTitle', 'Every cockpit panel opens a live SaaS dashboard.')}</h2>
        <div className="sb-pricing-module-grid">
          {moduleTiers.map((tier) => (
            <article key={tier.key} className="sb-card sb-pricing-panel" style={{ padding: 20 }}>
              <div className="sb-pricing-panel__icon">{tier.icon}</div>
              <h3 className="sb-h3">{tier.name}</h3>
              <div style={{ fontSize: 32, fontWeight: 950 }}>{tier.price}<span className="sb-caption">{tier.price.startsWith('$') ? t(dict, 'pricing_page.perMonthShort', '/mo') : ''}</span></div>
              <p className="sb-body" style={{ fontSize: 13 }}>{tier.description}</p>
              <Link className="sb-button-secondary" href={tier.href}>{t(dict, 'wireframes.openDashboard', 'Open dashboard')}</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="sb-pricing-wireframe-cta" aria-labelledby="pricing-wireframe-cta-title">
        <div>
          <span className="sb-eyebrow">{t(dict, 'wireframes.kicker', 'NASA-style SaaS HMI wireframes')}</span>
          <h2 id="pricing-wireframe-cta-title" className="sb-h2">{t(dict, 'wireframes.pricing.title', 'Tiered SaaS cockpit panels')}</h2>
          <p className="sb-body">{t(dict, 'wireframes.pricing.description', 'Pricing cards use the same console styling and route CTAs directly into each SaaS dashboard module.')}</p>
        </div>
        <Link className="sb-button-primary" href="/dashboard/wireframes">{t(dict, 'wireframes.viewPricing', 'View cockpit pricing')}</Link>
      </section>
    </main>
  )
}
