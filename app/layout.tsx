import type { Metadata } from 'next'
import './globals.css'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import MainNavbar from '@/components/MainNavbar'

export const metadata: Metadata = {
  title: 'SignalBoost',
  description: 'Multilingual growth tools for websites, reviews, audio, video, and support.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <I18nProvider>
          <MainNavbar />
          {children}
        </I18nProvider>
      </body>
    </html>
  )
}
