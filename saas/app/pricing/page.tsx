'use client'

import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

const CONTACT_EMAIL = 'support@signalboostapp.com'

export default function PricingPage() {
  const { dict } = useI18n()
  const [loading, setLoading] = useState<string | null>(null)

  const plans = [
    { name: t(dict, 'pricing_page.free.name', 'Free'), plan: 'free', price: t(dict, 'pricing_page.priceFree', 'Free'), seats: '1 seat', description: 'Preview the workspace and build your first idea.', cta: 'Start building', highlight: false, features: ['1 website preview', '1 language', 'Limited AI credits', 'Community support'] },
    { name: t(dict, 'pricing_page.starter.name', 'Starter'), plan: 'starter', price: '$19', seats: '1 seat', description: 'For solo businesses ready to publish and promote.', cta: 'Launch my business', highlight: false, features: ['Publish 1 website', '2 languages', 'Review collection', '10 AI video credits/month'] },
    { name: t(dict, 'pricing_page.pro.name', 'Pro'), plan: 'pro', price: '$49', seats: '3 seats', description: 'For growing teams that need more campaigns and channels.', cta: 'Scale faster', highlight: true, features: ['5 websites', 'All core languages', 'Review suite + video', 'Team collaboration'] },
    { name: t(dict, 'pricing_page.business.name', 'Business'), plan: 'business', price: '$149', seats: '10+ seats', description: 'For agencies and multi-location brands.', cta: 'Get Business', highlight: false, features: ['Unlimited websites', 'White label', 'Dedicated onboarding', 'API & integrations'] },
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
    <main className="sb-page-shell sb-section">
      <section style={{ textAlign: 'center', marginBottom: 32 }}>
        <span className="sb-eyebrow">Docs-clear pricing</span>
        <h1 className="sb-h1" style={{ marginTop: 12 }}>Start free. Publish when ready.</h1>
        <p className="sb-body" style={{ maxWidth: 680, margin: '18px auto 0' }}>Simple plan tiers arranged by human intent: test, launch, scale, or operate a larger growth system.</p>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        {plans.map(plan => (
          <article key={plan.plan} className="sb-card" style={{ padding: 24, borderColor: plan.highlight ? 'rgba(255,195,0,.42)' : undefined }}>
            {plan.highlight && <span className="sb-eyebrow">Most popular</span>}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', marginTop: plan.highlight ? 12 : 0 }}>
              <h2 className="sb-h3">{plan.name}</h2>
              <span className="sb-caption">{plan.seats}</span>
            </div>
            <div style={{ fontSize: 44, fontWeight: 950, marginTop: 16 }}>{plan.price}<span className="sb-caption">{plan.price.startsWith('$') ? '/mo' : ''}</span></div>
            <p className="sb-body" style={{ fontSize: 14 }}>{plan.description}</p>
            <button className={plan.highlight ? 'sb-button-primary' : 'sb-button-secondary'} style={{ width: '100%', border: plan.highlight ? 'none' : undefined, cursor: 'pointer' }} onClick={() => handleCheckout(plan.plan)} disabled={loading === plan.plan}>
              {loading === plan.plan ? 'Loading…' : plan.cta}
            </button>
            <ul style={{ listStyle: 'none', padding: 0, margin: '20px 0 0', display: 'grid', gap: 10 }}>
              {plan.features.map(feature => <li key={feature} className="sb-caption">✦ {feature}</li>)}
            </ul>
          </article>
        ))}
      </section>
    </main>
  )
}
