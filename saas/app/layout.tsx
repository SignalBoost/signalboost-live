import type { Metadata } from 'next'
import './globals.css'
import SupportChat from '@/components/SupportChat'

export const metadata: Metadata = {
  title: 'SignalBoost',
  description: 'Build your brand in every language',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <SupportChat />
      </body>
    </html>
  )
}
