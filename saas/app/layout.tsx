// saas/app/layout.tsx
import type { Metadata } from 'next'
import './globals.css'
import './concierge-workspace.css'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import AppShell from '@/components/layout/AppShell'
import ShareRouteChrome from '@/components/layout/ShareRouteChrome'
import LanguageSuggestion from '@/components/LanguageSuggestion'
import ProductContextBridge from '@/components/ProductContextBridge'
import CreditStatusRequestCoordinator from '@/components/runtime/CreditStatusRequestCoordinator'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import { Analytics } from '@vercel/analytics/react'
import { PUBLIC_BRAND } from '@/lib/public-brand'

const SITE_URL = PUBLIC_BRAND.siteUrl
const SITE_TITLE = `${PUBLIC_BRAND.name} — AI Software That Works for You`
const SITE_DESCRIPTION =
  "AI-powered websites, customer reviews, audio and video content for businesses that want to grow in every language. Build, optimize, and broadcast from one platform."

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s · ${PUBLIC_BRAND.name}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: PUBLIC_BRAND.name,
  keywords: [
    'AI website builder',
    'multilingual marketing',
    'customer reviews',
    'AI audio',
    'AI video',
    'podcast tools',
    'small business growth',
  ],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: PUBLIC_BRAND.name,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: `${PUBLIC_BRAND.name} — ${PUBLIC_BRAND.tagline}` }],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ['/og-image.png'],
  },
  robots: { index: true, follow: true },
}

const ORG_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: PUBLIC_BRAND.name,
  url: SITE_URL,
  logo: `${SITE_URL}/icon.svg`,
  description: SITE_DESCRIPTION,
  sameAs: [] as string[],
}

const OLD_PRESS_WORKFLOW_HIDE_CSS = `
a[href="/dashboard/marketing/outreach?channel=online-newspapers"],
a[href="/dashboard/marketing/outreach?channel=print-newspapers"],
a[href="/dashboard/marketing/outreach?channel=trade-press"],
a[href="/dashboard/outreach?channel=online-newspapers"],
a[href="/dashboard/outreach?channel=print-newspapers"],
a[href="/dashboard/outreach?channel=trade-press"] {
  display: none !important;
}
`

const INITIAL_PAINT_GUARD_CSS = `
html,
body {
  background: #030611;
}

.home {
  background: #030611 !important;
}

.home .waves {
  visibility: hidden;
  animation: signalboostRevealHomeWaves 1ms 450ms forwards !important;
}

/* Public iTMounts wordmark. Keep the logo compact in the existing navigation
   footprint while carrying the approved Roman wordmark + mounted-T direction. */
.sbnav-brand {
  gap: 7px !important;
}

.sbnav-brand .sbnav-brand-mark {
  position: relative;
  display: inline-block;
  width: 28px;
  height: 27px;
  flex: 0 0 28px;
  font-size: 0 !important;
}

.sbnav-brand .sbnav-brand-mark::before {
  content: 'T';
  position: absolute;
  left: 5px;
  top: -4px;
  font-family: Georgia, Cambria, 'Times New Roman', Times, serif;
  font-size: 25px;
  font-weight: 900;
  line-height: 1;
  color: #f8fafc;
  background: linear-gradient(135deg, #f8fafc 0 60%, #a78bfa 61% 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.sbnav-brand .sbnav-brand-mark::after {
  content: '';
  position: absolute;
  left: 2px;
  right: 2px;
  bottom: 0;
  height: 5px;
  border-radius: 999px;
  background: linear-gradient(90deg, #4c1d95, #8b5cf6, #a78bfa);
  box-shadow: 0 3px 12px rgba(139, 92, 246, .38);
}

.sbnav-brand > span:last-child {
  font-family: Georgia, Cambria, 'Times New Roman', Times, serif;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -.025em;
}

@keyframes signalboostRevealHomeWaves {
  to { visibility: visible; }
}

@media (prefers-reduced-motion: reduce) {
  .home .waves {
    animation-delay: 0ms !important;
  }
}
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSON_LD) }}
        />
        <style dangerouslySetInnerHTML={{ __html: OLD_PRESS_WORKFLOW_HIDE_CSS }} />
        <style dangerouslySetInnerHTML={{ __html: INITIAL_PAINT_GUARD_CSS }} />
      </head>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          background: 'var(--bg-base)',
          color: 'var(--text-primary)',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflowX: 'hidden',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 0,
            pointerEvents: 'none',
            overflow: 'clip',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '-20%',
              left: '-10%',
              width: '60vw',
              height: '60vw',
              background: 'radial-gradient(circle, rgba(255,195,0,0.18) 0%, rgba(255,195,0,0) 70%)',
              filter: 'blur(60px)',
              animation: 'meshFloat1 22s ease-in-out infinite',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '30%',
              right: '-15%',
              width: '55vw',
              height: '55vw',
              background: 'radial-gradient(circle, rgba(59,130,246,0.18) 0%, rgba(59,130,246,0) 70%)',
              filter: 'blur(60px)',
              animation: 'meshFloat2 26s ease-in-out infinite',
            }}
          />
        </div>
        <I18nProvider>
          <CreditStatusRequestCoordinator />
          <ShareRouteChrome>
            <Navbar />
          </ShareRouteChrome>
          <ProductContextBridge />
          <main style={{ flex: 1, position: 'relative', zIndex: 1 }}>
            <AppShell>{children}</AppShell>
          </main>
          <ShareRouteChrome>
            <Footer />
            <LanguageSuggestion />
          </ShareRouteChrome>
        </I18nProvider>
        <Analytics />
      </body>
    </html>
  )
}
