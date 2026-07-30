'use client'

import Link from 'next/link'
import AdmConsoleClient from '@/components/admin/outreach/AdmConsoleClient'
import { useI18n } from '@/components/i18n/I18nProvider'
import { outreachDeliveryCopyFor } from '@/lib/i18n/outreachReleaseCopy'

export default function OutreachAdminPage() {
  const { lang } = useI18n()
  const copy = outreachDeliveryCopyFor(lang)

  return (
    <main style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Link href="/admin/outreach/delivery" className="sb-button-secondary">{copy.link}</Link>
      </div>
      <AdmConsoleClient />
    </main>
  )
}
