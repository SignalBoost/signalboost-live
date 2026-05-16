'use client'
import Navbar from '@/components/Navbar'
import { useState } from 'react'

const CURRENCIES: Record<string, { symbol: string; label: string; individual: number[]; team: number[] }> = {
  USD: { symbol: '$',  label: 'USD', individual: [0, 10, 30, 90],   team: [0, 30, 90, 0]  },
  BRL: { symbol: 'R$', label: 'BRL', individual: [0, 49, 149, 449], team: [0, 149, 449, 0] },
  PLN: { symbol: 'zł', label: 'PLN', individual: [0, 40, 120, 360], team: [0, 120, 360, 0] },
  MXN: { symbol: '$',  label: 'MXN', individual: [0, 180, 540, 1600], team: [0, 540, 1600, 0] },
  EUR: { symbol: '€',  label: 'EUR', individual: [0, 9, 27, 82],    team: [0, 27, 82, 0]  },
}

const INDIVIDUAL_PLANS = [
  {
    index: 0,
    name: 'Free',
    plan: 'free',
    description: 'Try SignalBoost with no commitment.',
    features: ['1 website', '1 language', 'Review collector (basic)', 'SignalBoost watermark', 'Community support'],
    cta: 'Start free',
    highlight: false,
    partner: false,
    seats: '1 user',
  },
  {
    index: 1,
    name: 'Starter',
    plan: 'starter',
    description: 'Perfect for small businesses getting started.',
    features: ['1 website', '2 languages', 'Review collector', 'Native audio (50 credits/mo)', 'No watermark', 'Email support'],
    cta: 'Start free trial',
    highlight: false,
    partner: true,
    seats: '1 user',
  },
  {
    index: 2,
    name: 'Pro',
    plan: 'pro',
    description: 'For growing businesses that need more reach.',
    features: ['5 websites', 'All 5 languages', 'Review collector + video', 'Native audio (200 credits/mo)', 'Video editor', 'Priority support'],
    cta: 'Start free trial',
    highlight: true,
    partner: true,
    seats: '1 user',
  },
  {
    index: 3,
    name: 'Business',
    plan: 'business',
    description: 'For agencies and multi-location brands.',
    features: ['Unlimited websites', 'All 5 languages + custom', 'Full review & video suite', 'Native audio (unlimited)', 'Video editor + export', 'Dedicated account manager', 'White label option'],
    cta: 'Contact us',
    highlight: false,
    partner: true,
    seats: '1 user',
  },
]

const TEAM_PLANS = [
  {
    index: 2,
    name: 'Pro Team',
    plan: 'pro',
    description: 'For teams that need to collaborate and scale.',
    features: ['5 websites', 'All 5 languages', 'Review collector + video', 'Native audio (200 credits/mo)', 'Video editor', 'Priority support', 'Team management'],
    cta: 'Start free trial',
    highlight: false,
    partner: true,
    seats: '3 users',
  },
  {
    index: 3,
    name: 'Business Team',
    plan: 'business',
    description: 'For agencies managing multiple brands.',
    features: ['Unlimited websites', 'All 5 languages + custom', 'Full review & video suite', 'Native audio (unlimited)', 'Video editor + export', 'Dedicated account manager', 'White label option', 'Team management'],
    cta: 'Start free trial',
    highlight: true,
    partner: true,
    seats: '10 users',
  },
  {
    index: 0,
    name: 'Enterprise',
    plan: 'enterprise',
    description: 'Custom solution for large organizations.',
    features: ['Unlimited everything', 'Custom languages', 'Custom integrations', 'SLA guarantee', 'Dedicated infrastructure', 'Custom onboarding', 'Volume discounts'],
    cta: 'Contact sales',
    highlight: false,
    partner: true,
    seats: 'Unlimited users',
  },
]

export default function PricingPage() {
  const [currency, setCurrency] = useState('USD')
  const [tab, setTab] = useState<'individual' | 'team'>('individual')
  const [loading, setLoading] = useState<string | null>(null)
  const cur = CURRENCIES[currency]
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
        body: JSON.stringify({ plan, currency }),
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
      <Navbar />
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '80px 24px 120px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'rgba(255,195,0,0.1)', border: '1px solid rgba(255,195,0,0.25)',
            borderRadius: 999, padding: '4px 16px', marginBottom: 20,
            fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: '#ffc300',
          }}>
            Simple pricing
          </div>
          <h1 style={{ fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 900, letterSpacing: '-0.03em', margin: '0 0 14px' }}>
            Plans that grow with you
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 16, maxWidth: 460, margin: '0 auto 32px' }}>
            Start free. Upgrade when you're ready. Partners get 30 days free on any paid plan.
          </p>

          {/* Individual / Team toggle */}
          <div style={{
            display: 'inline-flex', background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 999,
            padding: 4, marginBottom: 28,
          }}>
            {(['individual', 'team'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{
                  padding: '8px 24px', borderRadius: 999, fontSize: 13, fontWeight: 700,
                  border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                  background: tab === t ? '#ffc300' : 'transparent',
                  color: tab === t ? '#000' : 'rgba(255,255,255,0.5)',
                }}>
                {t === 'individual' ? 'Individual' : 'Team & Enterprise'}
              </button>
            ))}
          </div>

          {/* Currency switcher */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>Currency:</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {Object.keys(CURRENCIES).map(c => (
                <button key={c} onClick={() => setCurrency(c)}
                  style={{
                    padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                    cursor: 'pointer',
                    border: `1px solid ${currency === c ? '#ffc300' : 'rgba(255,255,255,0.1)'}`,
                    background: currency === c ? 'rgba(255,195,0,0.12)' : 'transparent',
                    color: currency === c ? '#ffc300' : 'rgba(255,255,255,0.4)',
                  }}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Partner banner */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'rgba(255,195,0,0.06)', border: '1px solid rgba(255,195,0,0.2)',
          borderRadius: 14, padding: '14px 20px', marginBottom: 28,
        }}>
          <span style={{ fontSize: 18 }}>🤝</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#ffc300' }}>SignalBoost partner benefit</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
              Business partners get 30 days free on any paid plan. Credit card required — cancel anytime before trial ends.
            </div>
          </div>
        </div>

        {/* Plans grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${plans.length}, 1fr)`,
          gap: 16,
        }}>
          {plans.map(plan => (
            <div key={plan.name} style={{
              background: plan.highlight ? 'rgba(255,195,0,0.06)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${plan.highlight ? 'rgba(255,195,0,0.4)' : 'rgba(255,255,255,0.07)'}`,
              borderRadius: 20, padding: '28px 22px',
              display: 'flex', flexDirection: 'column', gap: 18,
              position: 'relative',
            }}>
              {plan.highlight && (
                <div style={{
                  position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)',
                  background: '#ffc300', color: '#000', fontSize: 10, fontWeight: 800,
                  padding: '3px 14px', borderRadius: 999, letterSpacing: '0.06em',
                  textTransform: 'uppercase', whiteSpace: 'nowrap',
                }}>
                  Most popular
                </div>
              )}

              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: plan.highlight ? '#ffc300' : 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    {plan.name}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,195,0,0.7)', background: 'rgba(255,195,0,0.08)', border: '1px solid rgba(255,195,0,0.15)', borderRadius: 999, padding: '2px 8px' }}>
                    {plan.seats}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  {plan.index === 0 && plan.plan === 'free' ? (
                    <span style={{ fontSize: 40, fontWeight: 900, letterSpacing: '-0.03em' }}>Free</span>
                  ) : plan.plan === 'enterprise' ? (
                    <span style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.03em' }}>Custom</span>
                  ) : (
                    <>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>{cur.symbol}</span>
                      <span style={{ fontSize: 40, fontWeight: 900, letterSpacing: '-0.03em' }}>
                        {tab === 'individual' ? cur.individual[plan.index] : cur.team[plan.index]}
                      </span>
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>/mo</span>
                    </>
                  )}
                </div>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: '6px 0 0', lineHeight: 1.5 }}>
                  {plan.description}
                </p>
              </div>

              <div>
                <button
                  onClick={() => handleCheckout(plan.plan)}
                  disabled={loading === plan.plan}
                  style={{
                    background: plan.highlight ? '#ffc300' : 'rgba(255,255,255,0.05)',
                    color: plan.highlight ? '#000' : '#fff',
                    border: `1px solid ${plan.highlight ? '#ffc300' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: 999, padding: '11px 0', fontSize: 13, fontWeight: 800,
                    cursor: loading === plan.plan ? 'wait' : 'pointer',
                    width: '100%', opacity: loading === plan.plan ? 0.7 : 1,
                  }}>
                  {loading === plan.plan ? 'Loading...' : plan.cta}
                </button>
                <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 8 }}>
                  No commitment · Cancel anytime
                </div>
              </div>

              {plan.partner && (
                <div style={{ fontSize: 11, color: 'rgba(255,195,0,0.6)', textAlign: 'center', marginTop: -8 }}>
                  🤝 Partners: 30 days free
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {plan.features.map(f => (
                  <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                    <span style={{ color: '#ffc300', flexShrink: 0, marginTop: 1 }}>✓</span>
                    {f}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Enterprise banner */}
        <div style={{
          textAlign: 'center', marginTop: 48, padding: '36px 28px',
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20,
        }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 10px' }}>
            Want to become a SignalBoost partner?
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, margin: '0 0 22px' }}>
            Join our partner network and get 30 days free plus dedicated onboarding.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => window.location.href = 'mailto:cadomos@gmail.com?subject=SignalBoost Partner Application'}
              style={{ background: '#ffc300', color: '#000', fontWeight: 800, fontSize: 13, padding: '11px 28px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>
              Become a partner
            </button>
            <button
              onClick={() => window.location.href = 'mailto:cadomos@gmail.com?subject=SignalBoost Sales Inquiry'}
              style={{ background: 'transparent', color: 'rgba(255,255,255,0.5)', fontWeight: 600, fontSize: 13, padding: '11px 28px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer' }}>
              Contact sales
            </button>
          </div>
        </div>

      </section>
    </main>
  )
}
