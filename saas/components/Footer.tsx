'use client'
import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

const GOLD = '#ffc300'

const CONTACT_EMAIL = 'support@signalboostapp.com'

export default function Footer() {
  const { dict } = useI18n()
  const year = new Date().getFullYear()

  return (
    <footer
      style={{
        background: 'var(--surface-1)',
        borderTop: '1px solid var(--border-soft)',
        fontFamily: 'system-ui',
        color: 'var(--text-primary)',
        marginTop: 'auto',
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          padding: '48px 24px 28px',
        }}
      >

        {/* Brand */}
        <div style={{ marginBottom: 36 }}>
          <div
            style={{
              fontSize: 20,
              fontWeight: 800,
              marginBottom: 10,
            }}
          >
            signal<span style={{ color: GOLD }}>boost</span>
          </div>

          <p
            style={{
              fontSize: 13,
              color: 'var(--text-muted)',
              lineHeight: 1.7,
              maxWidth: 500,
              marginBottom: 10,
            }}
          >
            {t(
              dict,
              'footer.tagline',
              'SignalBoost helps businesses grow with native websites, customer reviews, audio, video and AI-powered content — built for how people actually speak.'
            )}
          </p>

          <div
            style={{
              fontSize: 12,
              color: 'var(--text-faint)',
            }}
          >
            {t(dict, 'footer.learnHow', 'Learn how SignalBoost works')} —{' '}
            <Link
              href="/docs"
              style={{
                color: 'var(--text-secondary)',
                textDecoration: 'none',
              }}
            >
              {t(dict, 'footer.readDocs', 'read the documentation')}
            </Link>
          </div>
        </div>

        {/* Main grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))',
            gap: 32,
            marginBottom: 36,
          }}
        >

          {/* Product */}
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--text-faint)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: 14,
              }}
            >
              {t(dict, 'footer.product', 'Product')}
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {[
                { label: t(dict, 'home', 'Home'), href: '/' },
                { label: t(dict, 'pricing', 'Pricing'), href: '/pricing' },
                { label: t(dict, 'dashboard', 'Dashboard'), href: '/dashboard' },
                { label: t(dict, 'footer.documentation', 'Documentation'), href: '/docs' },
                { label: t(dict, 'podcasters', 'Podcasters'), href: '/podcasters' },
              ].map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    fontSize: 13,
                    color: 'var(--text-muted)',
                    textDecoration: 'none',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.color = '#fff'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color =
                      'var(--text-muted)'
                  }}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Tools */}
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--text-faint)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: 14,
              }}
            >
              {t(dict, 'footer.build', 'Build')}
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {[
                {
                  label: t(dict, 'buildWebsite', 'Build a website'),
                  href: '/dashboard/builder',
                },
                {
                  label: t(dict, 'collectReviews', 'Collect reviews'),
                  href: '/dashboard/reviews',
                },
                {
                  label: t(dict, 'footer.generateNativeAudio', 'Generate native audio'),
                  href: '/dashboard/audio',
                },
                {
                  label: t(dict, 'createVideos', 'Create videos'),
                  href: '/dashboard/video',
                },
              ].map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    fontSize: 13,
                    color: 'var(--text-muted)',
                    textDecoration: 'none',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.color = '#fff'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color =
                      'var(--text-muted)'
                  }}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Company */}
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--text-faint)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: 14,
              }}
            >
              {t(dict, 'footer.company', 'Company')}
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {[
                {
                  label: t(dict, 'footer.about', 'About'),
                  href: '/docs#how-it-works',
                },
                {
                  label: t(dict, 'footer.partners', 'Partners'),
                  href: '/docs#partners',
                },
                {
                  label: t(dict, 'footer.privacy', 'Privacy'),
                  href: '/docs#your-data',
                },
                {
                  label: t(dict, 'footer.contact', 'Contact'),
                  href: `mailto:${CONTACT_EMAIL}`,
                },
              ].map(item => (
                <Link
                  key={item.label}
                  href={item.href}
                  style={{
                    fontSize: 13,
                    color: 'var(--text-muted)',
                    textDecoration: 'none',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.color = '#fff'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color =
                      'var(--text-muted)'
                  }}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

        </div>

        {/* Languages */}
        <div
          style={{
            borderTop: '1px solid var(--border-soft)',
            paddingTop: 20,
            marginBottom: 20,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--text-faint)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 10,
            }}
          >
            {t(dict, 'footer.nativeExperiences', 'Native experiences available in')}
          </div>

          <div
            style={{
              display: 'flex',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            {[
              { flag: '🇺🇸', name: 'English' },
              { flag: '🇧🇷', name: 'Português' },
              { flag: '🇪🇸', name: 'Español' },
              { flag: '🇵🇱', name: 'Polski' },
              { flag: '🇷🇺', name: 'Русский' },
            ].map(lang => (
              <div
                key={lang.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  color: 'var(--text-muted)',
                }}
              >
                <span>{lang.flag}</span>
                <span>{lang.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom */}
        <div
          style={{
            borderTop: '1px solid var(--border-soft)',
            paddingTop: 20,
            display: 'flex',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-faint)',
            }}
          >
            © {year} SignalBoost
          </div>

          <div
            style={{
              fontSize: 12,
              color: 'var(--text-faint)',
            }}
          >
            {t(dict, 'footer.poweredBy', 'Powered by')}{' '}
            <span style={{ color: GOLD }}>
              SignalBoost AI
            </span>
          </div>
        </div>

      </div>
    </footer>
  )
}
