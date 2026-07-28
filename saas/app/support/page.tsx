'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


const SUPPORT_EMAIL = 'support@signalboostapp.com'

export default function SupportPage() {
  const { dict, lang } = useI18n()
  const [topic, setTopic] = useState('')
  const [details, setDetails] = useState('')

  const mailto = useMemo(() => {
    const subject = encodeURIComponent(topic || t(dict, 'support.defaultSubject', uiCopy('u_bb5991810caa14a0')))
    const body = encodeURIComponent(`${details}\n\nLanguage: ${lang}\nPage: /support`)
    return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`
  }, [details, dict, lang, topic])

  return (
    <main className="sb-page" style={{ maxWidth: 980 }}>
      <section className="hero-panel" style={{ padding: 28 }}>
        <div className="sb-kicker">✉️ {t(dict, 'support.kicker', uiCopy('u_46945403911460e5'))}</div>
        <h1 className="sb-title" style={{ marginBottom: 8 }}>{t(dict, 'support.title', uiCopy('u_8b01552c297a0ad6'))}</h1>
        <p className="sb-subtitle" style={{ marginTop: 0 }}>{t(dict, 'support.subtitle', uiCopy('u_c63ccdebe7a17e35'))}</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, margin: '22px 0' }}>
          <Link href="/faq" className="hero-panel" style={{ padding: 16, textDecoration: 'none', color: '#fff' }}>❓ <strong>{t(dict, 'support.faq', uiCopy('u_243eb60a9a2c1b94'))}</strong><br /><span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t(dict, 'support.faqDesc', uiCopy('u_374a2c0fc0f40e97'))}</span></Link>
          <Link href="/docs" className="hero-panel" style={{ padding: 16, textDecoration: 'none', color: '#fff' }}>📖 <strong>{t(dict, 'support.documentation', uiCopy('u_ae561bf85eda3e1e'))}</strong><br /><span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t(dict, 'support.docsDesc', uiCopy('u_882adeb48cb62939'))}</span></Link>
          <a href={mailto} className="hero-panel" style={{ padding: 16, textDecoration: 'none', color: '#fff' }}>✉️ <strong>{t(dict, 'support.email', uiCopy('u_a7e3059b5c815e04'))}</strong><br /><span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{SUPPORT_EMAIL}</span></a>
        </div>

        <label style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
          <span style={{ fontWeight: 800 }}>{t(dict, 'support.topic', uiCopy('u_ddcc47e4667ac461'))}</span>
          <input className="sb-input" value={topic} onChange={event => setTopic(event.target.value)} placeholder={t(dict, 'support.topicPlaceholder', uiCopy('u_2af8c421cda44c82'))} style={{ padding: 12 }} />
        </label>
        <label style={{ display: 'grid', gap: 8 }}>
          <span style={{ fontWeight: 800 }}>{t(dict, 'support.details', uiCopy('u_e365143f4b633d3f'))}</span>
          <textarea className="sb-input" value={details} onChange={event => setDetails(event.target.value)} placeholder={t(dict, 'support.detailsPlaceholder', uiCopy('u_6fdd92ccbe690583'))} rows={6} style={{ padding: 12, resize: 'vertical' }} />
        </label>
        <a href={mailto} className="sb-button-primary" style={{ textDecoration: 'none', display: 'inline-flex', marginTop: 16 }}>✉️ {t(dict, 'support.send', uiCopy('u_97ec249201c163f2'))}</a>
      </section>
    </main>
  )
}
