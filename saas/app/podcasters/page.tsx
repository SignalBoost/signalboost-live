'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


const CONTACT_EMAIL = 'saassupport@signalboostapp.com'

const GOLD   = '#ffc300'
const BLUE   = '#3b82f6'
const PURPLE = '#a855f7'
const GREEN  = '#4ade80'

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
  const supportEmail = CONTACT_EMAIL

  const [currency, setCurrency]   = useState('USD')
  const [loading, setLoading]     = useState<string | null>(null)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  // ── Podcast checkout handler ────────────────────────────────────────────────
  async function handlePodcastCheckout(planKey: string) {
    if (planKey === 'network') {
      const subject = encodeURIComponent(
        P('plans.networkEmailSubject', 'SignalBoost Network Plan'),
      )
      window.location.href = `mailto:${supportEmail}?subject=${subject}`
      return
    }

    try {
      setCheckoutError(null)
      setLoading(planKey)

      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      )

      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token || ''

      const res = await fetch('/api/checkout', {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${token}`,
        },
        body: JSON.stringify({ plan: planKey, productLine: 'podcast' }),
      })

      const data = await res.json()

      if (data.url) {
        window.location.href = data.url
      } else {
        setCheckoutError(t(dict, 'pricing_page.errorGeneric', uiCopy('u_b78445b2ddcd244d')))
      }
    } catch {
      setCheckoutError(t(dict, 'pricing_page.errorGeneric', uiCopy('u_9dac7c5a9d8a9a01')))
    } finally {
      setLoading(null)
    }
  }

  const PLANS = [
    {
      name: t(dict, 'podcasters_page.plans.indie.name', uiCopy('u_bba02cef0b59447a')),
      key:  'indie',
      price: { USD: 29, BRL: 149, PLN: 120, MXN: 540, EUR: 27 },
      description: t(dict, 'podcasters_page.plans.indie.description', uiCopy('u_6bf6d7e2fcb82844')),
      features: [
        t(dict, 'podcasters_page.plans.indie.f1', uiCopy('u_de935868f8f9b17b')),
        t(dict, 'podcasters_page.plans.indie.f2', uiCopy('u_8a42fea5777664ea')),
        t(dict, 'podcasters_page.plans.indie.f3', uiCopy('u_9b44cb6ee3d836f3')),
        t(dict, 'podcasters_page.plans.indie.f4', uiCopy('u_409e90d3e2ebcaf7')),
        t(dict, 'podcasters_page.plans.indie.f5', uiCopy('u_86c99845909e9234')),
        t(dict, 'podcasters_page.plans.indie.f6', uiCopy('u_bca03686e9f507f4')),
        t(dict, 'podcasters_page.plans.indie.f7', uiCopy('u_16b25941b78921bb')),
        t(dict, 'podcasters_page.plans.indie.f8', uiCopy('u_d5331ed348ebb235')),
      ],
      cta:       t(dict, 'podcasters_page.plans.indie.cta', uiCopy('u_eec1cb130f27033f')),
      highlight: false,
    },
    {
      name: t(dict, 'podcasters_page.plans.pro.name', uiCopy('u_28257c8865c7b87a')),
      key:  'pro',
      price: { USD: 79, BRL: 399, PLN: 320, MXN: 1450, EUR: 74 },
      description: t(dict, 'podcasters_page.plans.pro.description', uiCopy('u_dd12953037996f2d')),
      features: [
        t(dict, 'podcasters_page.plans.pro.f1', uiCopy('u_bb760c4708396665')),
        t(dict, 'podcasters_page.plans.pro.f2', uiCopy('u_d313667da043825d')),
        t(dict, 'podcasters_page.plans.pro.f3', uiCopy('u_9e17a9df6acc0bde')),
        t(dict, 'podcasters_page.plans.pro.f4', uiCopy('u_8cc4333d298fc1e2')),
        t(dict, 'podcasters_page.plans.pro.f5', uiCopy('u_7049ef8e42c95665')),
        t(dict, 'podcasters_page.plans.pro.f6', uiCopy('u_d16cc972dc14f964')),
        t(dict, 'podcasters_page.plans.pro.f7', uiCopy('u_f0dde638d8f7f01c')),
        t(dict, 'podcasters_page.plans.pro.f8', uiCopy('u_5b25279a71e18294')),
      ],
      cta:       t(dict, 'podcasters_page.plans.pro.cta', uiCopy('u_f71b1b231272d6e8')),
      highlight: true,
    },
    {
      name: t(dict, 'podcasters_page.plans.network.name', uiCopy('u_4fa45de4b1fa1d1f')),
      key:  'network',
      price: { USD: 299, BRL: 1490, PLN: 1200, MXN: 5400, EUR: 279 },
      description: t(dict, 'podcasters_page.plans.network.description', uiCopy('u_f33622a4c9ff0112')),
      features: [
        t(dict, 'podcasters_page.plans.network.f1', uiCopy('u_37d0f8d762a57b80')),
        t(dict, 'podcasters_page.plans.network.f2', uiCopy('u_d70f43e59950b456')),
        t(dict, 'podcasters_page.plans.network.f3', uiCopy('u_6edde6db80324855')),
        t(dict, 'podcasters_page.plans.network.f4', uiCopy('u_a31d3e9164e2100d')),
        t(dict, 'podcasters_page.plans.network.f5', uiCopy('u_e6e0147ba1c705c1')),
        t(dict, 'podcasters_page.plans.network.f6', uiCopy('u_86f03b2ab96498c0')),
        t(dict, 'podcasters_page.plans.network.f7', uiCopy('u_18d2ef5895518539')),
        t(dict, 'podcasters_page.plans.network.f8', uiCopy('u_9c3d67429771bc70')),
      ],
      cta:       t(dict, 'podcasters_page.plans.network.cta', uiCopy('u_8e01973fc95e2dae')),
      highlight: false,
    },
  ]

  const studioAgents = [
    { icon: '📝', name: P('agents.transcript', 'Transcript Agent'),    status: P('status.active',   'ACTIVE'),   color: GREEN    },
    { icon: '✂️', name: P('agents.clip',        'Viral Clip Agent'),    status: P('status.scanning', 'SCANNING'), color: GOLD     },
    { icon: '🌍', name: P('agents.translation', 'Translation Agent'),  status: P('status.lang5',    '5 LANG'),   color: BLUE     },
    { icon: '🎙️', name: P('agents.voice',        'Voice Agent'),        status: P('status.ready',    'READY'),    color: PURPLE   },
    { icon: '📣', name: P('agents.distribution','Distribution Agent'), status: P('status.standby',  'STANDBY'),  color: '#fb7185'},
  ]

  const productions = [
    { title: P('episodes.e34','Episode 34'), clips: P('episodes.e34Clips','8 clips'),  langs: P('episodes.e34Langs','5 languages'), status: P('episodes.published','Published') },
    { title: P('episodes.e33','Episode 33'), clips: P('episodes.e33Clips','6 clips'),  langs: P('episodes.e33Langs','3 languages'), status: P('episodes.scheduled','Scheduled') },
    { title: P('episodes.e32','Episode 32'), clips: P('episodes.e32Clips','4 clips'),  langs: P('episodes.e32Langs','2 languages'), status: P('episodes.draft',    'Draft')     },
  ]

  const deliverables = [
    { icon: '🎙️', title: P('deliverables.voiceover.title',    'Native voiceover'),  desc: P('deliverables.voiceover.desc',    'Turn one episode into natural voice versions in multiple languages.')              },
    { icon: '✂️', title: P('deliverables.clips.title',         'Clip factory'),      desc: P('deliverables.clips.desc',         'Find the best moments and turn them into Shorts, Reels and TikToks.')            },
    { icon: '💬', title: P('deliverables.captions.title',      'Captions'),          desc: P('deliverables.captions.desc',      'Generate subtitles, transcripts and social captions automatically.')              },
    { icon: '🌐', title: P('deliverables.website.title',       'Podcast website'),   desc: P('deliverables.website.desc',       'A branded home for episodes, show notes, reviews and languages.')                 },
    { icon: '📣', title: P('deliverables.distribution.title',  'Distribution'),      desc: P('deliverables.distribution.desc',  'Prepare content for YouTube, TikTok, Instagram, email and more.')                 },
    { icon: '⭐', title: P('deliverables.growth.title',         'Listener growth'),   desc: P('deliverables.growth.desc',        'Collect reviews, testimonials and audience signals.')                             },
  ]

  return (
    <main
      style={{
        minHeight:  '100vh',
        background: 'radial-gradient(circle at 15% 10%, rgba(168,85,247,.18), transparent 28%), radial-gradient(circle at 85% 0%, rgba(59,130,246,.16), transparent 28%), linear-gradient(180deg, #07070d 0%, #0b0b14 45%, #08080d 100%)',
        color:      '#fff',
        fontFamily: 'system-ui',
        overflow:   'hidden',
      }}
    >
      {checkoutError && (
        <div role="alert" style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, maxWidth: 480, width: 'calc(100% - 32px)', padding: '12px 16px', borderRadius: 12, background: 'rgba(255,59,48,.14)', border: '1px solid rgba(255,107,107,.5)', color: '#ffb3b3', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 8px 30px rgba(0,0,0,.5)', backdropFilter: 'blur(6px)' }}>
          <span style={{ flex: 1 }}>{checkoutError}</span>
          <button onClick={() => setCheckoutError(null)} aria-label={uiCopy('u_858378be171a55d7')} style={{ background: 'transparent', border: 'none', color: '#ffb3b3', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
        </div>
      )}
      <style>{uiCopy('u_87edd80307024b8a')}</style>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section
        className="studio-hero"
        style={{
          maxWidth:              1180,
          margin:                '0 auto',
          padding:               '36px 24px 36px',
          display:               'grid',
          gridTemplateColumns:   '1fr 1.05fr',
          gap:                   34,
          alignItems:            'center',
        }}
      >
        <div>
          <div
            style={{
              display:       'inline-flex',
              alignItems:    'center',
              gap:           8,
              background:    'rgba(255,195,0,0.1)',
              border:        '1px solid rgba(255,195,0,0.28)',
              borderRadius:  999,
              padding:       '6px 14px',
              marginBottom:  22,
              fontSize:      11,
              fontWeight:    900,
              letterSpacing: '.1em',
              color:         GOLD,
              textTransform: 'uppercase',
            }}
          >
            <span style={{ color: '#ef4444' }}>●</span>
            {P(uiCopy('u_8511079ec80d5f31'), uiCopy('u_afa9942db9db860b'))}
          </div>

          <h1
            style={{
              fontSize:      'clamp(34px, 5vw, 60px)',
              lineHeight:    .96,
              letterSpacing: '-.06em',
              margin:        0,
              fontWeight:    950,
            }}
          >
            {P(uiCopy('u_1d613f0e12d3c34c'), uiCopy('u_d2660e690238f0d1'))}
            <br />
            {P(uiCopy('u_cc97e11eae71ec29'), uiCopy('u_be83117382c998ca'))}
            <br />
            <span style={{ color: GOLD }}>{P(uiCopy('u_7c46270a1ed9f876'), uiCopy('u_d161d26e9fa0abd2'))}</span>
          </h1>

          <p style={{ marginTop: 16, color: 'rgba(255,255,255,.58)', fontSize: 15, lineHeight: 1.65, maxWidth: 560 }}>
            {P(uiCopy('u_41b02204e9b85abe'), uiCopy('u_a64b288b909b039c'))}
          </p>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 22 }}>
            <Link
              href="/dashboard/podcast/studio"
              style={{ background: GOLD, color: '#000', fontWeight: 900, padding: '14px 28px', borderRadius: 999, textDecoration: 'none' }}
            >
              {P(uiCopy('u_fc10b0f19538adfd'), uiCopy('u_84b9b92fe220a668'))}
            </Link>

            <Link
              href="#how-it-works"
              style={{ background: 'rgba(255,255,255,.06)', color: '#fff', fontWeight: 800, padding: '14px 28px', borderRadius: 999, border: '1px solid rgba(255,255,255,.12)', textDecoration: 'none' }}
            >
              {P(uiCopy('u_6762396bda747f2d'), uiCopy('u_e765deb6e6d9096e'))} →
            </Link>
          </div>
        </div>

        {/* Studio panel */}
        <div
          className="studio-card"
          style={{
            position:   'relative',
            minHeight:  'min(520px, calc(100vh - 250px))',
            borderRadius: 34,
            padding:    22,
            background: 'linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.03))',
            border:     '1px solid rgba(255,255,255,.12)',
            boxShadow:  '0 40px 120px rgba(0,0,0,.55)',
            overflow:   'hidden',
            animation:  'floatPanel 6s ease-in-out infinite',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset:    -80,
              background: 'radial-gradient(circle at 50% 30%, rgba(168,85,247,.24), transparent 34%), radial-gradient(circle at 30% 70%, rgba(59,130,246,.22), transparent 32%)',
              filter:   'blur(8px)',
            }}
          />

          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 11, letterSpacing: '.12em', color: 'rgba(255,255,255,.45)', fontWeight: 900 }}>
                  {P(uiCopy('u_fe61776ea8eacff3'), uiCopy('u_5ce91204786ecee5'))}
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>
                  {P(uiCopy('u_6f552914f631e48b'), uiCopy('u_0b591c1223667f54'))}
                </div>
              </div>

              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 999, padding: '7px 12px', background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.28)', color: '#fecaca', fontSize: 12, fontWeight: 900 }}>
                🔴 {P(uiCopy('u_9397c970702e4f1f'), uiCopy('u_a80dd11ca6bc7f46'))}
              </div>
            </div>

            <div style={{ borderRadius: 26, padding: 22, background: 'rgba(0,0,0,.34)', border: '1px solid rgba(255,255,255,.1)', marginBottom: 16 }}>
              <div style={{ height: 110, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                {Array.from({ length: 34 }).map((_, i) => (
                  <span
                    key={i}
                    style={{
                      width:     6,
                      height:    `${18 + ((i * 17) % 76)}%`,
                      borderRadius: 999,
                      background: i % 3 === 0 ? GOLD : i % 3 === 1 ? BLUE : PURPLE,
                      animation: `wave ${1 + (i % 5) * .18}s ease-in-out infinite`,
                      animationDelay: `${i * .04}s`,
                      boxShadow: '0 0 18px rgba(255,195,0,.25)',
                    }}
                  />
                ))}
              </div>

              <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <StudioMetric label={P('metrics.transcript',  'Transcript')}   value={P('metrics.ready', 'Ready')} />
                <StudioMetric label={P('metrics.clipsFound',  'Clips found')}  value="08" />
                <StudioMetric label={P('metrics.languages',   'Languages')}    value="5"  />
                <StudioMetric label={P('metrics.publishPack', 'Publish pack')} value="86%" />
              </div>
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              {studioAgents.map(agent => (
                <div
                  key={agent.name}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 16, background: 'rgba(255,255,255,.055)', border: '1px solid rgba(255,255,255,.08)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 20 }}>{agent.icon}</span>
                    <span style={{ fontWeight: 800 }}>{agent.name}</span>
                  </div>
                  <span style={{ fontSize: 11, color: agent.color, fontWeight: 900, letterSpacing: '.08em' }}>
                    {agent.status}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 18 }}>
              <Link href="/dashboard/video" style={{ border: 'none', borderRadius: 999, padding: '13px 14px', background: GOLD, color: '#000', fontWeight: 900, cursor: 'pointer', textDecoration: 'none', textAlign: 'center' }}>
                {P(uiCopy('u_324a3f6cf50151a7'), uiCopy('u_85267c1140826a87'))}
              </Link>
              <Link href="/dashboard/video" style={{ border: '1px solid rgba(255,255,255,.14)', borderRadius: 999, padding: '13px 14px', background: 'rgba(255,255,255,.06)', color: '#fff', fontWeight: 900, cursor: 'pointer', textDecoration: 'none', textAlign: 'center' }}>
                {P(uiCopy('u_7329c9353f29eea3'), uiCopy('u_1b94958bc20264c8'))}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Episode cards ─────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '18px 24px 56px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }} className="how-grid">
          {productions.map(item => (
            <div
              key={item.title}
              style={{ borderTop: '1px solid rgba(255,255,255,.08)', borderLeft: '2px solid rgba(168,85,247,.45)', padding: '14px 0 14px 14px' }}
            >
              <div style={{ fontSize: 28, marginBottom: 12 }}>🎧</div>
              <h3 style={{ margin: 0, fontSize: 18 }}>{item.title}</h3>
              <p style={{ color: 'rgba(255,255,255,.45)', lineHeight: 1.6 }}>
                {item.clips} · {item.langs}
              </p>
              <span style={{ display: 'inline-flex', padding: '6px 10px', borderRadius: 999, background: 'rgba(74,222,128,.10)', color: GREEN, fontSize: 12, fontWeight: 900 }}>
                {item.status}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Deliverables ──────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '20px 24px 70px' }}>
        <h2 style={{ fontSize: 'clamp(30px, 5vw, 52px)', margin: '0 0 14px', letterSpacing: '-.04em', textAlign: 'center' }}>
          {P(uiCopy('u_26b2be8fc0b26705'), uiCopy('u_8713314ba4854a0a'))}
        </h2>
        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,.48)', maxWidth: 620, margin: '0 auto 36px', lineHeight: 1.7 }}>
          {P(uiCopy('u_8f9eb197c7a42e8f'), uiCopy('u_2492ae4da4f955ce'))}
        </p>

        <div className="deliver-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {deliverables.map(item => (
            <div
              key={item.title}
              style={{ borderTop: '1px solid rgba(255,255,255,.08)', borderLeft: '2px solid rgba(59,130,246,.45)', padding: '16px 0 16px 14px' }}
            >
              <div style={{ fontSize: 30, marginBottom: 14 }}>{item.icon}</div>
              <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>{item.title}</h3>
              <p style={{ color: 'rgba(255,255,255,.45)', lineHeight: 1.6, margin: 0, fontSize: 14 }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section id="how-it-works" style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 70px' }}>
        <h2 style={{ textAlign: 'center', fontSize: 38, marginBottom: 36 }}>
          {t(dict, 'podcasters_page.howTitle', uiCopy('u_182fb8e79f48b4c1'))}
        </h2>

        <div className="how-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {[
            ['01', P(uiCopy('u_ff6ad2dc7d479a6e'), uiCopy('u_710b7d183430e684')), P(uiCopy('u_20817171aea69b74'), uiCopy('u_76c96dc9c282af84'))],
            ['02', P(uiCopy('u_a0a7ee4b788990d9'), uiCopy('u_ce64110eada9669f')),      P(uiCopy('u_dbe242aea1bd6ed4'), uiCopy('u_ee124b5419c8cf3c'))],
            ['03', P(uiCopy('u_26042741dff45017'), uiCopy('u_98dc0df87661b221')),       P(uiCopy('u_a0016a6658c9ade5'), uiCopy('u_306fb7adf023f71b'))],
            ['04', P(uiCopy('u_6b15e860d84cdfd5'), uiCopy('u_9183f92eb44a2598')),  P(uiCopy('u_7a03551c959f1fd6'), uiCopy('u_40388e59f074f0bb'))],
          ].map(step => (
            <div
              key={step[0]}
              style={{ borderTop: '1px solid rgba(255,195,0,.25)', padding: '16px 0 4px' }}
            >
              <div style={{ fontSize: 44, color: 'rgba(255,195,0,.18)', fontWeight: 950, marginBottom: 8 }}>
                {step[0]}
              </div>
              <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>{step[1]}</h3>
              <p style={{ color: 'rgba(255,255,255,.45)', margin: 0, lineHeight: 1.6, fontSize: 13 }}>{step[2]}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ───────────────────────────────────────────────────────── */}
      <section id="plans" style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 90px' }}>
        <h2 style={{ fontSize: 38, fontWeight: 900, textAlign: 'center', marginBottom: 12 }}>
          {t(dict, 'podcasters_page.plansTitle', uiCopy('u_88c7c0e99006fab8'))}
        </h2>

        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.45)', fontSize: 15, marginBottom: 32 }}>
          {t(dict, 'podcasters_page.plansSubtitle', uiCopy('u_7349683bdaf7fd46'))}
        </p>

        {/* Currency switcher */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 32 }}>
          {CURRENCIES.map(c => (
            <button
              key={c}
              onClick={() => setCurrency(c)}
              style={{
                padding:    '5px 14px',
                borderRadius: 999,
                fontSize:   11,
                fontWeight: 700,
                cursor:     'pointer',
                border:     `1px solid ${currency === c ? GOLD : 'rgba(255,255,255,0.1)'}`,
                background: currency === c ? 'rgba(255,195,0,0.12)' : 'transparent',
                color:      currency === c ? GOLD : 'rgba(255,255,255,0.4)',
              }}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Plan cards */}
        <div className="pricing-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {PLANS.map(plan => (
            <div
              key={plan.key}
              style={{
                background:   plan.highlight ? 'rgba(255,195,0,0.07)' : 'rgba(255,255,255,0.03)',
                border:       `1px solid ${plan.highlight ? 'rgba(255,195,0,0.38)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 24,
                padding:      '30px 24px',
                position:     'relative',
              }}
            >
              {plan.highlight && (
                <div
                  style={{
                    position:  'absolute',
                    top:       -13,
                    left:      '50%',
                    transform: 'translateX(-50%)',
                    background: GOLD,
                    color:     '#000',
                    fontSize:  10,
                    fontWeight: 900,
                    padding:   '4px 14px',
                    borderRadius: 999,
                  }}
                >
                  {t(dict, 'podcasters_page.mostPopular', uiCopy('u_b346607d9b4ab412'))}
                </div>
              )}

              <div style={{ fontSize: 12, fontWeight: 900, color: plan.highlight ? GOLD : 'rgba(255,255,255,.46)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 12 }}>
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
                  {t(dict, 'podcasters_page.perMonth', uiCopy('u_45f7815531a5688c'))}
                </span>
              </div>

              <p style={{ color: 'rgba(255,255,255,.46)', lineHeight: 1.6, minHeight: 46, fontSize: 13 }}>
                {plan.description}
              </p>

              {/* ── CTA button — now triggers real checkout ── */}
              <button
                onClick={() => handlePodcastCheckout(plan.key)}
                disabled={loading === plan.key}
                style={{
                  width:        '100%',
                  borderRadius: 999,
                  padding:      '13px 0',
                  border:       `1px solid ${plan.highlight ? GOLD : 'rgba(255,255,255,.12)'}`,
                  background:   plan.highlight ? GOLD : 'rgba(255,255,255,.06)',
                  color:        plan.highlight ? '#000' : '#fff',
                  fontWeight:   900,
                  cursor:       loading === plan.key ? 'wait' : 'pointer',
                  marginBottom: 20,
                  opacity:      loading === plan.key ? 0.7 : 1,
                }}
              >
                {loading === plan.key
                  ? t(dict, 'pricing_page.loading', uiCopy('u_288f95ffe3f522d3'))
                  : plan.cta}
              </button>

              <div style={{ display: 'grid', gap: 10 }}>
                {plan.features.map(f => (
                  <div
                    key={f}
                    style={{ display: 'flex', gap: 9, alignItems: 'flex-start', color: 'rgba(255,255,255,.62)', fontSize: 13 }}
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

function StudioMetric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ borderRadius: 16, padding: 12, background: 'rgba(255,255,255,.055)', border: '1px solid rgba(255,255,255,.08)' }}>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,.42)', fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 5 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 900 }}>{value}</div>
    </div>
  )
}
