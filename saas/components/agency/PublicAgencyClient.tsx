'use client'

import { useState } from 'react'
import type { AgencyCopy } from '@/lib/i18n/agencyCopy'

export const FREE_ORGANIC_MODE = true
export const ENTERPRISE_READY = true

type CheckoutResponse = {
  selectedBudget: number
  processingFee: number
  totalCharged: number
  currency: 'USD'
  status: 'CHECKOUT_READY' | 'STRIPE_CHECKOUT_READY'
  stripeCheckoutUrl?: string
  stripeConfigured?: boolean
}

type TenantCampaignProfile = {
  plan?: 'free' | 'starter' | 'pro' | 'enterprise'
  sponsoredEnterprise?: boolean
  corporateSponsored?: boolean
}

type PublicAgencyClientProps = {
  copy: AgencyCopy['client']
  tenantProfile?: TenantCampaignProfile
}

type Mode = 'download' | 'managed'
type ChannelMode = 'FREE_ORGANIC_MODE' | 'PROGRAMMATIC_ENTERPRISE'

const formatUsd = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

function hasEnterpriseAccess(tenantProfile?: TenantCampaignProfile) {
  return Boolean(tenantProfile?.sponsoredEnterprise || tenantProfile?.corporateSponsored || tenantProfile?.plan === 'enterprise')
}

export default function PublicAgencyClient({ copy, tenantProfile }: PublicAgencyClientProps) {
  const [selectedBudget, setSelectedBudget] = useState('5000')
  const [mode, setMode] = useState<Mode>('download')
  const [consent, setConsent] = useState(false)
  const [summary, setSummary] = useState<CheckoutResponse | null>(null)
  const [organicReady, setOrganicReady] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const enterpriseEnabled = ENTERPRISE_READY && hasEnterpriseAccess(tenantProfile)
  const channelMode: ChannelMode = enterpriseEnabled ? 'PROGRAMMATIC_ENTERPRISE' : 'FREE_ORGANIC_MODE'
  const organicChannels = Object.values(copy.organicChannels)
  const enterpriseChannels = Object.values(copy.enterpriseChannels)

  function prepareOrganic(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    setError('')
    setSummary(null)
    setOrganicReady(true)
  }

  async function requestCheckout(createStripeSession: boolean) {
    if (!enterpriseEnabled) {
      setError(copy.error)
      return
    }

    setLoading(true)
    setError('')
    setSummary(null)
    setOrganicReady(false)

    const budget = Number(selectedBudget)
    if (!Number.isFinite(budget) || budget <= 0 || (mode === 'managed' && !consent)) {
      setError(copy.error)
      setLoading(false)
      return
    }

    const response = await fetch('/api/agency/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ selectedBudget: budget, createStripeSession, mode, enterpriseReady: enterpriseEnabled, channelMode }),
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
    <section className="sb-page-shell sb-section" aria-label={copy.title} data-channel-mode={channelMode}>
      <div className="fathom-glass sb-glass" style={{ padding: 28, display: 'grid', gap: 18 }}>
        <div>
          <div className="sb-cta-row" style={{ marginBottom: 12 }}>
            <span className="sb-eyebrow">{copy.freeModeBadge}</span>
            <span className="sb-caption" style={{ color: enterpriseEnabled ? '#86efac' : '#fbbf24' }}>{copy.enterpriseReadyBadge}</span>
          </div>
          <h2 className="sb-h2">{copy.title}</h2>
          <p className="sb-body" style={{ maxWidth: 820 }}>{copy.body}</p>
        </div>

        <section className="sb-card" style={{ padding: 20 }}>
          <span className="sb-eyebrow">{copy.organicModeTitle}</span>
          <p className="sb-body">{copy.organicModeBody}</p>
          <h3 className="sb-h3">{copy.organicChannelsTitle}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
            {organicChannels.map((channel) => (
              <article key={channel.label} style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: 14 }}>
                <h4 className="sb-h3" style={{ margin: '0 0 6px', fontSize: 15 }}>{channel.label}</h4>
                <p className="sb-body" style={{ margin: 0, fontSize: 13 }}>{channel.description}</p>
              </article>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12, marginTop: 14 }}>
            <article style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: 14 }}>
              <h4 className="sb-h3" style={{ margin: '0 0 6px', fontSize: 15 }}>{copy.hmiApprovalTitle}</h4>
              <p className="sb-body" style={{ margin: 0, fontSize: 13 }}>{copy.hmiApprovalBody}</p>
            </article>
            <article style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: 14 }}>
              <h4 className="sb-h3" style={{ margin: '0 0 6px', fontSize: 15 }}>{copy.marketingAlertsTitle}</h4>
              <p className="sb-body" style={{ margin: 0, fontSize: 13 }}>{copy.marketingAlertsBody}</p>
            </article>
          </div>
          <button className="sb-button-primary" type="button" onClick={prepareOrganic} style={{ marginTop: 16 }}>{copy.organicSubmit}</button>
          {organicReady ? <p className="sb-body" style={{ color: '#86efac', marginBottom: 0 }}>{copy.organicReady}</p> : null}
        </section>

        {enterpriseEnabled ? (
          <section className="sb-card" style={{ padding: 20 }}>
            <span className="sb-eyebrow">{copy.enterpriseModeTitle}</span>
            <p className="sb-body">{copy.enterpriseModeBody}</p>
            <h3 className="sb-h3">{copy.enterpriseChannelsTitle}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
              {enterpriseChannels.map((channel) => (
                <article key={channel.label} style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: 14 }}>
                  <h4 className="sb-h3" style={{ margin: '0 0 6px', fontSize: 15 }}>{channel.label}</h4>
                  <p className="sb-body" style={{ margin: 0, fontSize: 13 }}>{channel.description}</p>
                </article>
              ))}
            </div>

            <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
              <span className="sb-caption">{copy.modeLabel}</span>
              <div className="sb-cta-row">
                <button type="button" className={mode === 'download' ? 'sb-button-primary' : 'sb-button-secondary'} onClick={() => setMode('download')}>{copy.downloadMode}</button>
                <button type="button" className={mode === 'managed' ? 'sb-button-primary' : 'sb-button-secondary'} onClick={() => setMode('managed')}>{copy.publishMode}</button>
              </div>
            </div>

            <form onSubmit={(event) => { event.preventDefault(); requestCheckout(false) }} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end', marginTop: 14 }}>
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
              <label className="sb-body" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', margin: '14px 0 0' }}>
                <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                <span>{copy.consentLabel}</span>
              </label>
            ) : null}
          </section>
        ) : (
          <section className="sb-card" style={{ padding: 20, borderColor: 'rgba(251,191,36,.28)' }}>
            <span className="sb-eyebrow">{copy.enterpriseReadyBadge}</span>
            <h3 className="sb-h3">{copy.enterpriseLockedTitle}</h3>
            <p className="sb-body" style={{ margin: 0 }}>{copy.enterpriseLockedBody}</p>
          </section>
        )}

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
            {enterpriseEnabled && mode === 'managed' ? <button className="sb-button-secondary" type="button" disabled={loading || !consent} onClick={() => requestCheckout(true)} style={{ marginTop: 16 }}>{copy.paymentSubmit}</button> : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
