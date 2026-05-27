'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

const CONTACT_EMAIL = 'saassupport@signalboostapp.com'

const GOLD = '#ffc300'
const BLUE = '#3b82f6'
const PURPLE = '#a855f7'
const GREEN = '#4ade80'

const CURRENCIES = ['USD', 'BRL', 'PLN', 'MXN', 'EUR']
const SYMBOLS: Record<string, string> = {
  USD: '$',
  BRL: 'R$',
  PLN: 'zl',
  MXN: '$',
  EUR: 'EUR',
}

export default function PodcastersPage() {
  const { dict, lang } = useI18n()
  const P = (key: string) => t(dict, `podcasters_page.${key}`, '')
  const [currency, setCurrency] = useState('USD')

  const PLANS = [
    {
      name: t(dict, 'podcasters_page.plans.indie.name', ''),
      key: 'indie',
      price: { USD: 29, BRL: 149, PLN: 120, MXN: 540, EUR: 27 },
      description: t(
        dict,
        'podcasters_page.plans.indie.description',
        'Perfect for independent podcasters getting started globally.'
      ),
      features: [
        t(dict, 'podcasters_page.plans.indie.f1', ''),
        t(dict, 'podcasters_page.plans.indie.f2', ''),
        t(dict, 'podcasters_page.plans.indie.f3', ''),
        t(dict, 'podcasters_page.plans.indie.f4', ''),
        t(dict, 'podcasters_page.plans.indie.f5', ''),
        t(dict, 'podcasters_page.plans.indie.f6', ''),
        t(dict, 'podcasters_page.plans.indie.f7', ''),
        t(dict, 'podcasters_page.plans.indie.f8', ''),
      ],
      cta: t(dict, 'podcasters_page.plans.indie.cta', ''),
      highlight: false,
    },
    {
      name: t(dict, 'podcasters_page.plans.pro.name', ''),
      key: 'pro',
      price: { USD: 79, BRL: 399, PLN: 320, MXN: 1450, EUR: 74 },
      description: t(
        dict,
        'podcasters_page.plans.pro.description',
        'For serious podcasters who want global reach.'
      ),
      features: [
        t(dict, 'podcasters_page.plans.pro.f1', ''),
        t(dict, 'podcasters_page.plans.pro.f2', ''),
        t(dict, 'podcasters_page.plans.pro.f3', ''),
        t(dict, 'podcasters_page.plans.pro.f4', ''),
        t(dict, 'podcasters_page.plans.pro.f5', ''),
        t(dict, 'podcasters_page.plans.pro.f6', ''),
        t(dict, 'podcasters_page.plans.pro.f7', ''),
        t(dict, 'podcasters_page.plans.pro.f8', ''),
      ],
      cta: t(dict, 'podcasters_page.plans.pro.cta', ''),
      highlight: true,
    },
    {
      name: t(dict, 'podcasters_page.plans.network.name', ''),
      key: 'network',
      price: { USD: 299, BRL: 1490, PLN: 1200, MXN: 5400, EUR: 279 },
      description: t(
        dict,
        'podcasters_page.plans.network.description',
        'For podcast networks managing multiple shows.'
      ),
      features: [
        t(dict, 'podcasters_page.plans.network.f1', ''),
        t(dict, 'podcasters_page.plans.network.f2', ''),
        t(dict, 'podcasters_page.plans.network.f3', ''),
        t(dict, 'podcasters_page.plans.network.f4', ''),
        t(dict, 'podcasters_page.plans.network.f5', ''),
        t(dict, 'podcasters_page.plans.network.f6', ''),
        t(dict, 'podcasters_page.plans.network.f7', ''),
        t(dict, 'podcasters_page.plans.network.f8', ''),
      ],
      cta: t(dict, 'podcasters_page.plans.network.cta', ''),
      highlight: false,
    },
  ]

  const studioAgents = [
    { icon: '📝', name: P('agents.transcript'), status: P('status.active'), color: GREEN },
    { icon: '✂️', name: P('agents.clip'), status: P('status.scanning'), color: GOLD },
    { icon: '🌍', name: P('agents.translation'), status: P('status.lang5'), color: BLUE },
    { icon: '🎙️', name: P('agents.voice'), status: P('status.ready'), color: PURPLE },
    { icon: '📣', name: P('agents.distribution'), status: P('status.standby'), color: '#fb7185' },
  ]

  const productions = [
    { title: P('episodes.e34'), clips: P('episodes.e34Clips'), langs: P('episodes.e34Langs'), status: P('episodes.published') },
    { title: P('episodes.e33'), clips: P('episodes.e33Clips'), langs: P('episodes.e33Langs'), status: P('episodes.scheduled') },
    { title: P('episodes.e32'), clips: P('episodes.e32Clips'), langs: P('episodes.e32Langs'), status: P('episodes.draft') },
  ]

  const deliverables = [
    { icon: '🎙️', title: P('deliverables.voiceover.title'), desc: P('deliverables.voiceover.desc') },
    { icon: '✂️', title: P('deliverables.clips.title'), desc: P('deliverables.clips.desc') },
    { icon: '💬', title: P('deliverables.captions.title'), desc: P('deliverables.captions.desc') },
    { icon: '🌐', title: P('deliverables.website.title'), desc: P('deliverables.website.desc') },
    { icon: '📣', title: P('deliverables.distribution.title'), desc: P('deliverables.distribution.desc') },
    { icon: '⭐', title: P('deliverables.growth.title'), desc: P('deliverables.growth.desc') },
  ]

  return (
    <main
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at 15% 10%, rgba(168,85,247,.18), transparent 28%), radial-gradient(circle at 85% 0%, rgba(59,130,246,.16), transparent 28%), linear-gradient(180deg, #07070d 0%, #0b0b14 45%, #08080d 100%)',
        color: '#fff',
        fontFamily: 'system-ui',
        overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes wave {
          0%,100% { height: 18%; opacity: .45; }
          50% { height: 100%; opacity: 1; }
        }

        @keyframes pulseGlow {
          0%,100% { opacity: .45; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.04); }
        }

        @keyframes floatPanel {
          0%,100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }

        @media (max-width: 900px) {
          .studio-hero {
            grid-template-columns: 1fr !important;
          }
          .pricing-grid,
          .deliver-grid,
          .how-grid {
            grid-template-columns: 1fr !important;
          }
          .studio-card {
            min-height: auto !important;
          }
        }
      `}</style>

      <section
        className="studio-hero"
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          padding: '72px 24px 44px',
          display: 'grid',
          gridTemplateColumns: '1fr 1.05fr',
          gap: 34,
          alignItems: 'center',
        }}
      >
        <div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(255,195,0,0.1)',
              border: '1px solid rgba(255,195,0,0.28)',
              borderRadius: 999,
              padding: '6px 14px',
              marginBottom: 22,
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: '.1em',
              color: GOLD,
              textTransform: 'uppercase',
            }}
          >
            <span style={{ color: '#ef4444' }}>●</span>
            {P('hero.liveBadge')}
          </div>

          <h1
            style={{
              fontSize: 'clamp(42px, 7vw, 84px)',
              lineHeight: .96,
              letterSpacing: '-.06em',
              margin: 0,
              fontWeight: 950,
            }}
          >
            {P('hero.line1')}
            <br />
            {P('hero.line2')}
            <br />
            <span style={{ color: GOLD }}>{P('hero.line3')}</span>
          </h1>

          <p
            style={{
              marginTop: 22,
              color: 'rgba(255,255,255,.58)',
              fontSize: 18,
              lineHeight: 1.7,
              maxWidth: 620,
            }}
          >
            {P('hero.subtitle')}
          </p>

          <div
            style={{
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
              marginTop: 30,
            }}
          >
            <Link
              href="/dashboard/podcast/studio"
              style={{
                background: GOLD,
                color: '#000',
                fontWeight: 900,
                padding: '14px 28px',
                borderRadius: 999,
                textDecoration: 'none',
              }}
            >
              {P('hero.openStudio')}
            </Link>

            <Link
              href="#how-it-works"
              style={{
                background: 'rgba(255,255,255,.06)',
                color: '#fff',
                fontWeight: 800,
                padding: '14px 28px',
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,.12)',
                textDecoration: 'none',
              }}
            >
              {P('hero.howItWorks')} →
            </Link>
          </div>
        </div>

        <div
          className="studio-card"
          style={{
            position: 'relative',
            minHeight: 560,
            borderRadius: 34,
            padding: 22,
            background:
              'linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.03))',
            border: '1px solid rgba(255,255,255,.12)',
            boxShadow: '0 40px 120px rgba(0,0,0,.55)',
            overflow: 'hidden',
            animation: 'floatPanel 6s ease-in-out infinite',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: -80,
              background:
                'radial-gradient(circle at 50% 30%, rgba(168,85,247,.24), transparent 34%), radial-gradient(circle at 30% 70%, rgba(59,130,246,.22), transparent 32%)',
              filter: 'blur(8px)',
            }}
          />

          <div style={{ position: 'relative', zIndex: 1 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 18,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 11,
                    letterSpacing: '.12em',
                    color: 'rgba(255,255,255,.45)',
                    fontWeight: 900,
                  }}
                >
                  {P('panel.foundry')}
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>
                  {P('panel.episodeFile')}
                </div>
              </div>

              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  borderRadius: 999,
                  padding: '7px 12px',
                  background: 'rgba(239,68,68,.12)',
                  border: '1px solid rgba(239,68,68,.28)',
                  color: '#fecaca',
                  fontSize: 12,
                  fontWeight: 900,
                }}
              >
                🔴 {P('panel.onAir')}
              </div>
            </div>

            <div
              style={{
                borderRadius: 26,
                padding: 22,
                background: 'rgba(0,0,0,.34)',
                border: '1px solid rgba(255,255,255,.1)',
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  height: 110,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  justifyContent: 'center',
                }}
              >
                {Array.from({ length: 34 }).map((_, i) => (
                  <span
                    key={i}
                    style={{
                      width: 6,
                      height: `${18 + ((i * 17) % 76)}%`,
                      borderRadius: 999,
                      background:
                        i % 3 === 0
                          ? GOLD
                          : i % 3 === 1
                            ? BLUE
                            : PURPLE,
                      animation: `wave ${1 + (i % 5) * .18}s ease-in-out infinite`,
                      animationDelay: `${i * .04}s`,
                      boxShadow: '0 0 18px rgba(255,195,0,.25)',
                    }}
                  />
                ))}
              </div>

              <div
                style={{
                  marginTop: 18,
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 10,
                }}
              >
                <StudioMetric label={P('metrics.transcript')} value={P('metrics.ready')} />
                <StudioMetric label={P('metrics.clipsFound')} value="08" />
                <StudioMetric label={P('metrics.languages')} value="5" />
                <StudioMetric label={P('metrics.publishPack')} value="86%" />
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gap: 10,
              }}
            >
              {studioAgents.map(agent => (
                <div
                  key={agent.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: 16,
                    background: 'rgba(255,255,255,.055)',
                    border: '1px solid rgba(255,255,255,.08)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 20 }}>{agent.icon}</span>
                    <span style={{ fontWeight: 800 }}>{agent.name}</span>
                  </div>

                  <span
                    style={{
                      fontSize: 11,
                      color: agent.color,
                      fontWeight: 900,
                      letterSpacing: '.08em',
                    }}
                  >
                    {agent.status}
                  </span>
                </div>
              ))}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
                marginTop: 18,
              }}
            >
              <Link href="/dashboard/video"
                style={{
                  border: 'none',
                  borderRadius: 999,
                  padding: '13px 14px',
                  background: GOLD,
                  color: '#000',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                {P('actions.generateClips')}
              </Link>

              <Link href="/dashboard/video"
                style={{
                  border: '1px solid rgba(255,255,255,.14)',
                  borderRadius: 999,
                  padding: '13px 14px',
                  background: 'rgba(255,255,255,.06)',
                  color: '#fff',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                {P('actions.uploadEpisode')}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          padding: '18px 24px 56px',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 14,
          }}
          className="how-grid"
        >
          {productions.map(item => (
            <div
              key={item.title}
              style={{
                borderRadius: 22,
                padding: 18,
                background: 'rgba(255,255,255,.04)',
                border: '1px solid rgba(255,255,255,.08)',
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 12 }}>🎧</div>
              <h3 style={{ margin: 0, fontSize: 18 }}>{item.title}</h3>
              <p style={{ color: 'rgba(255,255,255,.45)', lineHeight: 1.6 }}>
                {item.clips} · {item.langs}
              </p>
              <span
                style={{
                  display: 'inline-flex',
                  padding: '6px 10px',
                  borderRadius: 999,
                  background: 'rgba(74,222,128,.10)',
                  color: GREEN,
                  fontSize: 12,
                  fontWeight: 900,
                }}
              >
                {item.status}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          padding: '20px 24px 70px',
        }}
      >
        <h2
          style={{
            fontSize: 'clamp(30px, 5vw, 52px)',
            margin: '0 0 14px',
            letterSpacing: '-.04em',
            textAlign: 'center',
          }}
        >
          {P('section.fullStudioTitle')}
        </h2>

        <p
          style={{
            textAlign: 'center',
            color: 'rgba(255,255,255,.48)',
            maxWidth: 620,
            margin: '0 auto 36px',
            lineHeight: 1.7,
          }}
        >
          {P('section.fullStudioSubtitle')}
        </p>

        <div
          className="deliver-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 16,
          }}
        >
          {deliverables.map(item => (
            <div
              key={item.title}
              style={{
                borderRadius: 22,
                padding: 22,
                background: 'rgba(255,255,255,.035)',
                border: '1px solid rgba(255,255,255,.08)',
              }}
            >
              <div style={{ fontSize: 30, marginBottom: 14 }}>{item.icon}</div>
              <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>{item.title}</h3>
              <p
                style={{
                  color: 'rgba(255,255,255,.45)',
                  lineHeight: 1.6,
                  margin: 0,
                  fontSize: 14,
                }}
              >
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section
        id="how-it-works"
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          padding: '0 24px 70px',
        }}
      >
        <h2 style={{ textAlign: 'center', fontSize: 38, marginBottom: 36 }}>
          {t(dict, 'podcasters_page.howTitle', '')}
        </h2>

        <div
          className="how-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 16,
          }}
        >
          {[
            ['01', P('how.step1.title'), P('how.step1.desc')],
            ['02', P('how.step2.title'), P('how.step2.desc')],
            ['03', P('how.step3.title'), P('how.step3.desc')],
            ['04', P('how.step4.title'), P('how.step4.desc')],
          ].map(step => (
            <div
              key={step[0]}
              style={{
                borderRadius: 20,
                padding: 20,
                background: 'rgba(255,255,255,.035)',
                border: '1px solid rgba(255,255,255,.08)',
              }}
            >
              <div
                style={{
                  fontSize: 44,
                  color: 'rgba(255,195,0,.18)',
                  fontWeight: 950,
                  marginBottom: 8,
                }}
              >
                {step[0]}
              </div>
              <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>{step[1]}</h3>
              <p
                style={{
                  color: 'rgba(255,255,255,.45)',
                  margin: 0,
                  lineHeight: 1.6,
                  fontSize: 13,
                }}
              >
                {step[2]}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section
        id="plans"
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          padding: '0 24px 90px',
        }}
      >
        <h2 style={{ fontSize: 38, fontWeight: 900, textAlign: 'center', marginBottom: 12 }}>
          {t(dict, 'podcasters_page.plansTitle', '')}
        </h2>

        <p
          style={{
            textAlign: 'center',
            color: 'rgba(255,255,255,0.45)',
            fontSize: 15,
            marginBottom: 32,
          }}
        >
          {t(
            dict,
            'podcasters_page.plansSubtitle',
            'Sketch your idea for free with our preview tier, then pick a podcast plan when you are ready to publish.'
          )}
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 32 }}>
          {CURRENCIES.map(c => (
            <button
              key={c}
              onClick={() => setCurrency(c)}
              style={{
                padding: '5px 14px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                border: `1px solid ${currency === c ? GOLD : 'rgba(255,255,255,0.1)'}`,
                background: currency === c ? 'rgba(255,195,0,0.12)' : 'transparent',
                color: currency === c ? GOLD : 'rgba(255,255,255,0.4)',
              }}
            >
              {c}
            </button>
          ))}
        </div>

        <div
          className="pricing-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 20,
          }}
        >
          {PLANS.map(plan => (
            <div
              key={plan.key}
              style={{
                background: plan.highlight ? 'rgba(255,195,0,0.07)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${plan.highlight ? 'rgba(255,195,0,0.38)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 24,
                padding: '30px 24px',
                position: 'relative',
              }}
            >
              {plan.highlight && (
                <div
                  style={{
                    position: 'absolute',
                    top: -13,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: GOLD,
                    color: '#000',
                    fontSize: 10,
                    fontWeight: 900,
                    padding: '4px 14px',
                    borderRadius: 999,
                  }}
                >
                  {t(dict, 'podcasters_page.mostPopular', '')}
                </div>
              )}

              <div
                style={{
                  fontSize: 12,
                  fontWeight: 900,
                  color: plan.highlight ? GOLD : 'rgba(255,255,255,.46)',
                  letterSpacing: '.1em',
                  textTransform: 'uppercase',
                  marginBottom: 12,
                }}
              >
                {plan.name}
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: 14, color: 'rgba(255,255,255,.5)', fontWeight: 700 }}>
                  {SYMBOLS[currency]}
                </span>
                <span style={{ fontSize: 44, fontWeight: 950 }}>
                  {(plan.price as any)[currency]}
                </span>
                <span style={{ color: 'rgba(255,255,255,.35)', fontSize: 13 }}>
                  {t(dict, 'podcasters_page.perMonth', '')}
                </span>
              </div>

              <p
                style={{
                  color: 'rgba(255,255,255,.46)',
                  lineHeight: 1.6,
                  minHeight: 46,
                  fontSize: 13,
                }}
              >
                {plan.description}
              </p>

              <button
                onClick={() => {
                  window.location.href =
                    plan.key === 'network'
                      ? `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(P('plans.networkEmailSubject'))}`
                      : '/pricing'
                }}
                style={{
                  width: '100%',
                  borderRadius: 999,
                  padding: '13px 0',
                  border: `1px solid ${plan.highlight ? GOLD : 'rgba(255,255,255,.12)'}`,
                  background: plan.highlight ? GOLD : 'rgba(255,255,255,.06)',
                  color: plan.highlight ? '#000' : '#fff',
                  fontWeight: 900,
                  cursor: 'pointer',
                  marginBottom: 20,
                }}
              >
                {plan.cta}
              </button>

              <div style={{ display: 'grid', gap: 10 }}>
                {plan.features.map(f => (
                  <div
                    key={f}
                    style={{
                      display: 'flex',
                      gap: 9,
                      alignItems: 'flex-start',
                      color: 'rgba(255,255,255,.62)',
                      fontSize: 13,
                    }}
                  >
                    <span style={{ color: GOLD }}>✓</span>
                    <span>{f}</span>
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

function StudioMetric({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div
      style={{
        borderRadius: 16,
        padding: 12,
        background: 'rgba(255,255,255,.055)',
        border: '1px solid rgba(255,255,255,.08)',
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: 'rgba(255,255,255,.42)',
          fontWeight: 900,
          letterSpacing: '.08em',
          textTransform: 'uppercase',
          marginBottom: 5,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 900 }}>{value}</div>
    </div>
  )
}
