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
  const { dict } = useI18n()
  const P = (key: string, fallback: string) => t(dict, `podcasters_page.${key}`, fallback)
  const [currency, setCurrency] = useState('USD')

  const PLANS = [
    {
      name: t(dict, 'podcasters_page.plans.indie.name', 'Indie'),
      key: 'indie',
      price: { USD: 29, BRL: 149, PLN: 120, MXN: 540, EUR: 27 },
      description: t(
        dict,
        'podcasters_page.plans.indie.description',
        'Perfect for independent podcasters getting started globally.'
      ),
      features: [
        t(dict, 'podcasters_page.plans.indie.f1', '1 show'),
        t(dict, 'podcasters_page.plans.indie.f2', '4 episodes per month'),
        t(dict, 'podcasters_page.plans.indie.f3', '2 languages'),
        t(dict, 'podcasters_page.plans.indie.f4', 'Native AI voiceover'),
        t(dict, 'podcasters_page.plans.indie.f5', 'Captions in 2 languages'),
        t(dict, 'podcasters_page.plans.indie.f6', 'Basic clip generation'),
        t(dict, 'podcasters_page.plans.indie.f7', 'Podcast website'),
        t(dict, 'podcasters_page.plans.indie.f8', 'Listener reviews'),
      ],
      cta: t(dict, 'podcasters_page.plans.indie.cta', 'Get started'),
      highlight: false,
    },
    {
      name: t(dict, 'podcasters_page.plans.pro.name', 'Pro'),
      key: 'pro',
      price: { USD: 79, BRL: 399, PLN: 320, MXN: 1450, EUR: 74 },
      description: t(
        dict,
        'podcasters_page.plans.pro.description',
        'For serious podcasters who want global reach.'
      ),
      features: [
        t(dict, 'podcasters_page.plans.pro.f1', '3 shows'),
        t(dict, 'podcasters_page.plans.pro.f2', 'Unlimited episodes'),
        t(dict, 'podcasters_page.plans.pro.f3', 'All 5 languages'),
        t(dict, 'podcasters_page.plans.pro.f4', 'Native AI voiceover'),
        t(dict, 'podcasters_page.plans.pro.f5', 'Captions in all 5 languages'),
        t(dict, 'podcasters_page.plans.pro.f6', 'Clip factory'),
        t(dict, 'podcasters_page.plans.pro.f7', 'Multi-language podcast website'),
        t(dict, 'podcasters_page.plans.pro.f8', 'Analytics'),
      ],
      cta: t(dict, 'podcasters_page.plans.pro.cta', 'Get started'),
      highlight: true,
    },
    {
      name: t(dict, 'podcasters_page.plans.network.name', 'Network'),
      key: 'network',
      price: { USD: 299, BRL: 1490, PLN: 1200, MXN: 5400, EUR: 279 },
      description: t(
        dict,
        'podcasters_page.plans.network.description',
        'For podcast networks managing multiple shows.'
      ),
      features: [
        t(dict, 'podcasters_page.plans.network.f1', 'Unlimited shows'),
        t(dict, 'podcasters_page.plans.network.f2', 'Unlimited episodes'),
        t(dict, 'podcasters_page.plans.network.f3', 'All languages plus custom'),
        t(dict, 'podcasters_page.plans.network.f4', 'Dedicated processing'),
        t(dict, 'podcasters_page.plans.network.f5', 'Custom caption formats'),
        t(dict, 'podcasters_page.plans.network.f6', 'White label website'),
        t(dict, 'podcasters_page.plans.network.f7', 'API access'),
        t(dict, 'podcasters_page.plans.network.f8', 'Dedicated account manager'),
      ],
      cta: t(dict, 'podcasters_page.plans.network.cta', 'Contact us'),
      highlight: false,
    },
  ]

  const studioAgents = [
    { icon: '📝', name: P('agents.transcript','Transcript Agent'), status: P('status.active','ACTIVE'), color: GREEN },
    { icon: '✂️', name: P('agents.clip','Viral Clip Agent'), status: P('status.scanning','SCANNING'), color: GOLD },
    { icon: '🌍', name: P('agents.translation','Translation Agent'), status: P('status.lang5','5 LANG'), color: BLUE },
    { icon: '🎙️', name: P('agents.voice','Voice Agent'), status: P('status.ready','READY'), color: PURPLE },
    { icon: '📣', name: P('agents.distribution','Distribution Agent'), status: P('status.standby','STANDBY'), color: '#fb7185' },
  ]

  const productions = [
    { title: P('episodes.e34','Episode 34'), clips: P('episodes.e34Clips','8 clips'), langs: P('episodes.e34Langs','5 languages'), status: P('episodes.published','Published') },
    { title: P('episodes.e33','Episode 33'), clips: P('episodes.e33Clips','6 clips'), langs: P('episodes.e33Langs','3 languages'), status: P('episodes.scheduled','Scheduled') },
    { title: P('episodes.e32','Episode 32'), clips: P('episodes.e32Clips','4 clips'), langs: P('episodes.e32Langs','2 languages'), status: P('episodes.draft','Draft') },
  ]

  const deliverables = [
    { icon: '🎙️', title: 'Native voiceover', desc: 'Turn one episode into natural voice versions in multiple languages.' },
    { icon: '✂️', title: 'Clip factory', desc: 'Find the best moments and turn them into Shorts, Reels and TikToks.' },
    { icon: '💬', title: 'Captions', desc: 'Generate subtitles, transcripts and social captions automatically.' },
    { icon: '🌐', title: 'Podcast website', desc: 'A branded home for episodes, show notes, reviews and languages.' },
    { icon: '📣', title: 'Distribution', desc: 'Prepare content for YouTube, TikTok, Instagram, email and more.' },
    { icon: '⭐', title: 'Listener growth', desc: 'Collect reviews, testimonials and audience signals.' },
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
            {P('hero.liveBadge', 'PODCAST_STUDIO // LIVE')}
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
            {P('hero.line1','Your podcast.')}
            <br />
            {P('hero.line2','Your studio.')}
            <br />
            <span style={{ color: GOLD }}>{P('hero.line3','Your global audience.')}</span>
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
            {P('hero.subtitle','Upload one episode and let SignalBoost help create transcripts, clips, captions, multilingual audio, show notes and distribution assets from a single studio workspace.')}
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
              {P('hero.openStudio','Open Studio')}
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
              {P('hero.howItWorks','How it works')} →
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
                  {P('panel.foundry','SIGNALBOOST AUDIO FOUNDRY')}
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>
                  {P('panel.episodeFile','Episode_034.wav')}
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
                🔴 {P('panel.onAir','ON AIR')}
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
                <StudioMetric label={P('metrics.transcript','Transcript')} value={P('metrics.ready','Ready')} />
                <StudioMetric label={P('metrics.clipsFound','Clips found')} value="08" />
                <StudioMetric label={P('metrics.languages','Languages')} value="5" />
                <StudioMetric label={P('metrics.publishPack','Publish pack')} value="86%" />
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
                {P('actions.generateClips','Generate clips')}
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
                {P('actions.uploadEpisode','Upload episode')}
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
          {P('section.fullStudioTitle','A full production studio after you record')}
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
          {P('section.fullStudioSubtitle','You focus on the conversation. SignalBoost helps turn that episode into clips, captions, translated content, voiceovers, pages and promotional assets.')}
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
          {t(dict, 'podcasters_page.howTitle', 'How it works')}
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
            ['01', 'Upload your episode', 'Bring the finished audio or video.'],
            ['02', 'Choose outputs', 'Clips, captions, languages, voiceover and show notes.'],
            ['03', 'AI crew works', 'Transcript, clip, translation and distribution agents prepare assets.'],
            ['04', 'Publish everywhere', 'Download or prepare content for every channel.'],
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
          {t(dict, 'podcasters_page.plansTitle', 'Podcast plans')}
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
                  {t(dict, 'podcasters_page.mostPopular', 'Most popular')}
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
                  {t(dict, 'podcasters_page.perMonth', '/mo')}
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
                      ? `mailto:${CONTACT_EMAIL}?subject=SignalBoost Network Plan`
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
