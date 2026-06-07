'use client'

import { useTranslation } from '@/lib/i18n/useTranslation'

type Props = { titleKey: string }

export default function GenericI18nPage({ titleKey }: Props) {
  const { t, locale } = useTranslation()
  const formatted = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date('2026-06-07T12:00:00Z'))

  return (
    <main className="min-h-screen bg-[#05070b] text-white">
      <section className="rounded-[2rem] border border-white/10 bg-white/[.04] p-8">
        <p className="text-xs uppercase tracking-[0.35em] text-[#FFD700]">{t('dashboard.layout.metadataTitle')}</p>
        <h1 className="mt-4 text-4xl font-black">{t(titleKey)}</h1>
        <p className="mt-4 max-w-3xl text-white/70">{t('generic.page.subtitle')}</p>
      </section>
      <section className="mt-8 rounded-3xl border border-white/10 bg-black/40 p-6">
        <p className="text-white/60">{t('generic.emptyState')}</p>
        <p className="mt-3 text-sm text-[#FFD700]">{formatted}</p>
        <button className="mt-5 rounded-full bg-[#FFD700] px-5 py-3 font-bold text-black">{t('generic.cta')}</button>
      </section>
    </main>
  )
}
