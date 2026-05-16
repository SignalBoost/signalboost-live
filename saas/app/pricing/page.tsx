'use client'
import Navbar from '@/components/Navbar'
import { useState } from 'react'

const CURRENCIES: Record<string, { symbol: string; label: string; rates: number[] }> = {
  USD: { symbol: '$',  label: 'USD', rates: [0,  10,  30,  90]  },
  BRL: { symbol: 'R$', label: 'BRL', rates: [0,  49,  149, 449] },
  PLN: { symbol: 'zł', label: 'PLN', rates: [0,  40,  120, 360] },
  MXN: { symbol: '$',  label: 'MXN', rates: [0,  180, 540, 1600]},
  EUR: { symbol: '€',  label: 'EUR', rates: [0,  9,   27,  82]  },
}

const PLANS = [
  {
    index: 0,
    name: 'Free',
    label: 'freemium',
    description: 'Try SignalBoost with no commitment.',
    features: [
      '1 website',
      '1 language',
      'Review collector (basic)',
      'SignalBoost watermark',
      'Community support',
    ],
    cta: 'Start free',
    highlight: false,
    partner: false,
  },
  {
    index: 1,
    name: 'Starter',
    label: 'starter',
    description: 'Perfect for small businesses getting started.',
    features: [
      '1 website',
      '2 languages',
      'Review collector',
      'Native audio (50 credits/mo)',
      'No watermark',
      'Email support',
    ],
    cta: 'Start free trial',
    highlight: false,
    partner: true,
  },
  {
    index: 2,
    name: 'Pro',
    label: 'pro',
    description: 'For growing businesses that need more reach.',
    features: [
      '5 websites',
      'All 5 languages',
      'Review collector + video',
      'Native audio (200 credits/mo)',
      'Video editor',
      'Priority support',
    ],
    cta: 'Start free trial',
    highlight: true,
    partner: true,
  },
  {
    index: 3,
    name: 'Business',
    label: 'business',
    description: 'For agencies and multi-location brands.',
    features: [
      'Unlimited websites',
      'All 5 languages + custom',
      'Full review & video suite',
      'Native audio (unlimited)',
      'Video editor + export',
      'Dedicated account manager',
      'White label option',
    ],
    cta: 'Contact us',
    highlight: false,
    partner: true,
  },
]

export default function PricingPage() {
  const [currency, setCurrency] = useState('USD')
  const cur = CURRENCIES[currency]

  return (
    <main style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', fontFamily: 'system-ui' }}>
      <Navbar />

      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '80px 32px 120px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'rgba(255,195,0,0.1)', border: '1px solid rgba(255,195,0,0.25)',
            borderRadius: 999, padding: '4px 16px', marginBottom: 24,
            fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: '#ffc300',
          }}>
            Simple pricing
          </div>
          <h1 style={{ fontSize: 'clamp(36px, 5vw, 60px)', fontWeight: 900, letterSpacing: '-0.03em', margin: '0 0 16px' }}>
            Start free. Grow naturally.
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 17, maxWidth: 500, margin: '0 auto 32px' }}>
            Free forever on the basic plan. Upgrade when you're ready. Business partners get 30 days free on any paid plan.
          </p>

          {/* Currency switcher */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Currency:</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {Object.keys(CURRENCIES).map(c => (
                <button key={c} onClick={() => setCurrency(c)}
                  style={{
                    padding: '5px 14px',
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: `1px solid ${currency === c ? '#ffc300' : 'rgba(255,255,255,0.12)'}`,
                    background: currency === c ? 'rgba(255,195,0,0.12)' : 'transparent',
                    color: currency === c ? '#ffc300' : 'rgba(255,255,255,0.45)',
                  }}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Partner badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'rgba(255,195,0,0.06)', border: '1px solid rgba(255,195,0,0.2)',
          borderRadius: 14, padding: '14px 24px', marginBottom: 32,
        }}>
          <span style={{ fontSize: 20 }}>🤝</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#ffc300' }}>SignalBoost partner benefit</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
              Registered business partners get 30 days free on any paid plan. Credit card required — cancel anytime before your trial ends.
            </div>
          </div>
        </div>

        {/* Plans grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {PLANS.map(plan => (
            <div key={plan.name} style={{
              background: plan.highlight ? 'rgba(255,195,0,0.06)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${plan.highlight ? 'rgba(255,195,0,0.4)' : 'rgba(255,255,255,0.07)'}`,
              borderRadius: 20,
              padding: '28px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
              position: 'relative',
            }}>
              {plan.highlight && (
                <div style={{
                  position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)',
                  background: '#ffc300', color: '#000', fontSize: 10, fontWeight: 800,
                  padding: '4px 14px', borderRadius: 999, letterSpacing: '0.06em',
                  textTransform: 'uppercase', whiteSpace: 'nowrap',
                }}>
                  Most popular
                </div>
              )}

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: plan.highlight ? '#ffc300' : 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
                  {plan.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  {plan.index === 0 ? (
                    <span style={{ fontSize: 42, fontWeight: 900, letterSpacing: '-0.03em' }}>Free</span>
                  ) : (
                    <>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>{cur.symbol}</span>
                      <span style={{ fontSize: 42, fontWeight: 900, letterSpacing: '-0.03em' }}>{cur.rates[plan.index]}</span>
                      <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>/mo</span>
                    </>
                  )}
                </div>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '8px 0 0', lineHeight: 1.5 }}>
                  {plan.description}
                </p>
              </div>

              <button style={{
                background: plan.highlight ? '#ffc300' : 'rgba(255,255,255,0.05)',
                color: plan.highlight ? '#000' : '#fff',
                border: `1px solid ${plan.highlight ? '#ffc300' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 999,
                padding: '11px 0',
                fontSize: 13,
                fontWeight: 800,
                cursor: 'pointer',
                width: '100%',
              }}>
                {plan.cta}
              </button>

              {plan.partner && (
                <div style={{ fontSize: 11, color: 'rgba(255,195,0,0.7)', textAlign: 'center', marginTop: -12 }}>
                  🤝 Partners: 30 days free
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {plan.features.map(f => (
                  <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>
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
          textAlign: 'center', marginTop: 56,
          padding: '40px 32px',
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 20,
        }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 10px' }}>
            Have 10+ locations or want to become a partner?
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 15, margin: '0 0 24px' }}>
            Join our partner network and get 30 days free plus dedicated onboarding support.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button style={{ background: '#ffc300', color: '#000', fontWeight: 800, fontSize: 14, padding: '12px 32px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>
              Become a partner
            </button>
            <button style={{ background: 'transparent', color: 'rgba(255,255,255,0.5)', fontWeight: 600, fontSize: 14, padding: '12px 32px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer' }}>
              Contact sales
            </button>
          </div>
        </div>

      </section>
    </main>
  )
}
