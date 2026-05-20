'use client'
import Link from 'next/link'

const GOLD = '#ffc300'

const CONTACT_EMAIL = 'support@signalboostapp.com'

export default function Footer() {
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
            SignalBoost helps businesses grow with native websites,
            customer reviews, audio, video and AI-powered content —
            built for how people actually speak.
          </p>

          <div
            style={{
              fontSize: 12,
              color: 'var(--text-faint)',
            }}
          >
            Learn how SignalBoost works —{' '}
            <Link
              href="/docs"
              style={{
                color: 'var(--text-secondary)',
                textDecoration: 'none',
              }}
            >
              read the documentation
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
              Product
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {[
                { label: 'Home', href: '/' },
                { label: 'Pricing', href: '/pricing' },
                { label: 'Dashboard', href: '/dashboard' },
                { label: 'Documentation', href: '/docs' },
                { label: 'Podcasters', href: '/podcasters' },
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
              Build
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
                  label: 'Build a website',
                  href: '/dashboard/builder',
                },
                {
                  label: 'Collect reviews',
                  href: '/dashboard/reviews',
                },
                {
                  label: 'Generate native audio',
                  href: '/dashboard/audio',
                },
                {
                  label: 'Create videos',
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
              Company
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
                  label: 'About',
                  href: '/docs#how-it-works',
                },
                {
                  label: 'Partners',
                  href: '/docs#partners',
                },
                {
                  label: 'Privacy',
                  href: '/docs#your-data',
                },
                {
                  label: 'Contact',
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
            Native experiences available in
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
            Powered by{' '}
            <span style={{ color: GOLD }}>
              SignalBoost AI
            </span>
          </div>
        </div>

      </div>
    </footer>
  )
}
