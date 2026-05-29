'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import { orchestrate, type OrchestrationPlan } from '@/lib/orchestration'

type OrchestrationPanelProps = {
  module?: string
  compact?: boolean
}

export default function OrchestrationPanel({ module = 'global', compact = false }: OrchestrationPanelProps) {
  const { dict, lang } = useI18n()
  const [input, setInput] = useState('')
  const [remotePlan, setRemotePlan] = useState<OrchestrationPlan | null>(null)
  const localPlan = useMemo(() => orchestrate(input || module, { locale: lang, module }), [input, lang, module])
  const plan = remotePlan || localPlan

  async function runOrchestration() {
    if (!input.trim()) return
    try {
      const res = await fetch('/api/orchestration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, locale: lang, module }),
      })
      const data = await res.json()
      if (data.plan) setRemotePlan(data.plan)
    } catch {
      setRemotePlan(localPlan)
    }
  }

  return (
    <section className="sb-card" style={{ padding: compact ? 16 : 24, borderColor: 'rgba(34,211,238,.26)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'start' }}>
        <div>
          <span className="sb-eyebrow">{t(dict, 'orchestration.kicker', 'AI orchestration')}</span>
          <h2 className={compact ? 'sb-h3' : 'sb-h2'} style={{ marginTop: 8 }}>{t(dict, 'orchestration.title', 'Route the next action automatically')}</h2>
          <p className="sb-body" style={{ maxWidth: 720, fontSize: compact ? 13 : undefined }}>
            {t(dict, 'orchestration.subtitle', 'Intent Router, AI Mode Selector, Workflow Engine, Memory Layer, Operator Fallback, Unified API, and telemetry stay connected across every workspace.')}
          </p>
        </div>
        <Link href={plan.route.href} className="sb-button-primary">{t(dict, 'orchestration.openRoute', 'Open routed module')}</Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'minmax(240px,.8fr) minmax(260px,1.2fr)', gap: 16, marginTop: 16 }}>
        <div style={{ display: 'grid', gap: 10 }}>
          <label className="sb-caption" style={{ display: 'grid', gap: 8 }}>
            {t(dict, 'orchestration.inputLabel', 'Describe the outcome')}
            <textarea
              value={input}
              onChange={(event) => { setInput(event.target.value); setRemotePlan(null) }}
              rows={compact ? 3 : 5}
              placeholder={t(dict, 'orchestration.placeholder', 'Example: improve my website SEO and create follow-up campaign assets')}
              className="sb-input"
              style={{ borderRadius: 16, padding: 12, resize: 'vertical' }}
            />
          </label>
          <button type="button" className="sb-button-secondary" onClick={runOrchestration} style={{ cursor: 'pointer' }}>
            {t(dict, 'orchestration.run', 'Run orchestration')}
          </button>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <div className="sb-glass" style={{ padding: 16 }}>
            <span className="sb-caption">{t(dict, 'orchestration.intentRouter', 'Intent Router')}</span>
            <h3 className="sb-h3" style={{ margin: '6px 0' }}>{plan.route.intent} · {plan.route.mode}</h3>
            <p className="sb-caption">{t(dict, 'orchestration.confidence', 'Confidence')}: {Math.round(plan.route.confidence * 100)}% · {plan.route.reason}</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            {plan.workflow.slice(0, compact ? 3 : 5).map((step) => (
              <div key={step.stage} style={{ border: '1px solid rgba(255,255,255,.1)', borderRadius: 16, padding: 12, background: 'rgba(0,0,0,.18)' }}>
                <strong>{step.title}</strong>
                <p className="sb-caption" style={{ marginBottom: 0 }}>{step.description}</p>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
            <div className="sb-glass" style={{ padding: 12 }}><strong>{t(dict, 'orchestration.memory', 'Memory Layer')}</strong><p className="sb-caption">{plan.memory.map((item) => item.key).join(' · ')}</p></div>
            <div className="sb-glass" style={{ padding: 12 }}><strong>{t(dict, 'orchestration.operatorFallback', 'Operator Fallback')}</strong><p className="sb-caption">{plan.operatorFallback.enabled ? t(dict, 'common.enabled', 'Enabled') : t(dict, 'common.ready', 'Ready')}</p></div>
            <div className="sb-glass" style={{ padding: 12 }}><strong>{t(dict, 'orchestration.telemetry', 'Telemetry')}</strong><p className="sb-caption">{plan.telemetry.map((event) => event.event).join(' · ')}</p></div>
          </div>
        </div>
      </div>
    </section>
  )
}
