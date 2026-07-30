'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import {
  outreachDeliveryCopyFor,
  type OutreachDeliveryCopy,
} from '@/lib/i18n/outreachReleaseCopy'

const panel: CSSProperties = {
  border: '1px solid rgba(255,255,255,.1)',
  borderRadius: 18,
  background: 'rgba(15,23,42,.72)',
  padding: 18,
}
const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))',
  gap: 12,
}

export default function OutreachDeliveryPage() {
  const { lang } = useI18n()
  const copy = outreachDeliveryCopyFor(lang)
  const [selftest, setSelftest] = useState<any>(null)
  const [delivery, setDelivery] = useState<any>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const [stateResponse, deliveryResponse] = await Promise.all([
        fetch('/api/admin/outreach/selftest', { cache: 'no-store' }),
        fetch('/api/admin/outreach/delivery-check?limit=25', { cache: 'no-store' }),
      ])
      const [state, provider] = await Promise.all([
        stateResponse.json(),
        deliveryResponse.json(),
      ])
      if (!stateResponse.ok || !state?.ok) throw new Error(state?.error || copy.loadError)
      if (!deliveryResponse.ok || !provider?.ok) throw new Error(provider?.error || copy.loadError)
      setSelftest(state)
      setDelivery(provider)
    } catch (reason: any) {
      setError(reason?.message || copy.loadError)
    } finally {
      setBusy(false)
    }
  }, [copy.loadError])

  useEffect(() => {
    void load()
  }, [load])

  const databaseCards = [
    [copy.historicalSends, selftest?.outreachSendsRows ?? 0],
    [copy.queueSent, selftest?.sentQueueRows ?? 0],
    [copy.approvedWaiting, selftest?.approvedDrafts ?? 0],
    [copy.deliveryEvents, selftest?.deliveryEventRows ?? 0],
    [copy.replyRows, selftest?.replyRows ?? 0],
  ]
  const providerCards = [
    [copy.checked, delivery?.checked ?? 0],
    [copy.accepted, delivery?.summary?.sentOrAccepted ?? 0],
    [copy.delivered, delivery?.summary?.delivered ?? 0],
    [copy.opened, delivery?.summary?.opened ?? 0],
    [copy.clicked, delivery?.summary?.clicked ?? 0],
    [copy.bounced, delivery?.summary?.bounced ?? 0],
    [copy.complained, delivery?.summary?.complained ?? 0],
  ]

  return (
    <main style={{ color: 'var(--text-primary)', display: 'grid', gap: 18, paddingBottom: 70 }}>
      <header className="sb-console">
        <span className="sb-eyebrow">📬 {copy.eyebrow}</span>
        <h1 className="sb-h2" style={{ marginTop: 8 }}>{copy.title}</h1>
        <p className="sb-body" style={{ maxWidth: 920 }}>{copy.subtitle}</p>
        <div className="sb-cta-row" style={{ marginTop: 14 }}>
          <button type="button" className="sb-button-primary" disabled={busy} onClick={() => void load()}>{busy ? copy.refreshing : copy.refresh}</button>
          <Link href="/admin/outreach" className="sb-button-secondary">{copy.back}</Link>
        </div>
      </header>

      {error ? <div style={{ ...panel, borderColor: 'rgba(252,165,165,.5)', color: '#fca5a5' }}>{error}</div> : null}

      <section style={panel}>
        <h2 className="sb-h3">{copy.database}</h2>
        <div style={grid}>
          {databaseCards.map(([label, value]) => <Metric key={String(label)} label={String(label)} value={value} />)}
        </div>
        <div style={{ ...grid, marginTop: 12 }}>
          <Config label={copy.resendKey} ok={Boolean(selftest?.resendKeyConfigured)} copy={copy} />
          <Config label={copy.webhook} ok={Boolean(selftest?.resendWebhookConfigured)} copy={copy} />
          <Config label={copy.replyTo} ok={Boolean(selftest?.replyToConfigured)} copy={copy} />
        </div>
      </section>

      <section style={panel}>
        <h2 className="sb-h3">{copy.provider}</h2>
        <div style={grid}>
          {providerCards.map(([label, value]) => <Metric key={String(label)} label={String(label)} value={value} />)}
        </div>
        <p className="sb-caption" style={{ marginTop: 12 }}>
          {copy.reconciliation}: {delivery?.summary?.queueReconciled ?? 0} · {copy.fallback}: {delivery?.summary?.statusOnlyFallbacks ?? 0}
        </p>
      </section>

      <section style={panel}>
        {!busy && Array.isArray(delivery?.results) && delivery.results.length === 0 ? <p className="sb-body">{copy.noHistory}</p> : null}
        <div style={{ display: 'grid', gap: 10 }}>
          {(delivery?.results || []).map((row: any) => (
            <article key={row.outreachSendId} style={{ borderTop: '1px solid rgba(255,255,255,.09)', paddingTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <strong style={{ color: '#fff' }}>{row.subject || row.resendId || row.outreachSendId}</strong>
                  <p className="sb-caption" style={{ margin: '5px 0 0' }}>{copy.recipient}: {row.toEmail || '—'}</p>
                  <p className="sb-caption" style={{ margin: '3px 0 0' }}>{copy.sentAt}: {row.sentAt ? new Date(row.sentAt).toLocaleString() : '—'}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ display: 'inline-block', border: '1px solid rgba(125,211,252,.45)', borderRadius: 999, padding: '4px 10px', color: row.status === 'bounced' || row.status === 'complained' ? '#fca5a5' : '#7dd3fc', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>{row.status || copy.unknown}</span>
                  <p className="sb-caption" style={{ margin: '6px 0 0' }}>{copy.opens}: {row.openCount || 0} · {copy.clicks}: {row.clickCount || 0}</p>
                </div>
              </div>
              {row.error ? <p className="sb-caption" style={{ color: '#fca5a5', marginTop: 7 }}>{row.error}</p> : null}
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}

function Metric({ label, value }: { label: string; value: any }) {
  return (
    <div style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 14, padding: 13, background: 'rgba(2,6,23,.45)' }}>
      <b style={{ display: 'block', color: '#fff', fontSize: 25 }}>{value ?? 0}</b>
      <span className="sb-caption">{label}</span>
    </div>
  )
}

function Config({ label, ok, copy }: { label: string; ok: boolean; copy: OutreachDeliveryCopy }) {
  return (
    <div style={{ border: `1px solid ${ok ? 'rgba(134,239,172,.35)' : 'rgba(252,165,165,.35)'}`, borderRadius: 14, padding: 13 }}>
      <b style={{ display: 'block', color: ok ? '#86efac' : '#fca5a5' }}>{ok ? copy.configured : copy.missing}</b>
      <span className="sb-caption">{label}</span>
    </div>
  )
}
