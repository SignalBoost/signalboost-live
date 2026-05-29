'use client'

import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

export default function ApprenticeWorkshopPage() {
  const { dict } = useI18n()
  const items = [
    { href: '/dashboard/builder', key: 'website' },
    { href: '/podcasters', key: 'podcast' },
    { href: '/dashboard/outreach/discovery', key: 'outreach' },
    { href: '/dashboard/reviews', key: 'reviews' },
    { href: '/dashboard/video', key: 'video' },
  ]

  return (
    <main style={{ padding: 24, color: '#fff', background: '#0b1020', minHeight: '100vh' }}>
      <h1>{t(dict, 'apprentice.title', 'Workshop Apprentice')}</h1>
      <p>{t(dict, 'apprentice.subtitle', 'Guided tutorials for every SignalBoost workflow.')}</p>
      <ul>
        {items.map((item) => (
          <li key={item.key}>
            <Link href={item.href}>{t(dict, `apprentice.modules.${item.key}`, item.key)}</Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
