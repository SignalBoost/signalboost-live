'use client'
import Link from 'next/link'

const GOLD = '#ffc300'
const BLUE = '#3b82f6'

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer style={{
      background: 'rgba(0,0,0,0.3)',
      borderTop: '1px solid rgba(255,255,255,0.06)',
      fontFamily: 'system-ui',
      color: '#fff',
      marginTop: 'auto',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px 28px' }}>

        {/* Brand row — always full width */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 10 }}>
            signal<span style={{ color: GOLD }}>boost</span>
          </div>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.7, maxWidth: 400, marginBottom: 10 }}>
            Build your brand in every language. Native websites, audio, video and reviews in English, Portuguese, Spanish, Polish and Russian.
          </p>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>
            We hide nothing —{' '}
            <Link href="/docs" style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>
              read our full transparency docs
            </Link>
          </div>
        </div>

        {/* Links grid — responsive */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 32,
          marginBottom: 36,
        }}>

          {/* Product */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>
              Product
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Home',       href: '/' },
                { label: 'Podcasters', href: '/podcasters' },
                { label: 'Pricing',    href: '/pricing' },
                { label: 'Dashboard',  href: '/dashboard' },
                { label: 'Docs',       href: '/docs' },
              ].map(item => (
                <Link key={item.href} href={item.href}
                  style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', textDecoration: 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.45)')}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Services */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>
              Services
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Site builder',     href: '/dashboard/builder' },
                { label: 'Review collector', href: '/dashboard/reviews' },
                { label: 'Native audio',     href: '/dashboard/audio' },
                { label: 'Video editor',     href: '/dashboard/video' },
                { label: 'Podcasters',       href: '/podcasters' },
              ].map(item => (
                <Link key={item.href} href={item.href}
                  style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', textDecoration: 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.45)')}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Company */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>
              Company
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'About',              href: '/docs#how-it-works' },
                { label: 'Our partners',       href: '/docs#partners' },
                { label: 'Privacy',            href: '/docs#your-data' },
                { label: 'Pricing',            href: '/pricing' },
                { label: 'Contact us',       href: 'mailto:cadomos@gmail.com' },
              ].map(item => (
                <Link key={item.label} href={item.href}
                  style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', textDecoration: 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.45)')}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

        </div>

        {/* Languages */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
            Available in
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {[
              { flag: '🇺🇸', name: 'English' },
              { flag: '🇧🇷', name: 'Português' },
              { flag: '🇪🇸', name: 'Español' },
              { flag: '🇵🇱', name: 'Polski' },
              { flag: '🇷🇺', name: 'Русский' },
            ].map(lang => (
              <div key={lang.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
                <span>{lang.flag}</span>
                <span>{lang.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            {[
              { label: 'Privacy policy',      href: '/docs#your-data' },
              { label: 'Terms',               href: '/docs#how-it-works' },
              { label: 'Partner disclosure',  href: '/docs#partners' },
              { label: 'Cancel anytime',      href: '/docs#pricing' },
            ].map(item => (
              <Link key={item.label} href={item.href}
                style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', textDecoration: 'none' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.25)')}>
                {item.label}
              </Link>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>
              © {year} SignalBoost. Built with transparency.
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>
              Powered by <span style={{ color: GOLD }}>SignalBoost AI</span>
            </div>
          </div>
        </div>

      </div>
    </footer>
  )
}

