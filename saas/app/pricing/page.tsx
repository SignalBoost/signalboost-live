'use client'
import { useState } from 'react'

const INDIVIDUAL_PLANS = [
  {
    index: 0, name: 'Free', plan: 'free',
    description: 'Try SignalBoost with no commitment.',
    features: ['1 website', '1 language', 'Review collector (basic)', 'SignalBoost watermark', 'Community support'],
    cta: 'Start free', highlight: false, partner: false, seats: '1 user', price: 'Free',
  },
  {
    index: 1, name: 'Starter', plan: 'starter',
    description: 'Perfect for small businesses getting started.',
    features: ['1 website', '2 languages', 'Review collector', 'Native audio (50 credits/mo)', 'Captions (2 languages)', 'No watermark', 'Email support'],
    cta: 'Start free trial', highlight: false, partner: true, seats: '1 user', price: '$10',
  },
  {
    index: 2, name: 'Pro', plan: 'pro',
    description: 'For growing businesses that need more reach.',
    features: ['5 websites', 'All 5 languages', 'Review collector + video', 'Native audio (200 credits/mo)', 'Captions in all 5 languages', 'Video editor', 'Priority support'],
    cta: 'Start free trial', highlight: true, partner: true, seats: '1 user', price: '$30',
  },
  {
    index: 3, name: 'Business', plan: 'business',
    description: 'For agencies and multi-location brands.',
    features: ['Unlimited websites', 'All 5 languages + custom', 'Full review & video suite', 'Native audio (unlimited)', 'Custom caption formats (SRT, VTT)', 'Video editor + export', 'Dedicated account manager', 'White label option'],
    cta: 'Contact us', highlight: false, partner: true, seats: '1 user', price: '$90',
  },
]

const TEAM_PLANS = [
  {
    index: 2, name: 'Pro Team', plan: 'pro',
    description: 'For teams that need to collaborate and scale.',
    features: ['5 websites', 'All 5 languages', 'Review collector + video', 'Native audio (200 credits/mo)', 'Captions in all 5 languages', 'Video editor', 'Priority support', 'Team management'],
    cta: 'Start free trial', highlight: false, partner: true, seats: '3 users', price: '$30',
  },
  {
    index: 3, name: 'Business Team', plan: 'business',
    description: 'For agencies managing multiple brands.',
    features: ['Unlimited websites', 'All 5 languages + custom', 'Full review & video suite', 'Native audio (unlimited)', 'Custom caption formats (SRT, VTT)', 'Video editor + export', 'Dedicated account manager', 'White label option', 'Team management'],
    cta: 'Start free trial', highlight: true, partner: true, seats: '10 users', price: '$90',
  },
  {
    index: 0, name: 'Enterprise', plan: 'enterprise',
    description: 'Custom solution for large organizations.',
    features: ['Unlimited everything', 'Custom languages', 'Custom integrations', 'SLA guarantee', 'Dedicated infrastructure', 'Custom onboarding', 'Volume discounts'],
    cta: 'Contact sales', highlight: false, partner: true, seats: 'Unlimited users', price: 'Custom',
  },
]

export default function PricingPage() {
  const [tab, setTab] = useState<'individual' | 'team'>('individual')
  const [loading, setLoading] = useState<string | null>(null)
  const plans = tab === 'individual' ? INDIVIDUAL_PLANS : TEAM_PLANS

  async function handleCheckout(plan: string) {
    if (plan === 'free') { window.location.href = '/dashboard'; return }
    if (plan === 'business' || plan === 'enterprise') {
      window.location.href = 'mailto:cadomos@gmail.com?subject=SignalBoost Plan Inquiry'
      return
    }
    try {
      setLoading(plan)
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else alert('Something went wrong. Please try again.')
    } catch {
      alert('Something went wrong. Please try again.')
    } finally {
      setLoading(null)
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', fontFamily: 'system-ui' }}>
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px 80px' }}>

        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,195,0,0.1)', border: '1px solid rgba(255,195,0,0.25)', borderRadius: 999, padding: '4px 16px', marginBottom: 14, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#ffc300' }}>
            Simple pricing
          </div>
          <h1 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 900, letterSpacing: '-0.03em', margin: '0 0 10px' }}>
            Plans that grow with you
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 15, maxWidth: 460, margin: '0 auto 8px' }}>
            Start free. Upgrade when you are ready. Partners get 30 days free on the Starter plan.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13, margin: '0 auto 20px' }}>
            Prices shown in USD. You can pay in your local currency at checkout.
          </p>

          <div style={{ display: 'inline-flex', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 999, padding: 4, marginBottom: 16 }}>
            {(['individual', 'team'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{ padding: '7px 20px', borderRadius: 999, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'all 0.2s', background: tab === t ? '#ffc300' : 'transparent', color: tab === t ? '#000' : 'rgba(255,255,255,0.5)' }}>
                {t === 'individual' ? 'Individual' : 'Team & Enterprise'}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,195,0,0.06)', border: '1px solid rgba(255,195,0,0.2)', borderRadius: 14, padding: '12px 20px', marginBottom: 20 }}>
          <span style={{ fontSize: 18 }}>🤝</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#ffc300' }}>SignalBoost partner benefit</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
              Business partners get 30 days free on the Starter plan. Credit card required — cancel anytime before trial ends.
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${plans.length}, 1fr)`, gap: 16 }}>
          {plans.map(plan => (
            <div key={plan.name} style={{ background: plan.highlight ? 'rgba(255,195,0,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${plan.highlight ? 'rgba(255,195,0,0.4)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 20, padding: '28px 22px', display: 'flex', flexDirection: 'column', gap: 18, position: 'relative' }}>
              {plan.highlight && (
                <div style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', background: '#ffc300', color: '#000', fontSize: 10, fontWeight: 800, padding: '3px 14px', borderRadius: 999, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                  Most popular
                </div>
              )}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: plan.highlight ? '#ffc300' : 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{plan.name}</div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,195,0,0.7)', background: 'rgba(255,195,0,0.08)', border: '1px solid rgba(255,195,0,0.15)', borderRadius: 999, padding: '2px 8px' }}>{plan.seats}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 40, fontWeight: 900, letterSpacing: '-0.03em' }}>{plan.price}</span>
                  {plan.price !== 'Free' && plan.price !== 'Custom' && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>/mo</span>}
                </div>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: '6px 0 0', lineHeight: 1.5 }}>{plan.description}</p>
              </div>
              <div>
                <button onClick={() => handleCheckout(plan.plan)} disabled={loading === plan.plan}
                  style={{ background: plan.highlight ? '#ffc300' : 'rgba(255,255,255,0.05)', color: plan.highlight ? '#000' : '#fff', border: `1px solid ${plan.highlight ? '#ffc300' : 'rgba(255,255,255,0.1)'}`, borderRadius: 999, padding: '11px 0', fontSize: 13, fontWeight: 800, cursor: loading === plan.plan ? 'wait' : 'pointer', width: '100%', opacity: loading === plan.plan ? 0.7 : 1 }}>
                  {loading === plan.plan ? 'Loading...' : plan.cta}
                </button>
                <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 8 }}>No commitment · Cancel anytime</div>
              </div>
              {plan.plan === 'starter' && (
                <div style={{ fontSize: 11, color: 'rgba(255,195,0,0.6)', textAlign: 'center', marginTop: -8 }}>🤝 Partners: 30 days free on this plan</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {plan.features.map(f => (
                  <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                    <span style={{ color: '#ffc300', flexShrink: 0, marginTop: 1 }}>✓</span>{f}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: 32, padding: '32px 28px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 10px' }}>Want to become a SignalBoost partner?</h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, margin: '0 0 20px' }}>Join our partner network and get 30 days free plus dedicated onboarding.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => window.location.href = 'mailto:cadomos@gmail.com?subject=SignalBoost Partner Application'}
              style={{ background: '#ffc300', color: '#000', fontWeight: 800, fontSize: 13, padding: '11px 28px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>
              Become a partner
            </button>
            <button onClick={() => window.location.href = 'mailto:cadomos@gmail.com?subject=SignalBoost Sales Inquiry'}
              style={{ background: 'transparent', color: 'rgba(255,255,255,0.5)', fontWeight: 600, fontSize: 13, padding: '11px 28px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer' }}>
              Contact sales
            </button>
          </div>
        </div>

      </section>
    </main>
  )
}
