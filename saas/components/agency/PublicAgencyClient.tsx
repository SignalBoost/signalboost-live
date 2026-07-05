'use client'

import { useState } from 'react'
import type { AgencyCopy } from '@/lib/i18n/agencyCopy'

type CheckoutResponse = {
  selectedBudget: number
  processingFee: number
  totalCharged: number
  currency: 'USD'
  status: 'CHECKOUT_READY'
}

type PublicAgencyClientProps = {
  copy: AgencyCopy['client']
}

const formatUsd = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

export default function PublicAgencyClient({ copy }: PublicAgencyClientProps) {
  const [selectedBudget, setSelectedBudget] = useState('5000')
  const [summary, setSummary] = useState<CheckoutResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')
    setSummary(null)

    const budget = Number(selectedBudget)
    if (!Number.isFinite(budget) || budget <= 0) {
      setError(copy.error)
      setLoading(false)
      return
    }

    const response = await fetch('/api/agency/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ selectedBudget: budget }),
    })

    if (!response.ok) {
      setError(copy.error)
      setLoading(false)
      return
    }

    setSummary(await response.json())
    setLoading(false)
  }

  return (
    <section className="sb-page-shell sb-section" aria-label={copy.title}>
      <div className="sb-glass" style={{ padding: 28, display: 'grid', gap: 18 }}>
        <div>
          <h2 className="sb-h2">{copy.title}</h2>
          <p className="sb-body" style={{ maxWidth: 760 }}>{copy.body}</p>
        </div>
        <form onSubmit={onSubmit} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
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
        {error ? <p className="sb-body" style={{ color: '#fca5a5', margin: 0 }}>{error}</p> : null}
        {summary ? (
          <div className="sb-card" style={{ padding: 20 }}>
            <h3 className="sb-h3">{copy.summaryTitle}</h3>
            <p className="sb-body">{copy.ready}</p>
            <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, margin: 0 }}>
              <div><dt className="sb-caption">{copy.selectedBudget}</dt><dd>{formatUsd(summary.selectedBudget)}</dd></div>
              <div><dt className="sb-caption">{copy.processingFee}</dt><dd>{formatUsd(summary.processingFee)}</dd></div>
              <div><dt className="sb-caption">{copy.totalCharged}</dt><dd>{formatUsd(summary.totalCharged)}</dd></div>
            </dl>
          </div>
        ) : null}
      </div>
    </section>
  )
}
