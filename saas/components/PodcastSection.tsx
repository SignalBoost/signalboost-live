'use client'
import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


export default function PodcastSection() {
  const { dict } = useI18n()

  const FEATURES = [
    {
      icon: '🎙️',
      title: t(dict, 'podcastSection.f1.title', uiCopy('u_88c25c28fd056ad6')),
      desc: t(dict, 'podcastSection.f1.desc', uiCopy('u_2aa3b367b91f5ebc')),
    },
    {
      icon: '✂️',
      title: t(dict, 'podcastSection.f2.title', uiCopy('u_a6851607474e9528')),
      desc: t(dict, 'podcastSection.f2.desc', uiCopy('u_834961795e696221')),
    },
    {
      icon: '💬',
      title: t(dict, 'podcastSection.f3.title', uiCopy('u_ca2e38895ba558a6')),
      desc: t(dict, 'podcastSection.f3.desc', uiCopy('u_6676f72a5c360580')),
    },
    {
      icon: '🌐',
      title: t(dict, 'podcastSection.f4.title', uiCopy('u_21a00a040b131bb5')),
      desc: t(dict, 'podcastSection.f4.desc', uiCopy('u_87011cc8e5213c5b')),
    },
    {
      icon: '⭐',
      title: t(dict, 'podcastSection.f5.title', uiCopy('u_cb54809571f7d5fc')),
      desc: t(dict, 'podcastSection.f5.desc', uiCopy('u_edee7b8505ef5d81')),
    },
  ]

  const PODCASTERS = [
    { name: 'Joe Rogan', flag: '🇺🇸', reach: t(dict, 'podcastSection.podcaster1.reach', uiCopy('u_d4ac3e03b54a5e40')) },
    { name: 'Flow Podcast', flag: '🇧🇷', reach: t(dict, 'podcastSection.podcaster2.reach', uiCopy('u_0ed1c090bec585f1')) },
    { name: 'Máxima FM', flag: '🇪🇸', reach: t(dict, 'podcastSection.podcaster3.reach', uiCopy('u_0fbce73610c7d7aa')) },
  ]

  return (
    <section style={{
      padding: '80px 24px',
      maxWidth: 1100,
      margin: '0 auto',
      fontFamily: 'system-ui',
    }}>
      <style>{uiCopy('u_a0ef277c1f6e7f7e')}</style>

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
            🎙️ {t(dict, 'podcastSection.badge', uiCopy('u_fb3a1ade1690bf29'))}
          </div>

          <h2 style={{
            fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 900,
            lineHeight: 1.1, letterSpacing: '-0.03em', margin: '0 0 16px', color: '#fff',
          }}>
            {t(dict, 'podcastSection.headlineLine1', uiCopy('u_d08bf11e443629d3'))}
            <br />
            {t(dict, 'podcastSection.headlineLine2Pre', uiCopy('u_a4911bf0956e29f3'))}{' '}
            <span style={{ color: '#ffc300' }}>{t(dict, 'podcastSection.headlineLine2Highlight', uiCopy('u_94f8c2a178089ed0'))}</span>
          </h2>

          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 15, lineHeight: 1.7, margin: '0 0 12px' }}>
            {t(dict, 'podcastSection.intro', uiCopy('u_6a5fb80b8d3a2541'))}
          </p>

          <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13, lineHeight: 1.6, margin: '0 0 28px', fontStyle: 'italic' }}>
            {t(dict, 'podcastSection.note', uiCopy('u_9dd43f71c286ae1f'))}
          </p>

          <div className="podcast-buttons" style={{ display: 'flex', gap: 12, marginBottom: 32, flexWrap: 'wrap' }}>
            <Link href="/podcasters"
              style={{
                background: '#ffc300', color: '#000', fontWeight: 800,
                fontSize: 14, padding: '12px 28px', borderRadius: 999,
                textDecoration: 'none', display: 'inline-block',
              }}>
              {t(dict, 'podcastSection.ctaPlans', uiCopy('u_d75e28fa1f9cffa0'))}
            </Link>
            <Link href="/podcasters#how-it-works"
              style={{
                background: 'transparent', color: 'rgba(255,255,255,0.5)',
                fontWeight: 600, fontSize: 14, padding: '12px 28px',
                borderRadius: 999, border: '1px solid rgba(255,255,255,0.12)',
                textDecoration: 'none', display: 'inline-block',
              }}>
              {t(dict, 'podcastSection.ctaHow', uiCopy('u_d50dbe7a70670513'))} →
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
