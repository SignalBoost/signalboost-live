'use client'

import { useState } from 'react'
import type { AgencyCopy } from '@/lib/i18n/agencyCopy'

type CheckoutResponse = {
  selectedBudget: number
  processingFee: number
  totalCharged: number
  currency: 'USD'
  status: 'CHECKOUT_READY' | 'STRIPE_CHECKOUT_READY'
  stripeCheckoutUrl?: string
  stripeConfigured?: boolean
}

type PublicAgencyClientProps = {
  copy: AgencyCopy['client']
}

type Mode = 'download' | 'managed'

const formatUsd = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

export default function PublicAgencyClient({ copy }: PublicAgencyClientProps) {
  const [selectedBudget, setSelectedBudget] = useState('5000')
  const [mode, setMode] = useState<Mode>('download')
  const [consent, setConsent] = useState(false)
  const [summary, setSummary] = useState<CheckoutResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function requestCheckout(createStripeSession: boolean) {
    setLoading(true)
    setError('')
    setSummary(null)

    const budget = Number(selectedBudget)
    if (!Number.isFinite(budget) || budget <= 0 || (mode === 'managed' && !consent)) {
      setError(copy.error)
      setLoading(false)
      return
    }

    const response = await fetch('/api/agency/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ selectedBudget: budget, createStripeSession, mode }),
    })

    if (!response.ok) {
      setError(copy.error)
      setLoading(false)
      return
    }

    const data = await response.json() as CheckoutResponse
    setSummary(data)
    setLoading(false)

    if (createStripeSession && data.stripeCheckoutUrl) {
      window.location.href = data.stripeCheckoutUrl
    }
  }

  return (
    <section className="sb-page-shell sb-section" aria-label={copy.title}>
      <div className="sb-glass" style={{ padding: 28, display: 'grid', gap: 18 }}>
        <div>
          <h2 className="sb-h2">{copy.title}</h2>
          <p className="sb-body" style={{ maxWidth: 760 }}>{copy.body}</p>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          <span className="sb-caption">{copy.modeLabel}</span>
          <div className="sb-cta-row">
            <button type="button" className={mode === 'download' ? 'sb-button-primary' : 'sb-button-secondary'} onClick={() => setMode('download')}>{copy.downloadMode}</button>
            <button type="button" className={mode === 'managed' ? 'sb-button-primary' : 'sb-button-secondary'} onClick={() => setMode('managed')}>{copy.publishMode}</button>
          </div>
        </div>

        <form onSubmit={(event) => { event.preventDefault(); requestCheckout(false) }} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: 8, minWidth: 240 }}>
            <span className="sb-caption">{copy.budgetLabel}</span>
            <input
              value={selectedBudget}
              onChange={(event) => setSelectedBudget(event.target.value)}
              type="number"
              min="1"
              step="0.01"
              style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,.18)', background: 'rgba(255,255,255,.08)', color: '#fff', padding: '12px 14px' }}
            />
          </label>
          <button className="sb-button-primary" type="submit" disabled={loading}>{copy.submit}</button>
        </form>

        {mode === 'managed' ? (
          <label className="sb-body" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', margin: 0 }}>
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span>{copy.consentLabel}</span>
          </label>
        ) : null}

        {error ? <p className="sb-body" style={{ color: '#fca5a5', margin: 0 }}>{error}</p> : null}
        {summary ? (
          <div className="sb-card" style={{ padding: 20 }}>
            <h3 className="sb-h3">{copy.summaryTitle}</h3>
            <p className="sb-body">{summary.status === 'STRIPE_CHECKOUT_READY' ? copy.paymentReady : copy.ready}</p>
            <p className="sb-caption">{copy.noBrokerDispatch}</p>
            {!summary.stripeConfigured ? <p className="sb-caption">{copy.stripeUnavailable}</p> : null}
            <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, margin: 0 }}>
              <div><dt className="sb-caption">{copy.selectedBudget}</dt><dd>{formatUsd(summary.selectedBudget)}</dd></div>
              <div><dt className="sb-caption">{copy.processingFee}</dt><dd>{formatUsd(summary.processingFee)}</dd></div>
              <div><dt className="sb-caption">{copy.totalCharged}</dt><dd>{formatUsd(summary.totalCharged)}</dd></div>
            </dl>
            {mode === 'managed' ? <button className="sb-button-secondary" type="button" disabled={loading || !consent} onClick={() => requestCheckout(true)} style={{ marginTop: 16 }}>{copy.paymentSubmit}</button> : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
