'use client'

import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'

export default function SignalHero() {
  const { dict, language } = useI18n()

  // Use current selected language only
  // Removes independent language rotation that causes mixed content
  const activeLanguage = language

  const features = [
    dict?.hero?.features?.websiteBuilder || 'Website builder',
    dict?.hero?.features?.reviewCollector || 'Review collector',
    dict?.hero?.features?.nativeAudio || 'Native audio',
    dict?.hero?.features?.videoEditor || 'Video editor',
    dict?.hero?.features?.aiAssistant || 'AI assistant',
    dict?.hero?.features?.multilingualContent || 'Multilingual content',
  ]

  return (
    <section className="relative overflow-hidden py-20">

      <div className="mx-auto max-w-7xl px-6">

        <div className="max-w-4xl">

          <div className="mb-6 inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm text-white/70 backdrop-blur">

            <span>
              {dict?.hero?.languageBadge ||
                `Native experience • ${activeLanguage.toUpperCase()}`}
            </span>

          </div>

          <h1 className="text-5xl font-bold leading-tight md:text-7xl">

            {dict?.hero?.title ||
              'Build your brand'}

          </h1>

          <p className="mt-6 max-w-2xl text-lg text-white/70">

            {dict?.hero?.subtitle ||
              'Create multilingual content that feels native, not translated.'}

          </p>

          <div className="mt-8 flex flex-wrap gap-4">

            <Link
              href="/signup"
              className="rounded-xl px-6 py-3 bg-white text-black font-medium"
            >
              {dict?.hero?.getStarted || 'Get started'}
            </Link>

            <Link
              href="/demo"
              className="rounded-xl border border-white/15 px-6 py-3"
            >
              {dict?.hero?.watchDemo || 'Watch demo'}
            </Link>

          </div>

          <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-3">

            {features.map((item) => (
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
