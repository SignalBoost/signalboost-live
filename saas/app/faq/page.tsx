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
      <section style={{ borderBottom: '1px solid rgba(255,255,255,.09)', paddingBottom: 14, marginBottom: 14, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div className="sb-kicker">❓ {t(dict, 'faq.kicker', 'Help center')}</div>
          <h1 style={{ fontSize: 24, fontWeight: 950, letterSpacing: '-.04em', lineHeight: 1.1, margin: '4px 0 0' }}>{t(dict, 'faq.title', 'Frequently asked questions')}</h1>
        </div>
        <input
          className="sb-input"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={t(dict, 'faq.search', 'Search questions...')}
          style={{ flex: '1 1 260px', maxWidth: 360, padding: '11px 14px' }}
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

      <section style={{ display: 'grid', gap: 0 }}>
        {rows.map(item => (
          <details key={item.q} style={{ borderTop: '1px solid rgba(255,255,255,.08)', padding: '14px 0' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 900, fontSize: 15.5, listStyle: 'none' }}>{t(dict, item.q, item.qFallback)}</summary>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: 13.5, borderLeft: '2px solid rgba(255,195,0,.5)', paddingLeft: 14, margin: '10px 0 0' }}>{t(dict, item.a, item.aFallback)}</p>
          </details>
        ))}
        {!rows.length && (
          <div className="sb-empty">
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
