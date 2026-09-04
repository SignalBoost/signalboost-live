'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
const SUPPORT_EMAIL = 'saascontact@signalboostapp.com'

export default function SupportPage() {
  const { dict, lang } = useI18n()
  const [topic, setTopic] = useState('')
  const [details, setDetails] = useState('')

  const mailto = useMemo(() => {
    const subject = encodeURIComponent(topic || t(dict, 'support.defaultSubject'))
    const body = encodeURIComponent(`${details}\n\nLanguage: ${lang}\nPage: /support`)
    return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`
  }, [details, dict, lang, topic])

  return (
    <main className="sb-page" style={{ maxWidth: 980 }}>
      <section className="hero-panel" style={{ padding: 28 }}>
        <div className="sb-kicker">✉️ {t(dict, 'support.kicker')}</div>
        <h1 className="sb-title" style={{ marginBottom: 8 }}>{t(dict, 'support.title')}</h1>
        <p className="sb-subtitle" style={{ marginTop: 0 }}>{t(dict, 'support.subtitle')}</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, margin: '22px 0' }}>
          <Link href="/faq" className="hero-panel" style={{ padding: 16, textDecoration: 'none', color: '#fff' }}>❓ <strong>{t(dict, 'support.faq')}</strong><br /><span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t(dict, 'support.faqDesc')}</span></Link>
          <Link href="/docs" className="hero-panel" style={{ padding: 16, textDecoration: 'none', color: '#fff' }}>📖 <strong>{t(dict, 'support.documentation')}</strong><br /><span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t(dict, 'support.docsDesc')}</span></Link>
          <a href={mailto} className="hero-panel" style={{ padding: 16, textDecoration: 'none', color: '#fff' }}>✉️ <strong>{t(dict, 'support.email')}</strong><br /><span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{SUPPORT_EMAIL}</span></a>
        </div>

        <label style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
          <span style={{ fontWeight: 800 }}>{t(dict, 'support.topic')}</span>
          <input className="sb-input" value={topic} onChange={event => setTopic(event.target.value)} placeholder={t(dict, 'support.topicPlaceholder')} style={{ padding: 12 }} />
        </label>
        <label style={{ display: 'grid', gap: 8 }}>
          <span style={{ fontWeight: 800 }}>{t(dict, 'support.details')}</span>
          <textarea className="sb-input" value={details} onChange={event => setDetails(event.target.value)} placeholder={t(dict, 'support.detailsPlaceholder')} rows={6} style={{ padding: 12, resize: 'vertical' }} />
        </label>
        <a href={mailto} className="sb-button-primary" style={{ textDecoration: 'none', display: 'inline-flex', marginTop: 16 }}>✉️ {t(dict, 'support.send')}</a>
      </section>
    </main>
  )
}
