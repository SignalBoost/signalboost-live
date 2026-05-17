'use client'
import Link from 'next/link'
import { useState } from 'react'

const PLANS = [
  {
    name: 'Indie',
    price: { USD: 29, BRL: 149, PLN: 120, MXN: 540, EUR: 27 },
    description: 'Perfect for independent podcasters getting started globally.',
    features: ['1 show', '4 episodes per month', '2 languages', 'Native AI voiceover', 'Captions in 2 languages', 'Basic clip generation (5 clips/ep)', 'Podcast website', 'Listener reviews', 'Email support'],
    cta: 'Start free trial',
    highlight: false,
  },
  {
    name: 'Pro',
    price: { USD: 79, BRL: 399, PLN: 320, MXN: 1450, EUR: 74 },
    description: 'For serious podcasters who want global reach.',
    features: ['3 shows', 'Unlimited episodes', 'All 5 languages', 'Native AI voiceover (priority)', 'Captions in all 5 languages', 'Clip factory (unlimited clips)', 'Multi-language podcast website', 'Listener reviews + analytics', 'Transcript in all languages', 'Priority support'],
    cta: 'Start free trial',
    highlight: true,
  },
  {
    name: 'Network',
    price: { USD: 299, BRL: 1490, PLN: 1200, MXN: 5400, EUR: 279 },
    description: 'For podcast networks managing multiple shows.',
    features: ['Unlimited shows', 'Unlimited episodes', 'All 5 languages + custom', 'Native AI voiceover (dedicated)', 'Custom caption formats (SRT, VTT, ASS)', 'Clip factory (unlimited)', 'White label website', 'Full analytics suite', 'API access', 'Dedicated account manager', 'SLA guarantee'],
    cta: 'Contact us',
    highlight: false,
  },
]

const CURRENCIES = ['USD', 'BRL', 'PLN', 'MXN', 'EUR']
const SYMBOLS: Record<string, string> = { USD: '$', BRL: 'R$', PLN: 'zł', MXN: '$', EUR: '€' }

const HOW_IT_WORKS = [
  { step: '01', title: 'Upload your episode', desc: 'Drop your finished audio or video file. We support MP3, MP4, WAV and more. No raw editing needed.' },
  { step: '02', title: 'Choose your languages', desc: 'Select which languages you want. Pick from English, Portuguese, Spanish, Polish and Russian.' },
  { step: '03', title: 'We generate everything', desc: 'Native AI voiceover, captions, short clips, translated show notes — all automatic.' },
  { step: '04', title: 'Publish everywhere', desc: 'Download your multilingual episodes or publish directly to your SignalBoost podcast website.' },
]

export default function PodcastersPage() {
  const [currency, setCurrency] = useState('USD')

  return (
    <main style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', fontFamily: 'system-ui' }}>

      <section style={{ maxWidth: 800, margin: '0 auto', padding: '80px 24px 60px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,195,0,0.1)', border: '1px solid rgba(255,195,0,0.25)', borderRadius: 999, padding: '4px 16px', marginBottom: 24, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#ffc300' }}>
          🎙️ For podcasters
        </div>
        <h1 style={{ fontSize: 'clamp(36px, 6vw, 72px)', fontWeight: 900, letterSpacing: '-0.03em', margin: '0 0 20px', lineHeight: 1.05 }}>
          You record it.<br />We take it <span style={{ color: '#ffc300' }}>global.</span>
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 18, lineHeight: 1.7, maxWidth: 560, margin: '0 auto 16px' }}>
          Native AI voiceover, multilingual captions, clip generation, and a branded podcast website — all in one platform.
        </p>
        <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13, lineHeight: 1.6, maxWidth: 480, margin: '0 auto 40px', fontStyle: 'italic' }}>
          We do not do hardware or raw audio editing. Bring us your finished episode — we handle everything after that.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="#plans" style={{ background: '#ffc300', color: '#000', fontWeight: 800, fontSize: 15, padding: '14px 36px', borderRadius: 999, textDecoration: 'none' }}>See plans</Link>
          <Link href="#how-it-works" style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', fontWeight: 600, fontSize: 15, padding: '14px 36px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.12)', textDecoration: 'none' }}>How it works →</Link>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 48, marginTop: 56, flexWrap: 'wrap' }}>
          {[{ value: '5', label: 'Languages' }, { value: '< 2hr', label: 'Turnaround' }, { value: 'SRT/VTT', label: 'Caption formats' }, { value: '30 days', label: 'Free trial' }].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 32, fontWeight: 900, color: '#ffc300' }}>{s.value}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 24px' }}>
        <h2 style={{ fontSize: 36, fontWeight: 900, textAlign: 'center', marginBottom: 48 }}>How it works</h2>
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
        <h2 style={{ fontSize: 36, fontWeight: 900, textAlign: 'center', marginBottom: 16 }}>What we deliver</h2>
        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 15, maxWidth: 500, margin: '0 auto 48px' }}>Everything after the recording. You focus on content — we handle global distribution.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[
            { icon: '🎙️', title: 'Native AI voiceover', desc: 'Your episode dubbed in Portuguese, Spanish, Polish and Russian with natural-sounding AI voices.' },
            { icon: '💬', title: 'Multilingual captions', desc: 'Auto-generated subtitles in all your languages. Download as SRT, VTT or burn them into your video.' },
            { icon: '✂️', title: 'Social clips', desc: 'Short-form clips for TikTok, Instagram Reels and YouTube Shorts — in every language.' },
            { icon: '📝', title: 'Translated show notes', desc: 'Episode summaries written natively in each language — not machine translated.' },
            { icon: '🌐', title: 'Podcast website', desc: 'A branded site with episode player, show notes, and a multilingual language switcher.' },
            { icon: '⭐', title: 'Listener reviews', desc: 'Collect and display listener testimonials in their native language.' },
          ].map(item => (
            <div key={item.title} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '24px 20px', display: 'flex', gap: 16, alignItems: 'flex-start' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,195,0,0.25)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)')}>
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
        <h2 style={{ fontSize: 36, fontWeight: 900, textAlign: 'center', marginBottom: 12 }}>Podcast plans</h2>
        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 15, marginBottom: 32 }}>All plans include a 30-day free trial.</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 32 }}>
          {CURRENCIES.map(c => (
            <button key={c} onClick={() => setCurrency(c)}
              style={{ padding: '5px 14px', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: `1px solid ${currency === c ? '#ffc300' : 'rgba(255,255,255,0.1)'}`, background: currency === c ? 'rgba(255,195,0,0.12)' : 'transparent', color: currency === c ? '#ffc300' : 'rgba(255,255,255,0.4)' }}>
              {c}
            </button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {PLANS.map(plan => (
            <div key={plan.name} style={{ background: plan.highlight ? 'rgba(255,195,0,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${plan.highlight ? 'rgba(255,195,0,0.4)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 20, padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 20, position: 'relative' }}>
              {plan.highlight && (
                <div style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', background: '#ffc300', color: '#000', fontSize: 10, fontWeight: 800, padding: '3px 14px', borderRadius: 999, whiteSpace: 'nowrap', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Most popular</div>
              )}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: plan.highlight ? '#ffc300' : 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>{plan.name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>{SYMBOLS[currency]}</span>
                  <span style={{ fontSize: 40, fontWeight: 900, letterSpacing: '-0.03em' }}>{(plan.price as any)[currency]}</span>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>/mo</span>
                </div>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: '8px 0 0', lineHeight: 1.5 }}>{plan.description}</p>
              </div>
              <div>
                <button onClick={() => { window.location.href = plan.name === 'Network' ? 'mailto:cadomos@gmail.com?subject=SignalBoost Network Plan' : '/pricing' }}
                  style={{ background: plan.highlight ? '#ffc300' : 'rgba(255,255,255,0.05)', color: plan.highlight ? '#000' : '#fff', border: `1px solid ${plan.highlight ? '#ffc300' : 'rgba(255,255,255,0.1)'}`, borderRadius: 999, padding: '12px 0', fontSize: 13, fontWeight: 800, cursor: 'pointer', width: '100%' }}>
                  {plan.cta}
                </button>
                <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 8 }}>No commitment · Cancel anytime</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {plan.features.map(f => (
                  <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                    <span style={{ color: '#ffc300', flexShrink: 0 }}>✓</span>{f}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ maxWidth: 700, margin: '0 auto', padding: '0 24px 120px', textAlign: 'center' }}>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 24, padding: '56px 40px' }}>
          <h2 style={{ fontSize: 32, fontWeight: 900, margin: '0 0 14px' }}>Ready to go global?</h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 15, margin: '0 0 32px', lineHeight: 1.6 }}>You record it. We handle the rest — voiceover, captions, clips, website and reviews in 5 languages.</p>
          <Link href="/pricing" style={{ background: '#ffc300', color: '#000', fontWeight: 800, fontSize: 15, padding: '14px 40px', borderRadius: 999, textDecoration: 'none', display: 'inline-block' }}>
            Start your free trial
          </Link>
        </div>
      </section>
    </main>
  )
}
