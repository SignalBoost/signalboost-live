'use client'

import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'

export default function SignalHero() {
  const { dict, lang } = useI18n()

  const activeLanguage = lang || 'en'

  const features = [
    dict.buildWebsite || 'Build a website',
    dict.collectReviews || 'Collect reviews',
    dict.generateAudio || 'Generate audio',
    dict.createVideos || 'Create videos',
    dict.aiAssistant || 'AI assistant',
    dict.multilingualContent || 'Multilingual content',
  ]

  return (
    <section className="relative overflow-hidden py-20">
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-4xl">
          <div className="mb-6 inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm text-white/70 backdrop-blur">
            <span>
              {dict.languageBadge ||
                `Native experience • ${activeLanguage.toUpperCase()}`}
            </span>
          </div>

          <h1 className="text-5xl font-bold leading-tight md:text-7xl">
            {dict.heroTitle || 'Build your brand'}
          </h1>

          <p className="mt-6 max-w-2xl text-lg text-white/70">
            {dict.heroSubtitle ||
              'Create multilingual content that feels native, not translated.'}
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/dashboard"
              className="rounded-xl px-6 py-3 bg-white text-black font-medium"
            >
              {dict.getStarted || 'Get started'}
            </Link>

            <Link
              href="/docs"
              className="rounded-xl border border-white/15 px-6 py-3"
            >
              {dict.watchDemo || 'Watch demo'}
            </Link>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-3">
            {features.map(item => (
              <div
                key={item}
                className="rounded-xl border border-white/10 p-4 text-sm text-white/80"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
