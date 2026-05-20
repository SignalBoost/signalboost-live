'use client'
import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

const CONTACT_EMAIL = 'support@signalboostapp.com'

export default function PricingPage() {
  const { dict } = useI18n()
  const [loading, setLoading] = useState<string | null>(null)

  const INDIVIDUAL_PLANS = [
    {
      name: t(dict, 'pricing.free.name', 'Free'),
      plan: 'free',
      description: t(dict, 'pricing.free.description', 'Build and preview your idea before publishing.'),
      features: [
        t(dict, 'pricing.free.f1', '1 website preview'),
        t(dict, 'pricing.free.f2', '1 language'),
        t(dict, 'pricing.free.f3', 'Limited AI credits'),
        t(dict, 'pricing.free.f4', 'Review collector (up to 3 reviews)'),
        t(dict, 'pricing.free.f5', 'SignalBoost watermark'),
        t(dict, 'pricing.free.f6', 'Community support'),
      ],
      cta: t(dict, 'pricing.free.cta', 'Start building'),
      highlight: false,
      seats: t(dict, 'pricing.seats1', '1 seat'),
      price: t(dict, 'pricing.priceFree', 'Free'),
    },

    {
      name: t(dict, 'pricing.starter.name', 'Starter'),
      plan: 'starter',
      description: t(dict, 'pricing.starter.description', 'For solo businesses ready to launch.'),
      features: [
        t(dict, 'pricing.starter.f1', 'Publish 1 website'),
        t(dict, 'pricing.starter.f2', '2 languages'),
        t(dict, 'pricing.starter.f3', 'Review collection'),
        t(dict, 'pricing.starter.f4', '~50 audio generations/month'),
        t(dict, 'pricing.starter.f5', 'Captions in 2 languages'),
        t(dict, 'pricing.starter.f6', 'No watermark'),
        t(dict, 'pricing.starter.f7', 'Email support'),
      ],
      cta: t(dict, 'pricing.starter.cta', 'Launch my business'),
      highlight: false,
      seats: t(dict, 'pricing.seats1', '1 seat'),
      price: '$15',
    },

    {
      name: t(dict, 'pricing.pro.name', 'Pro'),
      plan: 'pro',
      description: t(dict, 'pricing.pro.description', 'For growing businesses expanding reach.'),
      features: [
        t(dict, 'pricing.pro.f1', '5 websites'),
        t(dict, 'pricing.pro.f2', 'All 5 languages'),
        t(dict, 'pricing.pro.f3', 'Review suite + video'),
        t(dict, 'pricing.pro.f4', '~200 audio generations/month'),
        t(dict, 'pricing.pro.f5', 'Video creation tools'),
        t(dict, 'pricing.pro.f6', 'Priority support'),
        t(dict, 'pricing.pro.f7', 'Team collaboration'),
      ],
      cta: t(dict, 'pricing.pro.cta', 'Scale faster'),
      highlight: true,
      seats: t(dict, 'pricing.seats3', '3 seats'),
      price: '$39',
    },

    {
      name: t(dict, 'pricing.business.name', 'Business'),
      plan: 'business',
      description: t(dict, 'pricing.business.description', 'For agencies and multi-location brands.'),
      features: [
        t(dict, 'pricing.business.f1', 'Unlimited websites'),
        t(dict, 'pricing.business.f2', 'All languages + custom'),
        t(dict, 'pricing.business.f3', 'White label'),
        t(dict, 'pricing.business.f4', 'Dedicated onboarding'),
        t(dict, 'pricing.business.f5', 'Priority processing'),
        t(dict, 'pricing.business.f6', 'Advanced reporting'),
        t(dict, 'pricing.business.f7', 'API & integrations'),
      ],
      cta: t(dict, 'pricing.business.cta', 'Contact us'),
      highlight: false,
      seats: t(dict, 'pricing.seats10', '10+ seats'),
      price: '$99',
    },
  ]

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
        alert(t(dict, 'pricing.errorGeneric', 'Something went wrong.'))
      }

    } catch {
      alert(t(dict, 'pricing.errorGeneric', 'Something went wrong.'))
    } finally {
      setLoading(null)
    }
  }

  const freePriceLabel = t(dict, 'pricing.priceFree', 'Free')

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
            {t(dict, 'pricing.badge', 'Simple pricing')}
          </div>

          <h1
            style={{
              fontSize:'clamp(32px,5vw,54px)',
              fontWeight:900,
              letterSpacing:'-.04em',
              margin:'0 0 14px'
            }}
          >
            {t(dict, 'pricing.headline', 'Start free. Publish when ready.')}
          </h1>

          <p
            style={{
              maxWidth:550,
              margin:'0 auto',
              color:'var(--text-muted)',
              lineHeight:1.7
            }}
          >
            {t(dict, 'pricing.subhead', 'SignalBoost helps businesses grow with AI-powered websites, reviews, audio and content tools.')}
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
                  {t(dict, 'pricing.mostPopular', 'MOST POPULAR')}
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
                  {plan.price !== freePriceLabel && (
                    <span
                      style={{
                        fontSize:12,
                        color:'var(--text-faint)'
                      }}
                    >
                      {t(dict, 'pricing.perMonth', '/mo')}
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
                  ? t(dict, 'pricing.loading', 'Loading...')
                  : plan.cta}
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
