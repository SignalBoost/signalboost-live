'use client'

// saas/components/hub/FailureCard.tsx
//
// MODULE 5 — FAILURE CARD (SignalBoost AI Operator) — render layer.
// Renders the FailureCard model from console-core through t(). All chrome text is
// localized (en/es/pt/pl/ru, English fallback); the provider error is shown EXACTLY
// as returned, never translated. Buttons come from the model's availableActions /
// overrideActions — this component decides nothing about what is allowed.

import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import {
  FAILURE_CARD_KEYS as K,
  type FailureCard as FailureCardModel,
  type FailureAction,
  type OverrideAction,
} from '@/console-core/operator/failureCard'

const NAVY = 'linear-gradient(160deg, #0a1830 0%, #0d1f3d 100%)'
const GOLD = '#ffc300'
const CYAN = '#1af0ff'
const DANGER = '#ff5c6c'
const HAIRLINE = 'rgba(255,255,255,0.08)'
const MUTED = 'rgba(255,255,255,0.55)'

export default function FailureCard({
  card,
  onAction,
  onOverride,
}: {
  card: FailureCardModel
  onAction: (action: FailureAction) => void
  onOverride: (action: OverrideAction) => void
}) {
  const { dict } = useI18n()
  const [showLogs, setShowLogs] = useState(false)

  const actionLabel = (a: FailureAction): string => {
    const m = K.action[a]
    return t(dict, m.key, m.en)
  }
  const overrideLabel = (o: OverrideAction): string => {
    const m = K.override[o]
    return t(dict, m.key, m.en)
  }

  return (
    <div style={{ background: NAVY, border: `1px solid ${HAIRLINE}`, borderRadius: 12, overflow: 'hidden', color: '#fff', fontSize: 14 }}>
      {/* Header (§2) */}
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${HAIRLINE}`, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: 99, background: DANGER, boxShadow: `0 0 10px ${DANGER}` }} />
        <strong style={{ color: GOLD, letterSpacing: 0.3 }}>{t(dict, K.header.key, K.header.en)}</strong>
      </div>

      <div style={{ padding: 18, display: 'grid', gap: 14 }}>
        {/* Identity */}
        <div style={{ fontFamily: 'monospace', fontSize: 12, color: MUTED, display: 'grid', gap: 2 }}>
          <span>{card.stepName} · {card.stepId}</span>
          <span>{card.provider} · {card.template}</span>
        </div>

        {/* Provider error — EXACT, verbatim (§4) */}
        <Section title={t(dict, K.providerErrorLabel.key, K.providerErrorLabel.en)}>
          <pre style={{ margin: 0, padding: 12, background: 'rgba(0,0,0,0.35)', border: `1px solid ${HAIRLINE}`, borderRadius: 8, color: CYAN, fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {card.providerError}
          </pre>
        </Section>

        {/* Likely cause (§5) */}
        <Section title={t(dict, K.likelyCauseLabel.key, K.likelyCauseLabel.en)}>
          <p style={{ margin: 0 }}>{card.likelyCause}</p>
        </Section>

        {/* Recommended fix (§6) */}
        <Section title={t(dict, K.recommendedFixLabel.key, K.recommendedFixLabel.en)}>
          <p style={{ margin: 0 }}>{card.recommendedFix}</p>
        </Section>

        {/* Rollback (§7) */}
        <Section title={t(dict, K.rollbackLabel.key, K.rollbackLabel.en)}>
          <p style={{ margin: 0, color: card.rollbackPossible ? CYAN : DANGER }}>
            {card.rollbackPossible
              ? t(dict, K.rollbackYes.key, K.rollbackYes.en)
              : t(dict, K.rollbackNo.key, K.rollbackNo.en)}
          </p>
          {card.rollbackNotes ? <p style={{ margin: '6px 0 0', color: MUTED }}>{card.rollbackNotes}</p> : null}
        </Section>

        {/* Action buttons (§8) */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {card.availableActions.map(a => (
            <button
              key={a}
              onClick={() => onAction(a)}
              style={{
                padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
                border: `1px solid ${a === 'abort_runbook' ? DANGER : HAIRLINE}`,
                background: a === 'retry' ? GOLD : 'transparent',
                color: a === 'retry' ? '#0a1830' : a === 'abort_runbook' ? DANGER : '#fff',
                fontWeight: a === 'retry' ? 700 : 500,
              }}
            >
              {actionLabel(a)}
            </button>
          ))}
        </div>

        {/* Logs & diagnostics (§9) — secrets already redacted by the model */}
        <div style={{ borderTop: `1px solid ${HAIRLINE}`, paddingTop: 12 }}>
          <button
            onClick={() => setShowLogs(v => !v)}
            style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', padding: 0, fontSize: 12 }}
          >
            {showLogs ? '▾' : '▸'} {t(dict, K.logsLabel.key, K.logsLabel.en)}
          </button>
          {showLogs && (
            <pre style={{ marginTop: 8, padding: 12, maxHeight: 240, overflow: 'auto', background: 'rgba(0,0,0,0.35)', border: `1px solid ${HAIRLINE}`, borderRadius: 8, fontFamily: 'monospace', fontSize: 11, color: MUTED }}>
              {JSON.stringify(card.logs, null, 2)}
            </pre>
          )}
        </div>

        {/* Human override (§10) — only present when the model granted it (admin/owner) */}
        {card.overrideActions.length > 0 && (
          <div style={{ borderTop: `1px solid ${HAIRLINE}`, paddingTop: 12 }}>
            <div style={{ color: GOLD, fontSize: 12, marginBottom: 8, letterSpacing: 0.3 }}>
              {t(dict, K.overrideLabel.key, K.overrideLabel.en)}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {card.overrideActions.map(o => (
                <button
                  key={o}
                  onClick={() => onOverride(o)}
                  className="sb-button-ghost"
                  style={{ padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, border: `1px dashed ${GOLD}`, background: 'transparent', color: GOLD }}
                >
                  {overrideLabel(o)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  )
}
