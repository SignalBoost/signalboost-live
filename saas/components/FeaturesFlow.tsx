'use client'

import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

const steps = [
  { number: '01', key: 's1' },
  { number: '02', key: 's2' },
  { number: '03', key: 's3' },
]

export default function FeaturesFlow() {
  const { dict } = useI18n()
  return (
    <section id="how-it-works" className="sb-section" style={{ borderTop: '1px solid var(--border-soft)', borderBottom: '1px solid var(--border-soft)' }}>
      <div className="sb-page-shell">
        <span className="sb-eyebrow">{t(dict, 'featuresFlow.eyebrow', 'Guided flow')}</span>
        <h2 className="sb-h2" style={{ marginTop: 10, marginBottom: 24 }}>{t(dict, 'featuresFlow.heading', 'From messy idea to approved campaign.')}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {steps.map(step => (
            <article key={step.number} className="sb-card" style={{ padding: 24 }}>
              <div style={{ color: 'var(--gold)', fontWeight: 950, fontSize: 44, lineHeight: 1 }}>{step.number}</div>
              <h3 className="sb-h3" style={{ marginTop: 16 }}>{t(dict, `featuresFlow.${step.key}.title`, '')}</h3>
              <p className="sb-body" style={{ fontSize: 14, marginBottom: 0 }}>{t(dict, `featuresFlow.${step.key}.description`, '')}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
