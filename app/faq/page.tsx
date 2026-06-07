'use client'

import Link from 'next/link'
import { useTranslation } from '@/lib/i18n/useTranslation'

export default function FaqPage() {
  const { t } = useTranslation()
  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <Link href="/" className="text-[#FFD700] no-underline">{t('common.backToSignalBoost')}</Link>
      <section className="mt-12 max-w-3xl">
        <h1 className="mb-4 text-4xl font-bold">{t('faq.title')}</h1>
        <p className="text-neutral-400">{t('faq.subtitle')}</p>
        <div className="mt-6 space-y-4">
          {[0, 1].map((index) => (
            <article key={index} className="rounded-xl border border-white/10 p-4">
              <h2 className="font-bold text-[#FFD700]">{t(`faq.question.${index}`)}</h2>
              <p className="mt-2 text-white/70">{t(`faq.answer.${index}`)}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
