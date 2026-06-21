'use client'

import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

const testimonials = [
  { name: 'Sarah K.', key: 't1' },
  { name: 'Marcus T.', key: 't2' },
  { name: 'Priya N.', key: 't3' },
]

export default function Testimonials() {
  const { dict } = useI18n()
  return (
    <section className="sb-page-shell sb-section" aria-label={t(dict, 'testimonials.eyebrow', 'Testimonials')}>
      <span className="sb-eyebrow">{t(dict, 'testimonials.eyebrow', 'Testimonials')}</span>
      <h2 className="sb-h2" style={{ marginTop: 10, marginBottom: 24 }}>{t(dict, 'testimonials.heading', 'Customers feel less clutter and more control.')}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        {testimonials.map(item => (
          <article key={item.name} className="sb-card" style={{ padding: 24 }}>
            <div style={{ color: 'var(--gold)', letterSpacing: 2, marginBottom: 12 }}>★★★★★</div>
            <p className="sb-body" style={{ fontSize: 15 }}>“{t(dict, `testimonials.${item.key}.text`, '')}”</p>
            <div style={{ color: '#fff', fontWeight: 800 }}>{item.name}</div>
            <div className="sb-caption">{t(dict, `testimonials.${item.key}.role`, '')}</div>
          </article>
        ))}
      </div>
    </section>
  )
}
