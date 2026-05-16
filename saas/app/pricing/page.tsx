import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

const plans = [
  {
    name: 'Starter',
    price: 29,
    description: 'Perfect for small businesses just getting started.',
    features: [
      '1 website',
      '2 languages',
      'Review collector',
      'Native audio (50 credits/mo)',
      'Email support',
    ],
    cta: 'Get started',
    highlight: false,
  },
  {
    name: 'Pro',
    price: 79,
    description: 'For growing businesses that need more reach.',
    features: [
      '5 websites',
      'All 5 languages',
      'Review collector + video',
      'Native audio (200 credits/mo)',
      'Video editor',
      'Priority support',
    ],
    cta: 'Get started',
    highlight: true,
  },
  {
    name: 'Business',
    price: 199,
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
  },
]

export default function PricingPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', fontFamily: 'var(--font-geist-sans, system-ui)' }}>
      <Navbar />

      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '80px 32px 120px' }}>

        <div style={{ textAlign: 'center', marginBottom: 64 }}>
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
            Pay for what you need
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 17, maxWidth: 480, margin: '0 auto' }}>
            All plans include a 14-day free trial. No credit card required.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {plans.map(plan => (
            <div key={plan.name} style={{
              background: plan.highlight ? 'rgba(255,195,0,0.06)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${plan.highlight ? 'rgba(255,195,0,0.4)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 20,
              padding: '36px 32px',
              display: 'flex',
              flexDirection: 'column',
              gap: 24,
              position: 'relative',
            }}>
              {plan.highlight && (
                <div style={{
                  position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)',
                  background: '#ffc300', color: '#000', fontSize: 11, fontWeight: 800,
                  padding: '4px 16px', borderRadius: 999, letterSpacing: '0.06em',
                  textTransform: 'uppercase', whiteSpace: 'nowrap',
                }}>
                  Most popular
                </div>
              )}

              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: plan.highlight ? '#ffc300' : 'rgba(255,255,255,0.5)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                  {plan.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 52, fontWeight: 900, letterSpacing: '-0.03em' }}>${plan.price}</span>
                  <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>/month</span>
                </div>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', margin: '8px 0 0', lineHeight: 1.5 }}>
                  {plan.description}
                </p>
              </div>

              <button style={{
                background: plan.highlight ? '#ffc300' : 'rgba(255,255,255,0.06)',
                color: plan.highlight ? '#000' : '#fff',
                border: `1px solid ${plan.highlight ? '#ffc300' : 'rgba(255,255,255,0.12)'}`,
                borderRadius: 999,
                padding: '12px 0',
                fontSize: 14,
                fontWeight: 800,
                cursor: 'pointer',
                width: '100%',
              }}>
                {plan.cta}
              </button>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {plan.features.map(f => (
                  <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>
                    <span style={{ color: '#ffc300', fontSize: 16, flexShrink: 0 }}>✓</span>
                    {f}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: 64, padding: 40, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20 }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 12px' }}>
            Have 10+ locations or partners?
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 15, margin: '0 0 24px' }}>
            We work directly with agencies and multi-location businesses. Let's talk.
          </p>
          <button style={{ background: '#ffc300', color: '#000', fontWeight: 800, fontSize: 14, padding: '12px 32px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>
            Contact sales
          </button>
        </div>

      </section>
    </main>
  )
}
