'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import { orchestrate, type OrchestrationPlan, type WorkflowStep } from '@/lib/orchestration'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


type OrchestrationPanelProps = {
  module?: string
  compact?: boolean
}

function localizedStep(step: WorkflowStep, dict: any) {
  return {
    ...step,
    title: t(dict, `orchestration.workflow.${step.stage}.title`, step.title),
    description: t(dict, `orchestration.workflow.${step.stage}.description`, step.description),
  }
}

export default function OrchestrationPanel({ module = 'global', compact = false }: OrchestrationPanelProps) {
  const { dict, lang } = useI18n()
  const [input, setInput] = useState('')
  const [remotePlan, setRemotePlan] = useState<OrchestrationPlan | null>(null)

  const localPlan = useMemo(
    () => orchestrate(input || module, { locale: lang, module }),
    [input, lang, module],
  )

  const plan = remotePlan || localPlan

  const localizedWorkflow = plan.workflow
    .slice(0, compact ? 3 : 5)
    .map((step) => localizedStep(step, dict))

  async function runOrchestration() {
    if (!input.trim()) return

    try {
      const res = await fetch('/api/orchestration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, locale: lang, module }),
      })

      const data = await res.json()

      if (data.plan) {
        setRemotePlan(data.plan)
      }
    } catch {
      setRemotePlan(localPlan)
    }
  }

  return (
    <section className="sb-card" style={{ borderTop: '1px solid rgba(34,211,238,.25)', paddingTop: compact ? 16 : 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'start' }}>
        <div>
          <span className="sb-eyebrow">
            {t(dict, 'orchestration.kicker', uiCopy('u_26e282e51f94a0b8'))}
          </span>

          <h2 className={compact ? 'sb-h3' : 'sb-h2'} style={{ marginTop: 8 }}>
            {t(dict, 'orchestration.title', uiCopy('u_c2a4ee145d14d40a'))}
          </h2>

          <p className="sb-body" style={{ maxWidth: 720, fontSize: compact ? 13 : undefined }}>
            {t(
              dict,
              'orchestration.subtitle',
              uiCopy('u_4b99963499763af9'),
            )}
          </p>
        </div>

        <Link href={plan.route.href} className="sb-button-primary">
          {t(dict, 'orchestration.openRoute', uiCopy('u_cbd23549cb6fe769'))}
        </Link>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: compact ? '1fr' : 'minmax(240px,.8fr) minmax(260px,1.2fr)',
          gap: 16,
          marginTop: 16,
        }}
      >
        <div style={{ display: 'grid', gap: 10 }}>
          <label className="sb-caption" style={{ display: 'grid', gap: 8 }}>
            {t(dict, 'orchestration.inputLabel', uiCopy('u_e144cd8ab3866804'))}

            <textarea
              value={input}
              onChange={(event) => {
                setInput(event.target.value)
                setRemotePlan(null)
              }}
              rows={compact ? 3 : 5}
              placeholder={t(
                dict,
                'orchestration.placeholder',
                uiCopy('u_20fb2071b4712965'),
              )}
              className="sb-input"
              style={{ borderRadius: 16, padding: 12, resize: 'vertical' }}
            />
          </label>

          <button type="button" className="sb-button-secondary" onClick={runOrchestration} style={{ cursor: 'pointer' }}>
            {t(dict, 'orchestration.run', uiCopy('u_b86b88f631993df9'))}
          </button>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ borderTop: '1px solid rgba(34,211,238,.25)', borderLeft: '2px solid rgba(34,211,238,.4)', padding: '12px 0 12px 14px', marginTop: 4 }}>
            <span className="sb-caption">
              {t(dict, 'orchestration.intentRouter', uiCopy('u_e214949aa7ab95c0'))}
            </span>

            <h3 className="sb-h3" style={{ margin: '6px 0' }}>
              {plan.route.intent} · {plan.route.mode}
            </h3>

            <p className="sb-caption">
              {t(dict, 'orchestration.confidence', uiCopy('u_c636be93e0e3fd42'))}: {Math.round(plan.route.confidence * 100)}%
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            {localizedWorkflow.map((step) => (
              <div
                key={step.stage}
                style={{
                  border: '1px solid rgba(255,255,255,.1)',
                  borderRadius: 16,
                  padding: 12,
                  background: 'rgba(0,0,0,.18)',
                }}
              >
                <strong>{step.title}</strong>
                <p className="sb-caption" style={{ marginBottom: 0 }}>
                  {step.description}
                </p>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
            <div style={{ borderTop: '1px solid rgba(255,255,255,.08)', borderLeft: '2px solid rgba(34,211,238,.3)', padding: '10px 0 10px 14px' }}>
              <strong>{t(dict, 'orchestration.memory', uiCopy('u_1a69b47730c916e5'))}</strong>
              <p className="sb-caption">{plan.memory.map((item) => item.key).join(' · ')}</p>
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,.08)', borderLeft: '2px solid rgba(34,211,238,.3)', padding: '10px 0 10px 14px' }}>
              <strong>{t(dict, 'orchestration.operatorFallback', uiCopy('u_457a22dd64199323'))}</strong>
              <p className="sb-caption">
                {plan.operatorFallback.enabled
                  ? t(dict, 'common.enabled', uiCopy('u_01de9832a37103ee'))
                  : t(dict, 'common.ready', uiCopy('u_f8a7d02b458030d9'))}
              </p>
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,.08)', borderLeft: '2px solid rgba(34,211,238,.3)', padding: '10px 0 10px 14px' }}>
              <strong>{t(dict, 'orchestration.telemetry', uiCopy('u_9df178583d9eeda2'))}</strong>
              <p className="sb-caption">{plan.telemetry.map((event) => event.event).join(' · ')}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
