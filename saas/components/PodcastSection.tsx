'use client'
import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
export default function PodcastSection() {
  const { dict } = useI18n()

  const FEATURES = [
    {
      icon: '🎙️',
      title: t(dict, 'podcastSection.f1.title'),
      desc: t(dict, 'podcastSection.f1.desc'),
    },
    {
      icon: '✂️',
      title: t(dict, 'podcastSection.f2.title'),
      desc: t(dict, 'podcastSection.f2.desc'),
    },
    {
      icon: '💬',
      title: t(dict, 'podcastSection.f3.title'),
      desc: t(dict, 'podcastSection.f3.desc'),
    },
    {
      icon: '🌐',
      title: t(dict, 'podcastSection.f4.title'),
      desc: t(dict, 'podcastSection.f4.desc'),
    },
    {
      icon: '⭐',
      title: t(dict, 'podcastSection.f5.title'),
      desc: t(dict, 'podcastSection.f5.desc'),
    },
  ]

  const PODCASTERS = [
    { name: 'Joe Rogan', flag: '🇺🇸', reach: t(dict, 'podcastSection.podcaster1.reach') },
    { name: 'Flow Podcast', flag: '🇧🇷', reach: t(dict, 'podcastSection.podcaster2.reach') },
    { name: 'Máxima FM', flag: '🇪🇸', reach: t(dict, 'podcastSection.podcaster3.reach') },
  ]

  return (
    <section style={{
      padding: '80px 24px',
      maxWidth: 1100,
      margin: '0 auto',
      fontFamily: 'system-ui',
    }}>
      <style>{"\n        @media (max-width: 768px) {\n          .podcast-grid {\n            grid-template-columns: 1fr !important;\n            gap: 40px !important;\n          }\n          .podcast-buttons {\n            flex-direction: column !important;\n          }\n          .podcast-buttons a {\n            text-align: center !important;\n          }\n        }\n      "}</style>

      <div className="podcast-grid" style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 80,
        alignItems: 'start',
      }}>

        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'rgba(255,195,0,0.1)', border: '1px solid rgba(255,195,0,0.25)',
            borderRadius: 999, padding: '4px 14px', marginBottom: 20,
            fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: '#ffc300',
          }}>
            🎙️ {t(dict, 'podcastSection.badge')}
          </div>

          <h2 style={{
            fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 900,
            lineHeight: 1.1, letterSpacing: '-0.03em', margin: '0 0 16px', color: '#fff',
          }}>
            {t(dict, 'podcastSection.headlineLine1')}
            <br />
            {t(dict, 'podcastSection.headlineLine2Pre')}{' '}
            <span style={{ color: '#ffc300' }}>{t(dict, 'podcastSection.headlineLine2Highlight')}</span>
          </h2>

          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 15, lineHeight: 1.7, margin: '0 0 12px' }}>
            {t(dict, 'podcastSection.intro')}
          </p>

          <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13, lineHeight: 1.6, margin: '0 0 28px', fontStyle: 'italic' }}>
            {t(dict, 'podcastSection.note')}
          </p>

          <div className="podcast-buttons" style={{ display: 'flex', gap: 12, marginBottom: 32, flexWrap: 'wrap' }}>
            <Link href="/podcasters"
              style={{
                background: '#ffc300', color: '#000', fontWeight: 800,
                fontSize: 14, padding: '12px 28px', borderRadius: 999,
                textDecoration: 'none', display: 'inline-block',
              }}>
              {t(dict, 'podcastSection.ctaPlans')}
            </Link>
            <Link href="/podcasters#how-it-works"
              style={{
                background: 'transparent', color: 'rgba(255,255,255,0.5)',
                fontWeight: 600, fontSize: 14, padding: '12px 28px',
                borderRadius: 999, border: '1px solid rgba(255,255,255,0.12)',
                textDecoration: 'none', display: 'inline-block',
              }}>
              {t(dict, 'podcastSection.ctaHow')} →
            </Link>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {PODCASTERS.map(p => (
              <div key={p.name} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 999, padding: '6px 14px',
              }}>
                <span style={{ fontSize: 16 }}>{p.flag}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{p.name}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{p.reach}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{
              display: 'flex', gap: 14, alignItems: 'flex-start',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 14, padding: '16px 18px',
              transition: 'border-color 0.15s',
            }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,195,0,0.25)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)')}>
              <div style={{
                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                background: 'rgba(255,195,0,0.1)', border: '1px solid rgba(255,195,0,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 17,
              }}>
                {f.icon}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{f.title}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.55 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
