'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

const plans = [
  ['free', 'Free', 'Preview your first idea', 'Free', ['1 website preview', '1 language', 'Limited AI credits', 'Community support']],
  ['starter', 'Starter', 'Launch a focused business presence', '$19', ['Publish 1 website', '2 languages', 'Review collection', 'Email support']],
  ['pro', 'Pro', 'Scale campaigns and content', '$49', ['5 websites', 'All core languages', 'Video and audio tools', 'Team collaboration']],
  ['business', 'Business', 'Multi-location and agency growth', '$149', ['Unlimited websites', 'White label', 'Priority processing', 'Advanced reporting']],
]

export default function PricingPage() {
  const { dict } = useI18n()
  const [loading, setLoading] = useState<string | null>(null)

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
      <section className="sb-glass sb-stack" style={{ padding: 32, textAlign: 'center', alignItems: 'center' }}>
        <p className="sb-eyebrow">Pricing</p>
        <h1 className="sb-h1">Choose the room you need to grow.</h1>
        <p className="sb-body">Simple plans organized by launch stage. Every plan keeps the same dark neon workspace, guided suggestions, and consistent approval flow.</p>
        <div className="sb-ai-prompt" style={{ maxWidth: 720 }}>“If you are unsure, start Free. Upgrade when you need publishing, more languages, or more campaign volume.”</div>
      </section>

      <section className="sb-grid-4 sb-section">
        {plans.map(([id, name, description, price, features]) => {
          const highlighted = id === 'pro'
          return (
            <article key={id as string} className="sb-glass-soft sb-stack" style={{ padding: 24, borderColor: highlighted ? 'rgba(255,195,0,0.42)' : undefined }}>
              {highlighted && <span className="sb-chip" style={{ color: 'var(--accent-yellow)' }}>Recommended</span>}
              <h2 className="sb-h3">{name as string}</h2>
              <p className="sb-body" style={{ fontSize: 14 }}>{description as string}</p>
              <p className="sb-h2">{price as string}<span className="sb-caption"> / month</span></p>
              <ul className="sb-stack" style={{ paddingLeft: 18, margin: 0, gap: 10 }}>
                {(features as string[]).map(feature => <li className="sb-body" style={{ fontSize: 14 }} key={feature}>{feature}</li>)}
              </ul>
              <button onClick={() => handleCheckout(id as string)} disabled={loading === id} className={`sb-button ${highlighted ? 'sb-button-primary' : 'sb-button-secondary'}`}>
                {loading === id ? 'Opening checkout…' : id === 'free' ? 'Start building' : 'Choose plan'}
              </button>
            </article>
          )
        })}
      </section>

      <section className="sb-section sb-grid-2">
        <div className="sb-glass-soft sb-stack" style={{ padding: 24 }}>
          <p className="sb-eyebrow">Easy scan</p>
          <h2 className="sb-h2">What changes as you upgrade?</h2>
          <p className="sb-body">More published assets, languages, automation volume, team seats, support priority, and reporting depth.</p>
        </div>
        <div className="sb-glass-soft sb-stack" style={{ padding: 24 }}>
          <p className="sb-eyebrow">Need help?</p>
          <p className="sb-body">Tell the AI what you are trying to launch and it will suggest the lowest plan that fits.</p>
          <Link className="sb-button sb-button-ghost" href="/docs">Read docs</Link>
        </div>
      </section>
    </main>
  )
}
