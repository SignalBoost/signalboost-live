import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'SignalBoost — Build your brand in any language',
  description: 'Create your website, collect customer reviews, and produce native audio & video content — in your language, not a translation.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SignalBoost',
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: 'website',
    title: 'SignalBoost',
    description: 'Build your brand in any language',
    url: 'https://saas.signalboostapp.com',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SignalBoost',
    description: 'Build your brand in any language',
  },
}

export const viewport: Viewport = {
  themeColor: '#ffc300',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className={geist.className}>
        {children}
        <script dangerouslySetInnerHTML={{
          __html: `
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js')
                  .then(function(reg) { console.log('SW registered'); })
                  .catch(function(err) { console.log('SW failed: ', err); });
              });
            }
          `
        }} />
      </body>
    </html>
  )
}
