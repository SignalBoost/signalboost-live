'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PUBLIC_BRAND } from '@/lib/public-brand'
import { PUBLIC_COPY } from '@/lib/seo/publicCopy.ts'
import { PUBLIC_LOCALES, PUBLIC_LOCALE_NAMES, PUBLIC_TOPICS, publicPagePath, type PublicLocale, type PublicTopic } from '@/lib/seo/publicLocales.ts'

/** This navbar derives locale from the route, never from persisted app preference. */
export default function LocalizedPublicNavbar({ locale }: { locale: PublicLocale }) {
  const pathname = usePathname()
  const copy = PUBLIC_COPY[locale]
  const topic = PUBLIC_TOPICS.find(item => pathname === publicPagePath(locale, item)) as PublicTopic | undefined
  return (
    <header data-localized-public-navbar lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}
      style={{ position: 'relative', zIndex: 40, background: '#090d1b', color: '#f8fafc', borderBottom: '1px solid rgba(255,255,255,.14)' }}>
      <style>{`
        .localized-nav-desktop { display: flex; }
        .localized-nav-mobile { display: none; }
        @media (max-width: 767px) {
          .localized-nav-desktop { display: none !important; }
          .localized-nav-mobile { display: block; }
          .localized-nav-mobile summary { cursor: pointer; min-height: 44px; display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; list-style: none; }
          .localized-nav-mobile summary::-webkit-details-marker { display: none; }
          .localized-nav-mobile-links { display: grid; gap: 6px; padding: 8px 16px 16px; border-top: 1px solid rgba(255,255,255,.14); }
          .localized-nav-mobile-links a { display: block; padding: 10px 6px; overflow-wrap: anywhere; min-height: 24px; }
          .localized-nav-mobile-links select { max-width: 100%; width: 100%; font-size: 16px; padding: 10px; }
        }
      `}</style>
      <details className="localized-nav-mobile" data-mobile-public-menu>
        <summary><strong>{PUBLIC_BRAND.name}</strong><span>{copy.features} ☰</span></summary>
        <nav className="localized-nav-mobile-links" aria-label={copy.features}>
          <Link href={publicPagePath(locale)}>{copy.home}</Link>
          {PUBLIC_TOPICS.map(item => (
            <Link key={item} href={publicPagePath(locale, item)}>
              {item === 'ai-website-builder' ? copy.websiteTitle : item === 'customer-reviews' ? copy.reviewsTitle : item === 'ai-content' ? copy.contentTitle : copy.labTitle}
            </Link>
          ))}
          <Link href="/support">{copy.support}</Link>
          <Link href="/docs#your-data">{copy.privacy}</Link>
          <label>{copy.languages}
            <select aria-label={copy.languages} value={locale}
              onChange={event => { window.location.assign(publicPagePath(event.target.value as PublicLocale, topic)) }}>
              {PUBLIC_LOCALES.map(language => <option key={language} value={language}>{PUBLIC_LOCALE_NAMES[language]}</option>)}
            </select>
          </label>
          <Link href="/dashboard">{copy.start}</Link>
        </nav>
      </details>
      <nav className="localized-nav-desktop" aria-label={copy.features} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, padding: '14px 24px', maxWidth: 1280, margin: 'auto' }}>
        <Link href={publicPagePath(locale)} style={{ color: 'white', fontWeight: 800, fontSize: 19, marginInlineEnd: 12 }}>{PUBLIC_BRAND.name}</Link>
        <Link href={publicPagePath(locale)} aria-current={topic ? undefined : 'page'} style={{ color: '#e2e8f0' }}>{copy.home}</Link>
        {PUBLIC_TOPICS.map(item => (
          <Link key={item} href={publicPagePath(locale, item)}
            aria-current={topic === item ? 'page' : undefined} style={{ color: '#e2e8f0' }}>
            {item === 'ai-website-builder' ? copy.websiteTitle : item === 'customer-reviews' ? copy.reviewsTitle : item === 'ai-content' ? copy.contentTitle : copy.labTitle}
          </Link>
        ))}
        <Link href="/support" style={{ color: '#e2e8f0' }}>{copy.support}</Link>
        <Link href="/docs#your-data" style={{ color: '#e2e8f0' }}>{copy.privacy}</Link>
        <label style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{copy.languages}</span>
          <select aria-label={copy.languages} value={locale}
            onChange={event => { window.location.assign(publicPagePath(event.target.value as PublicLocale, topic)) }}
            style={{ background: '#111827', color: 'white', border: '1px solid #64748b', borderRadius: 6, padding: 6 }}>
            {PUBLIC_LOCALES.map(language => <option key={language} value={language}>{PUBLIC_LOCALE_NAMES[language]}</option>)}
          </select>
        </label>
        <Link href="/dashboard" style={{ background: '#7c3aed', color: 'white', borderRadius: 7, padding: '8px 12px' }}>{copy.start}</Link>
      </nav>
    </header>
  )
}
