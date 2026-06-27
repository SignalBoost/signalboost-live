import type { Metadata } from 'next'
import './globals.css'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import Concierge from '@/components/Concierge'
import LanguageSuggestion from '@/components/LanguageSuggestion'
import ProductContextBridge from '@/components/ProductContextBridge'
import { I18nProvider } from '@/components/i18n/I18nProvider'

const SITE_URL = 'https://saas.signalboostapp.com'
const SITE_TITLE = 'SignalBoost — AI Websites, Reviews & Content in Any Language'
const SITE_DESCRIPTION =
  'AI-powered websites, customer reviews, audio and video content for businesses that want to grow in every language. Build, optimize, and broadcast from one platform.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: '%s · SignalBoost',
  },
  description: SITE_DESCRIPTION,
  applicationName: 'SignalBoost',
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
    siteName: 'SignalBoost',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'SignalBoost — grow in every language' }],
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
  name: 'SignalBoost',
  url: SITE_URL,
  logo: `${SITE_URL}/icon.png`,
  description: SITE_DESCRIPTION,
  sameAs: [] as string[],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSON_LD) }}
        />
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
          <Navbar />
          <ProductContextBridge />
          <main style={{ flex: 1, position: 'relative', zIndex: 1 }}>
            {children}
          </main>
          <Footer />
          <Concierge />
          <LanguageSuggestion />
        </I18nProvider>
      </body>
    </html>
  )
}
