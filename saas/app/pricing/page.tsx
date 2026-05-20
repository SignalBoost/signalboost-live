'use client'
import { useState } from 'react'

const CONTACT_EMAIL = 'support@signalboostapp.com'

const INDIVIDUAL_PLANS = [
  {
    name: 'Free',
    plan: 'free',
    description: 'Build and preview your idea before publishing.',
    features: [
      '1 website preview',
      '1 language',
      'Create audio previews',
      'Review collector (up to 3 reviews)',
      'SignalBoost watermark',
      'Community support',
    ],
    cta: 'Start building',
    highlight: false,
    seats: '1 seat',
    price: 'Free',
  },

  {
    name: 'Starter',
    plan: 'starter',
    description: 'For solo businesses ready to launch.',
    features: [
      'Publish 1 website',
      '2 languages',
      'Review collection',
      '~50 audio generations/month',
      'Captions in 2 languages',
      'No watermark',
      'Email support',
    ],
    cta: 'Launch my business',
    highlight: false,
    seats: '1 seat',
    price: '$15',
  },

  {
    name: 'Pro',
    plan: 'pro',
    description: 'For growing businesses expanding reach.',
    features: [
      '5 websites',
      'All 5 languages',
      'Review suite + video',
      '~200 audio generations/month',
      'Video creation tools',
      'Priority support',
      'Team collaboration',
    ],
    cta: 'Scale faster',
    highlight: true,
    seats: '3 seats',
    price: '$39',
  },

  {
    name: 'Business',
    plan: 'business',
    description: 'For agencies and multi-location brands.',
    features: [
      'Unlimited websites',
      'All languages + custom',
      'White label',
      'Dedicated onboarding',
      'Priority processing',
      'Advanced reporting',
      'API & integrations',
    ],
    cta: 'Contact us',
    highlight: false,
    seats: '10+ seats',
    price: '$99',
  },
]

export default function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null)

  async function handleCheckout(plan: string) {
    if (plan === 'free') {
      window.location.href = '/dashboard'
      return
    }

    if (plan === 'business') {
      window.location.href =
        `mailto:${CONTACT_EMAIL}?subject=SignalBoost Business Inquiry`
      return
    }

    try {
      setLoading(plan)

      const { createClient } =
        await import('@supabase/supabase-js')

      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )

      const {
        data: { session },
      } = await supabase.auth.getSession()

      const token = session?.access_token || ''

      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan }),
      })

      const data = await res.json()

      if (data.url) {
        window.location.href = data.url
      } else {
        alert('Something went wrong.')
      }

    } catch {
      alert('Something went wrong.')
    } finally {
      setLoading(null)
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--bg-base)',
        color: 'var(--text-primary)',
        fontFamily: 'system-ui',
      }}
    >
      <section
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          padding: '28px 24px 80px',
        }}
      >
        <div
          style={{
            textAlign: 'center',
            marginBottom: 40,
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              padding: '6px 14px',
              borderRadius: 999,
              marginBottom: 16,
              background: 'rgba(255,195,0,.08)',
              border: '1px solid rgba(255,195,0,.2)',
              color: '#ffc300',
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
            }}
          >
            Simple pricing
          </div>

          <h1
            style={{
              fontSize:'clamp(32px,5vw,54px)',
              fontWeight:900,
              letterSpacing:'-.04em',
              margin:'0 0 14px'
            }}
          >
            Start free. Publish when ready.
          </h1>

          <p
            style={{
              maxWidth:550,
              margin:'0 auto',
              color:'var(--text-muted)',
              lineHeight:1.7
            }}
          >
            SignalBoost helps businesses grow with AI-powered
            websites, reviews, audio and content tools.
          </p>
        </div>

        <div
          style={{
            display:'grid',
            gridTemplateColumns:'repeat(4,1fr)',
            gap:18
          }}
        >
          {INDIVIDUAL_PLANS.map(plan=>(
            <div
              key={plan.name}
              style={{
                background:plan.highlight
                ?'rgba(255,195,0,.05)'
                :'var(--surface-1)',

                border:`1px solid ${
                  plan.highlight
                  ?'rgba(255,195,0,.35)'
                  :'var(--border-medium)'
                }`,

                borderRadius:20,
                padding:24,
                display:'flex',
                flexDirection:'column',
                gap:18,
                position:'relative'
              }}
            >
              {plan.highlight && (
                <div
                  style={{
                    position:'absolute',
                    top:-12,
                    left:'50%',
                    transform:'translateX(-50%)',
                    background:'#ffc300',
                    color:'#000',
                    padding:'4px 12px',
                    borderRadius:999,
                    fontSize:10,
                    fontWeight:800
                  }}
                >
                  MOST POPULAR
                </div>
              )}

              <div>
                <div
                  style={{
                    display:'flex',
                    justifyContent:'space-between',
                    marginBottom:10
                  }}
                >
                  <div
                    style={{
                      fontWeight:800
                    }}
                  >
                    {plan.name}
                  </div>

                  <div
                    style={{
                      fontSize:11,
                      color:'var(--text-muted)'
                    }}
                  >
                    {plan.seats}
                  </div>
                </div>

                <div
                  style={{
                    fontSize:42,
                    fontWeight:900
                  }}
                >
                  {plan.price}
                  {plan.price !== 'Free' && (
                    <span
                      style={{
                        fontSize:12,
                        color:'var(--text-faint)'
                      }}
                    >
                      /mo
                    </span>
                  )}
                </div>

                <p
                  style={{
                    color:'var(--text-muted)',
                    fontSize:13,
                    lineHeight:1.6
                  }}
                >
                  {plan.description}
                </p>
              </div>

              <button
                onClick={()=>handleCheckout(plan.plan)}
                disabled={loading===plan.plan}
                style={{
                  width:'100%',
                  padding:'12px',
                  borderRadius:999,
                  border:'none',
                  cursor:'pointer',
                  fontWeight:800,
                  background:plan.highlight
                  ?'#ffc300'
                  :'var(--surface-3)',
                  color:plan.highlight
                  ?'#000'
                  :'#fff'
                }}
              >
                {loading===plan.plan
                  ?'Loading...'
                  :plan.cta}
              </button>

              <div
                style={{
                  display:'flex',
                  flexDirection:'column',
                  gap:10
                }}
              >
                {plan.features.map(feature=>(
                  <div
                    key={feature}
                    style={{
                      display:'flex',
                      gap:8,
                      color:'var(--text-secondary)',
                      fontSize:13
                    }}
                  >
                    <span style={{color:'#ffc300'}}>
                      ✓
                    </span>
                    {feature}
                  </div>
                ))}
              </div>

            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
