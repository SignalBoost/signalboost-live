'use client'

import { useCallback, useMemo, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { agencyFallback } from '@/lib/i18n/agencyCopy'

type Mode = 'download' | 'managed'
type Stage = 'IDLE' | 'REVIEWING_BUDGET' | 'PROCESSING_DEPOSIT' | 'PAYMENT_CONFIRMED' | 'DISPATCH_LOCKED' | 'SIMULATED_BROKER_DISPATCH' | 'COMPLETE' | 'ERROR'

const PROCESSING_RATE = 0.15

export default function PublicAgencyClient() {
  const { lang } = useI18n()
  const copy = useCallback((key: string) => agencyFallback(lang, key), [lang])
  const [mode, setMode] = useState<Mode>('download')
  const [budget, setBudget] = useState(500)
  const [consent, setConsent] = useState(false)
  const [stage, setStage] = useState<Stage>('IDLE')
  const [error, setError] = useState('')

  const processingFee = useMemo(() => Math.round(budget * PROCESSING_RATE * 100) / 100, [budget])
  const totalCharged = useMemo(() => Math.round((budget + processingFee) * 100) / 100, [budget, processingFee])

  const stageCopy: Record<Stage, string> = {
    IDLE: 'stageIdle',
    REVIEWING_BUDGET: 'stageReviewing',
    PROCESSING_DEPOSIT: 'stageProcessing',
    PAYMENT_CONFIRMED: 'stageConfirmed',
    DISPATCH_LOCKED: 'stageLocked',
    SIMULATED_BROKER_DISPATCH: 'stageSimulated',
    COMPLETE: 'stageComplete',
    ERROR: 'stageError',
  }

  async function reviewBudget() {
    setError('')
    if (!Number.isFinite(budget) || budget <= 0) {
      setError(copy('invalidBudget'))
      setStage('ERROR')
      return
    }
    if (mode === 'managed' && !consent) {
      setError(copy('consentRequired'))
      setStage('ERROR')
      return
    }
    setStage('REVIEWING_BUDGET')
    try {
      const response = await fetch('/api/agency/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selectedBudget: budget }) })
      const json = await response.json()
      if (!response.ok || !json?.ok) throw new Error('failed')
      setStage(mode === 'managed' ? 'DISPATCH_LOCKED' : 'COMPLETE')
    } catch {
      setError(copy('checkoutFailed'))
      setStage('ERROR')
    }
  }

  function simulateClearing() {
    setStage('PROCESSING_DEPOSIT')
    window.setTimeout(() => setStage('PAYMENT_CONFIRMED'), 500)
    window.setTimeout(() => setStage('SIMULATED_BROKER_DISPATCH'), 1000)
    window.setTimeout(() => setStage('COMPLETE'), 1500)
  }

  return (
    <section id="agency-client" className="sb-page-shell sb-section">
      <div className="sb-glass" style={{ padding: 28 }}>
        <span className="sb-eyebrow">{copy('modeTitle')}</span>
        <h2 className="sb-h2" style={{ marginTop: 10 }}>{copy('modeSubtitle')}</h2>
        <div className="sb-cta-row" style={{ marginTop: 20 }}>
          <button type="button" className={mode === 'download' ? 'sb-button-primary' : 'sb-button-secondary'} onClick={() => setMode('download')}>{copy('downloadMode')}</button>
          <button type="button" className={mode === 'managed' ? 'sb-button-primary' : 'sb-button-secondary'} onClick={() => setMode('managed')}>{copy('publishMode')}</button>
        </div>
        <label className="sb-caption" htmlFor="agency-budget" style={{ display: 'block', marginTop: 22 }}>{copy('budgetLabel')}</label>
        <input id="agency-budget" type="number" min="1" value={budget} onChange={(event) => setBudget(Number(event.target.value))} className="sb-input" style={{ maxWidth: 280 }} />
        <p className="sb-body">{copy('budgetHelp')}</p>
        <div className="sb-card" style={{ padding: 18 }}>
          <p className="sb-body">{copy('budgetLabel')}: ${budget.toFixed(2)}</p>
          <p className="sb-body">{copy('processingFee')}: ${processingFee.toFixed(2)}</p>
          <p className="sb-body" style={{ color: '#ffc300', fontWeight: 900 }}>{copy('totalCharged')}: ${totalCharged.toFixed(2)}</p>
        </div>
        {mode === 'managed' ? <label className="sb-body" style={{ display: 'flex', gap: 10 }}><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />{copy('legalConsent')}</label> : null}
        <p className="sb-caption">{copy(stageCopy[stage])}</p>
        {error ? <p className="sb-body" style={{ color: '#ff8080' }}>{error}</p> : null}
        <div className="sb-cta-row">
          <button type="button" className="sb-button-primary" onClick={reviewBudget}>{copy('reviewButton')}</button>
          {mode === 'managed' && stage === 'DISPATCH_LOCKED' ? <button type="button" className="sb-button-secondary" onClick={simulateClearing}>{copy('simulateButton')}</button> : null}
        </div>
      </div>
    </section>
  )
}
