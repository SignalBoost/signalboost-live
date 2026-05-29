'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

type Plan = {
  id: string
  name: string
  description: string
  price: string
  cadence: string
  seats: string
  features: string[]
  cta: string
  highlight?: boolean
}

export default function PricingPage() {
  const { dict } = useI18n()
  const [loading, setLoading] = useState<string | null>(null)

  const plans: Plan[] = [
    {
      id: 'free',
      name: t(dict, 'pricing_page.free.name', 'Free'),
      description: t(dict, 'pricing_page.free.description', 'Build and preview your idea before publishing.'),
      price: t(dict, 'pricing_page.priceFree', 'Free'),
      cadence: t(dict, 'pricing_page.cadence', '/ month'),
      seats: t(dict, 'pricing_page.seats1', '1 seat'),
      cta: t(dict, 'pricing_page.free.cta', 'Start building'),
      features: [
        t(dict, 'pricing_page.free.f1', '1 website preview'),
        t(dict, 'pricing_page.free.f2', '1 language'),
        t(dict, 'pricing_page.free.f3', 'Limited AI credits'),
        t(dict, 'pricing_page.free.f4', 'Review collector up to 3 reviews'),
        t(dict, 'pricing_page.free.video', '2 AI video credits for testing'),
        t(dict, 'pricing_page.free.f6', 'Community support'),
      ],
    },
    {
      id: 'starter',
      name: t(dict, 'pricing_page.starter.name', 'Starter'),
      description: t(dict, 'pricing_page.starter.description', 'For solo businesses ready to launch.'),
      price: '$19',
      cadence: t(dict, 'pricing_page.cadence', '/ month'),
      seats: t(dict, 'pricing_page.seats1', '1 seat'),
      cta: t(dict, 'pricing_page.starter.cta', 'Launch my business'),
      features: [
        t(dict, 'pricing_page.starter.f1', 'Publish 1 website'),
        t(dict, 'pricing_page.starter.f2', '2 languages'),
        t(dict, 'pricing_page.starter.f3', 'Review collection'),
        t(dict, 'pricing_page.starter.f4', '~40 audio generations/month'),
        t(dict, 'pricing_page.starter.video', '10 AI video credits/month'),
        t(dict, 'pricing_page.starter.f7', 'Email support'),
      ],
    },
    {
      id: 'pro',
      name: t(dict, 'pricing_page.pro.name', 'Pro'),
      description: t(dict, 'pricing_page.pro.description', 'For growing businesses expanding reach.'),
      price: '$49',
      cadence: t(dict, 'pricing_page.cadence', '/ month'),
      seats: t(dict, 'pricing_page.seats3', '3 seats'),
      cta: t(dict, 'pricing_page.pro.cta', 'Scale faster'),
      highlight: true,
      features: [
        t(dict, 'pricing_page.pro.f1', '5 websites'),
        t(dict, 'pricing_page.pro.f2', 'All 5 languages'),
        t(dict, 'pricing_page.pro.f3', 'Review suite + video'),
        t(dict, 'pricing_page.pro.f4', '~150 audio generations/month'),
        t(dict, 'pricing_page.pro.video', '40 AI video credits/month'),
        t(dict, 'pricing_page.pro.f7', 'Team collaboration'),
      ],
    },
    {
      id: 'business',
      name: t(dict, 'pricing_page.business.name', 'Business'),
      description: t(dict, 'pricing_page.business.description', 'For agencies and multi-location brands.'),
      price: '$149',
      cadence: t(dict, 'pricing_page.cadence', '/ month'),
      seats: t(dict, 'pricing_page.seats10', '10+ seats'),
      cta: t(dict, 'pricing_page.business.cta', 'Get Business'),
      features: [
        t(dict, 'pricing_page.business.f1', 'Unlimited websites'),
        t(dict, 'pricing_page.business.f2', 'All languages + custom'),
        t(dict, 'pricing_page.business.f3', 'White label'),
        t(dict, 'pricing_page.business.f4', 'Dedicated onboarding'),
        t(dict, 'pricing_page.business.video', '120 AI video credits/month'),
        t(dict, 'pricing_page.business.f7', 'API & integrations'),
      ],
    },
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
      alert(t(dict, 'pricing_page.errorGeneric', 'Something went wrong.'))
    } finally {
      setLoading(null)
    }
  }

  return (
    <main className="sb-page">
      <section className="sb-glass sb-grid-2" style={{ padding: 32, alignItems: 'center' }}>
        <div className="sb-stack">
          <p className="sb-eyebrow">{t(dict, 'pricing_page.hero.eyebrow', 'Pricing')}</p>
          <h1 className="sb-h1">{t(dict, 'pricing_page.hero.title', 'Choose the room you need to grow.')}</h1>
          <p className="sb-body">{t(dict, 'pricing_page.hero.body', 'Simple plans organized by launch stage. Every plan keeps the same guided workspace, preview flow, and consistent approval path.')}</p>
        </div>
        <aside className="sb-stack">
          <div className="sb-ai-prompt">{t(dict, 'pricing_page.aiSuggestion', '“If you are unsure, start Free. Upgrade when you need publishing, more languages, or more campaign volume.”')}</div>
          <div className="sb-tone-selector" aria-label={t(dict, 'pricing_page.toneLabel', 'Tone presets')}><span>Friendly</span><span>Professional</span><span>Playful</span></div>
        </aside>
      </section>

      <section className="sb-grid-4 sb-section" aria-label={t(dict, 'pricing_page.planGrid', 'Plan comparison')}>
        {plans.map(plan => (
          <article key={plan.id} className="sb-glass-soft sb-stack" style={{ padding: 24, borderColor: plan.highlight ? 'rgba(255,195,0,0.42)' : undefined }}>
            <div className="sb-row" style={{ justifyContent: 'space-between' }}>
              <h2 className="sb-h3">{plan.name}</h2>
              {plan.highlight && <span className="sb-chip" style={{ color: 'var(--accent-yellow)' }}>{t(dict, 'pricing_page.recommended', 'Recommended')}</span>}
            </div>
            <p className="sb-body" style={{ fontSize: 14 }}>{plan.description}</p>
            <p className="sb-h2">{plan.price !== t(dict, 'pricing_page.priceFree', 'Free') ? plan.price : plan.price}<span className="sb-caption"> {plan.price === t(dict, 'pricing_page.priceFree', 'Free') ? '' : plan.cadence}</span></p>
            <span className="sb-chip">{plan.seats}</span>
            <ul className="sb-stack" style={{ paddingLeft: 18, margin: 0, gap: 10 }}>
              {plan.features.map(feature => <li className="sb-body" style={{ fontSize: 14 }} key={feature}>{feature}</li>)}
            </ul>
            <button onClick={() => handleCheckout(plan.id)} disabled={loading === plan.id} className={`sb-button ${plan.highlight ? 'sb-button-primary' : 'sb-button-secondary'}`}>
              {loading === plan.id ? t(dict, 'pricing_page.loading', 'Opening checkout…') : plan.cta}
            </button>
          </article>
        ))}
      </section>

      <section className="sb-section sb-grid-2">
        <div className="sb-glass-soft sb-stack" style={{ padding: 24 }}>
          <p className="sb-eyebrow">{t(dict, 'pricing_page.compare.eyebrow', 'Easy scan')}</p>
          <h2 className="sb-h2">{t(dict, 'pricing_page.compare.title', 'What changes as you upgrade?')}</h2>
          <p className="sb-body">{t(dict, 'pricing_page.compare.body', 'More published assets, languages, automation volume, team seats, support priority, and reporting depth.')}</p>
        </div>
        <div className="sb-glass-soft sb-stack" style={{ padding: 24 }}>
          <p className="sb-eyebrow">{t(dict, 'pricing_page.help.eyebrow', 'Need help?')}</p>
          <h2 className="sb-h2">{t(dict, 'pricing_page.help.title', 'Let the AI recommend a plan.')}</h2>
          <p className="sb-body">{t(dict, 'pricing_page.help.body', 'Tell SignalBoost what you are launching and it will suggest the lowest plan that fits your workflow.')}</p>
          <div className="sb-row">
            <Link className="sb-button sb-button-primary" href="/dashboard">{t(dict, 'pricing_page.help.dashboard', 'Open dashboard')}</Link>
            <Link className="sb-button sb-button-ghost" href="/docs">{t(dict, 'pricing_page.help.docs', 'Read docs')}</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
