'use client'

import { useTranslation } from '@/components/i18n/useTranslation'

// Shows a preview of the REAL generated website content before publishing.
// Backward compatible: still accepts the old plan-style fields if present.

export type OperatorSection = {
  type: string
  heading?: string
  body?: string
  cta?: string
  email?: string
  phone?: string
  items?: { title?: string; body?: string }[]
}

export type OperatorPlanView = {
  businessName?: string
  headline?: string
  tagline?: string
  colors?: { primary?: string; accent?: string; background?: string; text?: string }
  sections?: OperatorSection[]
  // legacy fields (optional, no longer required)
  id?: string
  summary?: string
  clarificationQuestion?: string
  steps?: string[]
  preview?: string[]
}

export default function OperatorPlan({ plan }: { plan: OperatorPlanView }) {
  const { t } = useTranslation()
  const colors = {
    primary: plan.colors?.primary || '#3b82f6',
    accent: plan.colors?.accent || '#ffc300',
    background: plan.colors?.background || '#ffffff',
    text: plan.colors?.text || '#1a1a1a',
  }
  const sections = Array.isArray(plan.sections) ? plan.sections : []

  return (
    <section className="hero-panel" style={{ marginTop: 16, padding: 22 }}>
      <h2 style={{ color: '#fff', marginTop: 0 }}>{t('operator.plan.previewTitle', 'Preview your website')}</h2>
      <p style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
        {t('operator.plan.previewSubtitle', 'This is the content I generated. Approve it to publish your site live.')}
      </p>

      {/* Color swatches */}
      <div style={{ display: 'flex', gap: 8, margin: '14px 0' }}>
        {(['primary', 'accent', 'background', 'text'] as const).map((k) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 18, height: 18, borderRadius: 5, background: (colors as any)[k], border: '1px solid rgba(255,255,255,.2)', display: 'inline-block' }} />
            <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{k}</span>
          </div>
        ))}
      </div>

      {/* Rendered preview in the site's own colors */}
      <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border-soft)', background: colors.background, color: colors.text }}>
        {(plan.businessName || plan.headline) && (
          <div style={{ padding: '28px 22px', background: `linear-gradient(135deg, ${colors.primary}, ${colors.accent})`, color: '#fff' }}>
            <div style={{ fontSize: 22, fontWeight: 900 }}>{plan.headline || plan.businessName}</div>
            {plan.tagline && <div style={{ fontSize: 14, opacity: 0.95, marginTop: 6 }}>{plan.tagline}</div>}
          </div>
        )}
        <div style={{ padding: '18px 22px' }}>
          {sections.map((s, i) => (
            <div key={i} style={{ marginBottom: 16 }}>
              {s.heading && <div style={{ fontWeight: 800, fontSize: 16, color: colors.primary, marginBottom: 4 }}>{s.heading}</div>}
              {s.body && <div style={{ fontSize: 14, lineHeight: 1.55, opacity: 0.85 }}>{s.body}</div>}
              {Array.isArray(s.items) && s.items.length > 0 && (
                <ul style={{ marginTop: 6 }}>
                  {s.items.map((it, j) => (
                    <li key={j} style={{ fontSize: 13, lineHeight: 1.5, opacity: 0.8 }}>
                      {it.title ? <strong>{it.title}: </strong> : null}{it.body}
                    </li>
                  ))}
                </ul>
              )}
              {(s.email || s.phone) && (
                <div style={{ fontSize: 13, marginTop: 4, color: colors.primary }}>
                  {s.email ? `✉ ${s.email}  ` : ''}{s.phone ? `☎ ${s.phone}` : ''}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
