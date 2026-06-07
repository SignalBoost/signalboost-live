'use client'

import Link from 'next/link'
import { useTranslation } from '@/lib/i18n/useTranslation'

export default function DocsPage() {
  const { t } = useTranslation()
  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <Link href="/" className="text-[#FFD700] no-underline">{t('common.backToSignalBoost')}</Link>
      <section className="mt-12 max-w-3xl">
        <h1 className="mb-4 text-4xl font-bold">{t('docs.title')}</h1>
        <p className="text-neutral-400">{t('docs.subtitle')}</p>
        <div className="mt-6 grid gap-3">
          {['docs.section.dashboard', 'docs.section.admin', 'docs.section.localization'].map((key) => <p key={key} className="rounded-xl border border-white/10 p-4">{t(key)}</p>)}
        </div>
        <Link href="/dashboard" className="mt-6 inline-block rounded-lg bg-[#FFD700] px-5 py-3 font-semibold text-black no-underline">{t('common.openDashboard')}</Link>
      </section>
    </main>
  )
}
