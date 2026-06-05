'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

const stages = [
  { key: 'analyzer', title: 'Analyzer', prompt: 'Who should SignalBoost understand first?', detail: 'Paste a public website, Google profile, or social page. AI summarizes the business and the human trigger to use.', accent: 'var(--gold)', href: '/dashboard/outreach/discovery' },
  { key: 'contacts', title: 'Contacts', prompt: 'Which analyzed leads are worth pursuing?', detail: 'Review AI-prepared leads and approve the ones that fit before any outreach goes out.', accent: '#1af0ff', href: '/dashboard/outreach/contacts' },
  { key: 'pipeline', title: 'Pipeline', prompt: 'Where is each prospect in the journey?', detail: 'Track prospects across discovered, contacted, replied, booked, and closed.', accent: '#7dd3fc', href: '/dashboard/outreach/pipeline' },
  { key: 'hub', title: 'Outreach hub', prompt: 'Want the full overview?', detail: 'Counts, recent leads, and quick access to every outreach tool in one place.', accent: '#86efac', href: '/dashboard/outreach' },
]

export default function OutreachEnginePage() {
  const router = useRouter()
  const { dict } = useI18n()
  const tr = (k: string, f: string) => t(dict, k, f)
  const [url, setUrl] = useState('')

  function analyze() {
    const value = url.trim()
    if (!value) { router.push('/dashboard/outreach/discovery'); return }
    // Hand off to the real Discovery analyzer with the URL prefilled.
    router.push(`/dashboard/outreach/discovery?url=${encodeURIComponent(value)}`)
  }

  return (
    <main className="sb-glass" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <span className="sb-eyebrow">{tr('engine.eyebrow', 'Outreach Engine')}</span>
          <h1 className="sb-h2" style={{ marginTop: 10 }}>{tr('engine.title', 'Turn a lead into an approved campaign.')}</h1>
          <p className="sb-body" style={{ maxWidth: 680 }}>{tr('engine.subtitle', 'Outreach is a human review journey: analyze, approve, track. Start below or jump into any step.')}</p>
        </div>
        <Link className="sb-button-primary" href="/dashboard/outreach/pipeline">{tr('engine.openPipeline', 'Open pipeline')}</Link>
      </div>

      <section className="sb-card" style={{ padding: 20, marginBottom: 24 }}>
        <label className="sb-eyebrow" htmlFor="lead-url">{tr('engine.start', 'Start with a lead')}</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 12, marginTop: 12 }}>
          <input
            id="lead-url"
            className="sb-input"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') analyze() }}
            placeholder={tr('engine.placeholder', 'Paste a business website or profile URL…')}
            style={{ borderRadius: 16, padding: 14 }}
          />
          <button className="sb-button-primary" type="button" onClick={analyze}>{tr('engine.analyze', 'Analyze lead')}</button>
        </div>
        <p className="sb-caption" style={{ marginTop: 10 }}>{tr('engine.help', 'This opens Discovery and runs the real analysis on the URL you enter.')}</p>
      </section>

      <section style={{ display: 'grid', gap: 16 }} aria-label="Outreach workflow">
        {stages.map((stage, index) => (
          <Link key={stage.key} href={stage.href} className="sb-card" style={{ padding: 20, display: 'grid', gridTemplateColumns: '72px minmax(0,1fr) auto', gap: 16, alignItems: 'center', textDecoration: 'none' }}>
            <div style={{ color: stage.accent, fontSize: 13, fontWeight: 950, letterSpacing: '.12em' }}>STEP {index + 1}</div>
            <div>
              <h2 className="sb-h3">{stage.title}</h2>
              <p style={{ color: '#fff', fontWeight: 800, margin: '10px 0 4px' }}>{stage.prompt}</p>
              <p className="sb-body" style={{ fontSize: 14, margin: 0 }}>{stage.detail}</p>
            </div>
            <span style={{ color: stage.accent, fontWeight: 800 }}>{tr('engine.open', 'Open →')}</span>
          </Link>
        ))}
      </section>
    </main>
  )
}
