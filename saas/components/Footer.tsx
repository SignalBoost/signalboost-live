'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

const GOLD = '#ffc300'
const CONTACT_EMAIL = 'support@signalboostapp.com'

const FOOTER_TOOL_COPY: Record<string, { websiteOptimizer: string }> = {
  en: { websiteOptimizer: 'Free Website Optimizer' },
  pt: { websiteOptimizer: 'Otimizador de Site Grátis' },
  es: { websiteOptimizer: 'Optimizador Web Gratis' },
  pl: { websiteOptimizer: 'Darmowy Optymalizator Strony' },
  ru: { websiteOptimizer: 'Бесплатный оптимизатор сайта' },
}

export default function Footer() {
  const { dict, lang } = useI18n()
  const footerCopy = FOOTER_TOOL_COPY[lang] || FOOTER_TOOL_COPY.en
  const pathname = usePathname()
  const year = new Date().getFullYear()

  // The marketing footer belongs on public pages only — inside the app it
  // pushes full-height workspaces (assistant, video, calendar) past the viewport.
  if (pathname?.startsWith('/dashboard') || pathname?.startsWith('/admin')) return null

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
                { label: t(dict, 'footer.repoCheck', 'Free Repo Check'), href: '/repo-check' },
                { label: footerCopy.websiteOptimizer, href: '/website-optimizer' },
                { label: t(dict, 'dashboard', 'Dashboard'), href: '/dashboard' },
                { label: t(dict, 'footer.documentation', 'Documentation'), href: '/docs' },
                { label: t(dict, 'support.faq', 'FAQ'), href: '/faq' },
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
                  onMouseEnter={e => { e.currentTarget.style.color = '#fff' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
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
                { label: t(dict, 'buildWebsite', 'Build a website'), href: '/dashboard/builder' },
                { label: t(dict, 'collectReviews', 'Collect reviews'), href: '/dashboard/reviews' },
                { label: t(dict, 'footer.generateNativeAudio', 'Generate native audio'), href: '/dashboard/audio' },
                { label: t(dict, 'createVideos', 'Create videos'), href: '/dashboard/video' },
              ].map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    fontSize: 13,
                    color: 'var(--text-muted)',
                    textDecoration: 'none',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#fff' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
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
                { label: t(dict, 'footer.about', 'About'), href: '/docs#how-it-works' },
                { label: t(dict, 'footer.partners', 'Partners'), href: '/docs#partners' },
                { label: t(dict, 'footer.privacy', 'Privacy'), href: '/docs#your-data' },
                { label: t(dict, 'footer.contact', 'Contact'), href: '/support' },
              ].map(item => (
                <Link
                  key={item.label}
                  href={item.href}
                  style={{
                    fontSize: 13,
                    color: 'var(--text-muted)',
                    textDecoration: 'none',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#fff' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
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
          <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>© {year} SignalBoost</div>

          <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            {t(dict, 'footer.poweredBy', 'Powered by')}{' '}
            <span style={{ color: GOLD }}>{t(dict, 'footer.brandName', 'SignalBoost AI')}</span>
          </div>
        </div>

      </div>
    </footer>
  )
}
