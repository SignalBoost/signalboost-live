'use client'
import Link from 'next/link'
import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

const CONTACT_EMAIL = 'support@signalboostapp.com'

const CURRENCIES = ['USD', 'BRL', 'PLN', 'MXN', 'EUR']
const SYMBOLS: Record<string, string> = { USD: '$', BRL: 'R$', PLN: 'zl', MXN: '$', EUR: 'EUR' }

export default function PodcastersPage() {
  const { dict } = useI18n()
  const [currency, setCurrency] = useState('USD')

  const PLANS = [
    {
      name: t(dict, 'podcasters_page.plans.indie.name', 'Indie'),
      key: 'indie',
      price: { USD: 29, BRL: 149, PLN: 120, MXN: 540, EUR: 27 },
      description: t(dict, 'podcasters_page.plans.indie.description', 'Perfect for independent podcasters getting started globally.'),
      features: [
        t(dict, 'podcasters_page.plans.indie.f1', '1 show'),
        t(dict, 'podcasters_page.plans.indie.f2', '4 episodes per month'),
        t(dict, 'podcasters_page.plans.indie.f3', '2 languages'),
        t(dict, 'podcasters_page.plans.indie.f4', 'Native AI voiceover'),
        t(dict, 'podcasters_page.plans.indie.f5', 'Captions in 2 languages'),
        t(dict, 'podcasters_page.plans.indie.f6', 'Basic clip generation (5 clips per episode)'),
        t(dict, 'podcasters_page.plans.indie.f7', 'Podcast website'),
        t(dict, 'podcasters_page.plans.indie.f8', 'Listener reviews'),
        t(dict, 'podcasters_page.plans.indie.f9', 'Email support'),
      ],
      cta: t(dict, 'podcasters_page.plans.indie.cta', 'Get started'),
      highlight: false,
    },
    {
      name: t(dict, 'podcasters_page.plans.pro.name', 'Pro'),
      key: 'pro',
      price: { USD: 79, BRL: 399, PLN: 320, MXN: 1450, EUR: 74 },
      description: t(dict, 'podcasters_page.plans.pro.description', 'For serious podcasters who want global reach.'),
      features: [
        t(dict, 'podcasters_page.plans.pro.f1', '3 shows'),
        t(dict, 'podcasters_page.plans.pro.f2', 'Unlimited episodes'),
        t(dict, 'podcasters_page.plans.pro.f3', 'All 5 languages'),
        t(dict, 'podcasters_page.plans.pro.f4', 'Native AI voiceover (priority)'),
        t(dict, 'podcasters_page.plans.pro.f5', 'Captions in all 5 languages'),
        t(dict, 'podcasters_page.plans.pro.f6', 'Clip factory (unlimited clips)'),
        t(dict, 'podcasters_page.plans.pro.f7', 'Multi-language podcast website'),
        t(dict, 'podcasters_page.plans.pro.f8', 'Listener reviews and analytics'),
        t(dict, 'podcasters_page.plans.pro.f9', 'Transcript in all languages'),
        t(dict, 'podcasters_page.plans.pro.f10', 'Priority support'),
      ],
      cta: t(dict, 'podcasters_page.plans.pro.cta', 'Get started'),
      highlight: true,
    },
    {
      name: t(dict, 'podcasters_page.plans.network.name', 'Network'),
      key: 'network',
      price: { USD: 299, BRL: 1490, PLN: 1200, MXN: 5400, EUR: 279 },
      description: t(dict, 'podcasters_page.plans.network.description', 'For podcast networks managing multiple shows.'),
      features: [
        t(dict, 'podcasters_page.plans.network.f1', 'Unlimited shows'),
        t(dict, 'podcasters_page.plans.network.f2', 'Unlimited episodes'),
        t(dict, 'podcasters_page.plans.network.f3', 'All 5 languages plus custom'),
        t(dict, 'podcasters_page.plans.network.f4', 'Native AI voiceover (dedicated)'),
        t(dict, 'podcasters_page.plans.network.f5', 'Custom caption formats (SRT, VTT, ASS)'),
        t(dict, 'podcasters_page.plans.network.f6', 'Clip factory (unlimited)'),
        t(dict, 'podcasters_page.plans.network.f7', 'White label website'),
        t(dict, 'podcasters_page.plans.network.f8', 'Full analytics suite'),
        t(dict, 'podcasters_page.plans.network.f9', 'API access'),
        t(dict, 'podcasters_page.plans.network.f10', 'Dedicated account manager'),
        t(dict, 'podcasters_page.plans.network.f11', 'SLA guarantee'),
      ],
      cta: t(dict, 'podcasters_page.plans.network.cta', 'Contact us'),
      highlight: false,
    },
  ]

  const HOW_IT_WORKS = [
    {
      step: '01',
      title: t(dict, 'podcasters_page.how.s1.title', 'Upload your episode'),
      desc: t(dict, 'podcasters_page.how.s1.desc', 'Drop your finished audio or video file. We support MP3, MP4, WAV and more. No raw editing needed.'),
    },
    {
      step: '02',
      title: t(dict, 'podcasters_page.how.s2.title', 'Choose your languages'),
      desc: t(dict, 'podcasters_page.how.s2.desc', 'Select which languages you want. Pick from English, Portuguese, Spanish, Polish and Russian.'),
    },
    {
      step: '03',
      title: t(dict, 'podcasters_page.how.s3.title', 'We generate everything'),
      desc: t(dict, 'podcasters_page.how.s3.desc', 'Native AI voiceover, captions, short clips, translated show notes — all automatic.'),
    },
    {
      step: '04',
      title: t(dict, 'podcasters_page.how.s4.title', 'Publish everywhere'),
      desc: t(dict, 'podcasters_page.how.s4.desc', 'Download your multilingual episodes or publish directly to your SignalBoost podcast website.'),
    },
  ]

  const DELIVERABLES = [
    {
      icon: '🎙️',
      title: t(dict, 'podcasters_page.deliver.d1.title', 'Native AI voiceover'),
      desc: t(dict, 'podcasters_page.deliver.d1.desc', 'Your episode dubbed in Portuguese, Spanish, Polish and Russian with natural-sounding AI voices.'),
    },
    {
      icon: '💬',
      title: t(dict, 'podcasters_page.deliver.d2.title', 'Multilingual captions'),
      desc: t(dict, 'podcasters_page.deliver.d2.desc', 'Auto-generated subtitles in all your languages. Download as SRT, VTT or burn them into your video.'),
    },
    {
      icon: '✂️',
      title: t(dict, 'podcasters_page.deliver.d3.title', 'Social clips'),
      desc: t(dict, 'podcasters_page.deliver.d3.desc', 'Short-form clips for TikTok, Instagram Reels and YouTube Shorts — in every language.'),
    },
    {
      icon: '📝',
      title: t(dict, 'podcasters_page.deliver.d4.title', 'Translated show notes'),
      desc: t(dict, 'podcasters_page.deliver.d4.desc', 'Episode summaries written natively in each language — not machine translated.'),
    },
    {
      icon: '🌐',
      title: t(dict, 'podcasters_page.deliver.d5.title', 'Podcast website'),
      desc: t(dict, 'podcasters_page.deliver.d5.desc', 'A branded site with episode player, show notes, and a multilingual language switcher.'),
    },
    {
      icon: '⭐',
      title: t(dict, 'podcasters_page.deliver.d6.title', 'Listener reviews'),
      desc: t(dict, 'podcasters_page.deliver.d6.desc', 'Collect and display listener testimonials in their native language.'),
    },
  ]

  const STATS = [
    { value: '5', label: t(dict, 'podcasters_page.stats.languages', 'Languages') },
    { value: 'under 2 hours', label: t(dict, 'podcasters_page.stats.turnaround', 'Turnaround') },
    { value: 'SRT and VTT', label: t(dict, 'podcasters_page.stats.captionFormats', 'Caption formats') },
    { value: t(dict, 'podcasters_page.stats.freeSketch', 'Free sketch'), label: t(dict, 'podcasters_page.stats.noCommitment', 'No commitment') },
  ]

  return (
    <main style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', fontFamily: 'system-ui' }}>

      <section style={{ maxWidth: 800, margin: '0 auto', padding: '80px 24px 60px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,195,0,0.1)', border: '1px solid rgba(255,195,0,0.25)', borderRadius: 999, padding: '4px 16px', marginBottom: 24, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#ffc300' }}>
          <span>🎙️</span>
          <span>{t(dict, 'podcasters_page.badge', 'For podcasters')}</span>
        </div>

        <h1 style={{ fontSize: 'clamp(36px, 6vw, 72px)', fontWeight: 900, letterSpacing: '-0.03em', margin: '0 0 20px', lineHeight: 1.05 }}>
          {t(dict, 'podcasters_page.heroLine1', 'You record it.')}
          <br />
          {t(dict, 'podcasters_page.heroLine2Pre', 'We take it')}{' '}
          <span style={{ color: '#ffc300' }}>{t(dict, 'podcasters_page.heroLine2Highlight', 'global.')}</span>
        </h1>

        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 18, lineHeight: 1.7, maxWidth: 560, margin: '0 auto 16px' }}>
          {t(dict, 'podcasters_page.heroSubhead', 'Native AI voiceover, multilingual captions, clip generation, and a branded podcast website — all in one platform.')}
        </p>

        <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13, lineHeight: 1.6, maxWidth: 480, margin: '0 auto 40px', fontStyle: 'italic' }}>
          {t(dict, 'podcasters_page.heroNote', 'We do not do hardware or raw audio editing. Bring us your finished episode and we handle everything after that.')}
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="#plans" style={{ background: '#ffc300', color: '#000', fontWeight: 800, fontSize: 15, padding: '14px 36px', borderRadius: 999, textDecoration: 'none' }}>
            {t(dict, 'podcasters_page.ctaSeePlans', 'See plans')}
          </Link>
          <Link href="#how-it-works" style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', fontWeight: 600, fontSize: 15, padding: '14px 36px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.12)', textDecoration: 'none' }}>
            {t(dict, 'podcasters_page.ctaHow', 'How it works')} →
          </Link>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 48, marginTop: 56, flexWrap: 'wrap' }}>
          {STATS.map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 32, fontWeight: 900, color: '#ffc300' }}>{s.value}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 24px' }}>
        <h2 style={{ fontSize: 36, fontWeight: 900, textAlign: 'center', marginBottom: 48 }}>
          {t(dict, 'podcasters_page.howTitle', 'How it works')}
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
          {HOW_IT_WORKS.map((step, i) => (
            <div key={step.step} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '24px 20px', position: 'relative' }}>
              <div style={{ fontSize: 48, fontWeight: 900, color: 'rgba(255,195,0,0.15)', marginBottom: 12 }}>{step.step}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 8 }}>{step.title}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>{step.desc}</div>
              {i < HOW_IT_WORKS.length - 1 && (
                <div style={{ position: 'absolute', right: -12, top: '50%', transform: 'translateY(-50%)', fontSize: 20, color: 'rgba(255,195,0,0.3)' }}>→</div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 60px' }}>
        <h2 style={{ fontSize: 36, fontWeight: 900, textAlign: 'center', marginBottom: 16 }}>
          {t(dict, 'podcasters_page.deliverTitle', 'What we deliver')}
        </h2>

        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 15, maxWidth: 500, margin: '0 auto 48px' }}>
          {t(dict, 'podcasters_page.deliverSubtitle', 'Everything after the recording. You focus on content and we handle global distribution.')}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {DELIVERABLES.map(item => (
            <div
              key={item.title}
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '24px 20px', display: 'flex', gap: 16, alignItems: 'flex-start' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,195,0,0.25)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)')}
            >
              <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, background: 'rgba(255,195,0,0.1)', border: '1px solid rgba(255,195,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{item.icon}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 6 }}>{item.title}</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.55 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="plans" style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 80px' }}>
        <h2 style={{ fontSize: 36, fontWeight: 900, textAlign: 'center', marginBottom: 12 }}>
          {t(dict, 'podcasters_page.plansTitle', 'Podcast plans')}
        </h2>

        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 15, marginBottom: 32 }}>
          {t(dict, 'podcasters_page.plansSubtitle', 'Sketch your idea for free with our preview tier, then pick a podcast plan when you are ready to publish.')}
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 32 }}>
          {CURRENCIES.map(c => (
            <button
              key={c}
              onClick={() => setCurrency(c)}
              style={{ padding: '5px 14px', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: `1px solid ${currency === c ? '#ffc300' : 'rgba(255,255,255,0.1)'}`, background: currency === c ? 'rgba(255,195,0,0.12)' : 'transparent', color: currency === c ? '#ffc300' : 'rgba(255,255,255,0.4)' }}
            >
              {c}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {PLANS.map(plan => (
            <div
              key={plan.key}
              style={{ background: plan.highlight ? 'rgba(255,195,0,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${plan.highlight ? 'rgba(255,195,0,0.4)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 20, padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 20, position: 'relative' }}
            >
              {plan.highlight && (
                <div style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', background: '#ffc300', color: '#000', fontSize: 10, fontWeight: 800, padding: '3px 14px', borderRadius: 999, whiteSpace: 'nowrap', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {t(dict, 'podcasters_page.mostPopular', 'Most popular')}
                </div>
              )}

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: plan.highlight ? '#ffc300' : 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
                  {plan.name}
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>{SYMBOLS[currency]}</span>
                  <span style={{ fontSize: 40, fontWeight: 900, letterSpacing: '-0.03em' }}>{(plan.price as any)[currency]}</span>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>{t(dict, 'podcasters_page.perMonth', '/mo')}</span>
                </div>

                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: '8px 0 0', lineHeight: 1.5 }}>
                  {plan.description}
                </p>
              </div>

              <div>
                <button
                  onClick={() => {
                    window.location.href =
                      plan.key === 'network'
                        ? `mailto:${CONTACT_EMAIL}?subject=SignalBoost Network Plan`
                        : '/pricing'
                  }}
                  style={{ background: plan.highlight ? '#ffc300' : 'rgba(255,255,255,0.05)', color: plan.highlight ? '#000' : '#fff', border: `1px solid ${plan.highlight ? '#ffc300' : 'rgba(255,255,255,0.1)'}`, borderRadius: 999, padding: '12px 0', fontSize: 13, fontWeight: 800, cursor: 'pointer', width: '100%' }}
                >
                  {plan.cta}
                </button>
                <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 8 }}>
                  {t(dict, 'podcasters_page.noCommitment', 'No commitment, cancel anytime')}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {plan.features.map(f => (
                  <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                    <span style={{ color: '#ffc300', flexShrink: 0 }}>✓</span>
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ maxWidth: 700, margin: '0 auto', padding: '0 24px 120px', textAlign: 'center' }}>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 24, padding: '56px 40px' }}>
          <h2 style={{ fontSize: 32, fontWeight: 900, margin: '0 0 14px' }}>
            {t(dict, 'podcasters_page.readyTitle', 'Ready to go global?')}
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 15, margin: '0 0 32px', lineHeight: 1.6 }}>
            {t(dict, 'podcasters_page.readyDesc', 'You record it. We handle the rest — voiceover, captions, clips, website and reviews in 5 languages.')}
          </p>
          <Link href="/pricing" style={{ background: '#ffc300', color: '#000', fontWeight: 800, fontSize: 15, padding: '14px 40px', borderRadius: 999, textDecoration: 'none', display: 'inline-block' }}>
            {t(dict, 'podcasters_page.readyCta', 'See podcast plans')}
          </Link>
        </div>
      </section>
    </main>
  )
}
