'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

const CATEGORIES = ['gettingStarted', 'billing', 'websites', 'reviews', 'audioVideo', 'support'] as const
const QUESTIONS = [
  { category: 'gettingStarted', q: 'faq.questions.start.q', a: 'faq.questions.start.a', qFallback: 'How do I start with SignalBoost?', aFallback: 'Open Dashboard, choose a module, and follow the guided prompt. You can build a website, collect reviews, create audio, make video, or ask Concierge for help.' },
  { category: 'billing', q: 'faq.questions.credits.q', a: 'faq.questions.credits.a', qFallback: 'How do credits and Pro work?', aFallback: 'Your credits and plan label are loaded from your account through the credits API. Upgrading increases limits for publishing, generation, and team workflows.' },
  { category: 'websites', q: 'faq.questions.website.q', a: 'faq.questions.website.a', qFallback: 'Can SignalBoost build my website?', aFallback: 'Yes. Use Build a website to describe your business, preview the generated site, and publish when ready.' },
  { category: 'reviews', q: 'faq.questions.reviews.q', a: 'faq.questions.reviews.a', qFallback: 'How do I collect customer reviews?', aFallback: 'Open Collect reviews, create your public review handle, share the link, and reuse approved testimonials in marketing.' },
  { category: 'audioVideo', q: 'faq.questions.audio.q', a: 'faq.questions.audio.a', qFallback: 'What audio and video tools are included?', aFallback: 'Generate audio from scripts, localize content, and create video prompts or assets from the dashboard video and lab modules.' },
  { category: 'support', q: 'faq.questions.support.q', a: 'faq.questions.support.a', qFallback: 'How do I contact support?', aFallback: 'Use the Concierge button, open Contact Support, or email support@signalboostapp.com. Include your account email and the page where you need help.' },
]

export default function FAQPage() {
  const { dict } = useI18n()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<(typeof CATEGORIES)[number] | 'all'>('all')

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return QUESTIONS.filter(item => category === 'all' || item.category === category).filter(item => {
      if (!needle) return true
      const haystack = `${t(dict, item.q, item.qFallback)} ${t(dict, item.a, item.aFallback)}`.toLowerCase()
      return haystack.includes(needle)
    })
  }, [category, dict, query])

  return (
    <main className="sb-page" style={{ maxWidth: 980 }}>
      <section className="hero-panel" style={{ padding: 28, marginBottom: 18 }}>
        <div className="sb-kicker">❓ {t(dict, 'faq.kicker', 'Help center')}</div>
        <h1 className="sb-title" style={{ marginBottom: 8 }}>{t(dict, 'faq.title', 'Frequently asked questions')}</h1>
        <p className="sb-subtitle" style={{ marginTop: 0 }}>{t(dict, 'faq.subtitle', 'Search localized answers, browse categories, or contact support when you need a human handoff.')}</p>
        <input
          className="sb-input"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={t(dict, 'faq.search', 'Search questions...')}
          style={{ width: '100%', padding: 14, marginTop: 14 }}
        />
      </section>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        <button className={category === 'all' ? 'sb-button-primary' : 'sb-button-ghost'} onClick={() => setCategory('all')}>{t(dict, 'faq.categories.all', 'All')}</button>
        {CATEGORIES.map(key => (
          <button key={key} className={category === key ? 'sb-button-primary' : 'sb-button-ghost'} onClick={() => setCategory(key)}>
            {t(dict, `faq.categories.${key}`, key)}
          </button>
        ))}
      </div>

      <section style={{ display: 'grid', gap: 12 }}>
        {rows.map(item => (
          <details key={item.q} className="hero-panel" style={{ padding: 18 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 900, fontSize: 17 }}>{t(dict, item.q, item.qFallback)}</summary>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>{t(dict, item.a, item.aFallback)}</p>
          </details>
        ))}
        {!rows.length && (
          <div className="hero-panel" style={{ padding: 18, color: 'var(--text-secondary)' }}>
            {t(dict, 'faq.empty', 'No answers matched your search.')}
          </div>
        )}
      </section>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 20 }}>
        <Link href="/support" className="sb-button-primary" style={{ textDecoration: 'none' }}>✉️ {t(dict, 'support.contact', 'Contact Support')}</Link>
        <Link href="/docs" className="sb-button-ghost" style={{ textDecoration: 'none' }}>📖 {t(dict, 'support.documentation', 'Documentation')}</Link>
      </div>
    </main>
  )
}
