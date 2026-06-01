'use client'

import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

const modules = [
  { title: 'Analyzer', icon: '🧠', color: 'var(--gold)', boxes: ['Source URL intake', 'Intent and urgency summary', 'Trust gap checklist'] },
  { title: 'Profiler', icon: '🧬', color: '#1af0ff', boxes: ['Business model fit', 'Buyer persona signals', 'Offer angle and objections'] },
  { title: 'Predictive Intelligence', icon: '🔮', color: '#a78bfa', boxes: ['Likely next need', 'Conversion moment', 'Risk and follow-up timing'] },
]

const stages = [
  ['Lead captured', 'Import a URL, marketplace partner, or CRM row with language and region context.'],
  ['Analyzer complete', 'AI summarizes the business, trust gaps, urgency, and useful proof points.'],
  ['Profiler complete', 'SignalBoost maps buyer fit, offer angle, objections, and recommended channel.'],
  ['Predictive score', 'Predictive Intelligence chooses timing, risk, and the next best action.'],
  ['Assets generated', 'Email, SMS, social, and landing copy are prepared in localized variants.'],
  ['Human approved', 'An operator reviews tone, compliance, links, and campaign destination before launch.'],
]

export default function OutreachPipelinePage() {
  const { dict } = useI18n()
  return (
    <main className="sb-page-shell sb-section">
      <section className="sb-glass" style={{ padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <span className="sb-eyebrow">{t(dict, 'outreach.pipeline.kicker', 'Outreach pipeline')}</span>
            <h1 className="sb-h1" style={{ marginTop: 10 }}>{t(dict, 'outreach.pipeline.title', 'Turn a lead into an approved campaign')}</h1>
            <p className="sb-body" style={{ maxWidth: 760 }}>{t(dict, 'outreach.pipeline.subtitle', 'Analyzer, Profiler, and Predictive Intelligence work together so every lead becomes a complete, human-approved campaign path.')}</p>
          </div>
          <Link className="sb-button-primary" href="/dashboard/outreach/outreach">{t(dict, 'outreach.pipeline.openEngine', 'Open outreach engine')}</Link>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginTop: 20 }} aria-label="Pipeline intelligence modules">
        {modules.map(module => (
          <article key={module.title} className="sb-card" style={{ padding: 22, borderColor: `${module.color}55`, minHeight: 260 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 34 }}>{module.icon}</span>
              <span className="sb-eyebrow" style={{ color: module.color }}>Live module</span>
            </div>
            <h2 className="sb-h3" style={{ marginTop: 16 }}>{module.title}</h2>
            <p className="sb-body" style={{ fontSize: 14 }}>{module.title === 'Analyzer' ? 'Reads public context and identifies the most useful campaign trigger.' : module.title === 'Profiler' ? 'Turns business context into audience, offer, and objection strategy.' : 'Predicts the action most likely to move the lead toward approval.'}</p>
            <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
              {module.boxes.map(box => <div key={box} className="sb-glass" style={{ padding: 12, fontSize: 13, overflowWrap: 'anywhere' }}>✓ {box}</div>)}
            </div>
          </article>
        ))}
      </section>

      <section className="sb-card" style={{ padding: 24, marginTop: 20 }}>
        <h2 className="sb-h2">{t(dict, 'outreach.pipeline.completePath', 'Complete approval path')}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 16 }}>
          {stages.map(([title, detail], index) => (
            <article key={title} style={{ border: '1px solid rgba(255,255,255,.1)', borderRadius: 18, padding: 14, background: 'rgba(0,0,0,.18)', minHeight: 150 }}>
              <strong style={{ color: '#ffc300', fontSize: 12, letterSpacing: '.12em' }}>STEP {index + 1}</strong>
              <h3 style={{ margin: '8px 0', fontSize: 17 }}>{title}</h3>
              <p className="sb-caption" style={{ margin: 0 }}>{detail}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
