'use client'

// saas/components/audit/StripeReport.tsx
// Stripe / Payments Configuration report — presentational. Live vs test mode,
// price tiers (mismatches flagged), webhook endpoints, env→price mismatches, and
// stripe-category findings. Every label resolves through t('audit.stripe.*').
// Styling: inline fathom-glass, matching the other audit reports.

import type { CSSProperties, ReactNode } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { interpolate } from '@/lib/i18n/interpolate'
import { resolveFinding, type Finding, type AuditScore, type Severity } from '@/lib/audit/reportModel'

const GOLD = '#ffc300'
const CYAN = '#1af0ff'
const RED = '#fca5a5'
const ORANGE = '#fb923c'
const GREEN = '#86efac'
const GREY = 'rgba(255,255,255,.45)'

const glass: CSSProperties = {
  background: 'linear-gradient(160deg, rgba(15,23,42,.55), rgba(7,11,20,.65))',
  border: '1px solid rgba(255,255,255,.10)', borderRadius: 16,
  backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
}

const SEV_COLOR: Record<Severity, string> = {
  critical: RED, high: ORANGE, medium: GOLD, low: CYAN, info: GREY,
}

export type StripeReportView = {
  generatedAt: string
  configured: boolean
  liveMode: boolean
  tiers: { name: string; priceId: string; amount: number; interval: string; mismatch: boolean }[]
  webhooks: { url: string; status: string; events: number }[]
  mismatches: string[]
  findings: Finding[]
  score: AuditScore
  summary: { tiers: number; webhooks: number; mismatches: number; liveMode: boolean }
}

function money(amountMinor: number): string {
  const v = (amountMinor || 0) / 100
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function StripeReport({ data }: { data: StripeReportView }) {
  const { t } = useTranslation()
  const tt = (key: string, fallback: string, params?: Record<string, string | number>) =>
    interpolate(t(key, fallback), params)

  const s = data.summary

  return (
    <main style={{ padding: 24, color: '#fff', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em' }}>
          {t('audit.stripe.title', 'Payments Configuration Report')} <span style={{ color: GOLD }}>·</span>
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'rgba(255,255,255,.62)', maxWidth: 640, lineHeight: 1.5 }}>
          {t('audit.stripe.subtitle', 'Live mode, price tiers, webhook coverage, and price mismatches.')}
        </p>
      </div>

      {!data.configured && (
        <section style={{ ...glass, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: GOLD }}>
            {t('audit.stripe.notConfigured', 'Stripe is not connected, or its data could not be collected.')}
          </div>
        </section>
      )}

      {/* Summary stats */}
      <section style={{ ...glass, padding: 20, marginBottom: 16, display: 'flex', gap: 22, flexWrap: 'wrap' }}>
        <Stat label={t('audit.common.overallScore', 'Overall Readiness Score')} value={data.score.score} color={data.score.score >= 80 ? GREEN : data.score.score >= 60 ? GOLD : RED} />
        <Stat label={t('audit.stripe.summary.tiers', 'Price tiers')} value={s.tiers} />
        <Stat label={t('audit.stripe.summary.webhooks', 'Webhooks')} value={s.webhooks} color={s.webhooks ? undefined : ORANGE} />
        <Stat label={t('audit.stripe.summary.mismatches', 'Price mismatches')} value={s.mismatches} color={s.mismatches ? RED : GREEN} />
      </section>

      {/* Mode callout */}
      <section style={{ ...glass, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 10 }}>
          {t('audit.stripe.mode.title', 'Stripe mode')}
        </div>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: '#0a0e17', background: data.liveMode ? GREEN : GOLD, borderRadius: 999, padding: '3px 11px' }}>
          {data.liveMode ? t('audit.stripe.mode.live', 'Live mode') : t('audit.stripe.mode.test', 'Test mode')}
        </span>
      </section>

      {/* Tiers */}
      <section style={{ ...glass, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 10 }}>
          {t('audit.stripe.tiers.title', 'Price tiers')}
        </div>
        {data.tiers.length === 0 ? (
          <div style={{ fontSize: 13, color: GREY }}>{t('audit.stripe.tiers.empty', 'No price tiers collected.')}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'rgba(255,255,255,.5)' }}>
                  <Th>{t('audit.stripe.col.name', 'Tier')}</Th>
                  <Th>{t('audit.stripe.col.price', 'Price')}</Th>
                  <Th>{t('audit.stripe.col.interval', 'Interval')}</Th>
                  <Th>{t('audit.stripe.col.priceId', 'Price ID')}</Th>
                  <Th>{t('audit.stripe.col.status', 'Status')}</Th>
                </tr>
              </thead>
              <tbody>
                {data.tiers.map((tr, i) => (
                  <tr key={`${tr.priceId}:${i}`}>
                    <Td><span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{tr.name}</span></Td>
                    <Td><span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{money(tr.amount)}</span></Td>
                    <Td><span style={{ color: 'rgba(255,255,255,.65)' }}>{tr.interval || '—'}</span></Td>
                    <Td><span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11, color: 'rgba(255,255,255,.55)' }}>{tr.priceId || '—'}</span></Td>
                    <Td>
                      <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: '#0a0e17', background: tr.mismatch ? RED : GREEN, borderRadius: 999, padding: '2px 9px' }}>
                        {tr.mismatch ? t('audit.stripe.status.mismatch', 'Mismatch') : t('audit.stripe.status.ok', 'Active')}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Webhooks */}
      <section style={{ ...glass, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 10 }}>
          {t('audit.stripe.webhooks.title', 'Webhook endpoints')}
        </div>
        {data.webhooks.length === 0 ? (
          <div style={{ fontSize: 13, color: ORANGE }}>{t('audit.stripe.webhooks.empty', 'No webhook endpoints configured.')}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'rgba(255,255,255,.5)' }}>
                  <Th>{t('audit.stripe.col.endpoint', 'Endpoint')}</Th>
                  <Th>{t('audit.stripe.col.whStatus', 'Status')}</Th>
                  <Th>{t('audit.stripe.col.events', 'Events')}</Th>
                </tr>
              </thead>
              <tbody>
                {data.webhooks.map((w, i) => (
                  <tr key={`${w.url}:${i}`}>
                    <Td><span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11 }}>{w.url}</span></Td>
                    <Td><span style={{ color: /enabled|active/i.test(w.status) ? GREEN : ORANGE, fontWeight: 600 }}>{w.status || '—'}</span></Td>
                    <Td><span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{w.events}</span></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Findings */}
      <section style={{ ...glass, padding: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 12 }}>
          {tt('audit.stripe.findings.title', 'Findings ({n})', { n: data.findings.length })}
        </div>
        {data.findings.length === 0 ? (
          <div style={{ fontSize: 13, color: GREEN }}>{t('audit.stripe.findings.empty', 'No payments findings — nothing flagged.')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.findings.map((f, i) => (
              <FindingCard key={f.id || i} finding={f} />
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

function FindingCard({ finding }: { finding: Finding }) {
  const { t } = useTranslation()
  const text = resolveFinding(finding, t, interpolate)
  const color = SEV_COLOR[finding.severity] || GREY
  return (
    <div style={{ borderLeft: `3px solid ${color}`, paddingLeft: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: '#0a0e17', background: color, borderRadius: 999, padding: '2px 8px' }}>
          {t(`audit.severity.${finding.severity}`, finding.severity)}
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 700 }}>{text.title}</span>
      </div>
      <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.72)', lineHeight: 1.5 }}>{text.detail}</div>
      <div style={{ fontSize: 12, marginTop: 4 }}>
        <strong>{t('audit.common.recommendation', 'Recommendation')}:</strong>{' '}
        <span style={{ color: 'rgba(255,255,255,.78)' }}>{text.recommendation}</span>
      </div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || '#fff', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,.55)' }}>{label}</div>
    </div>
  )
}

function Th({ children }: { children: ReactNode }) {
  return <th style={{ padding: '8px 10px', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,.12)', whiteSpace: 'nowrap' }}>{children}</th>
}
function Td({ children }: { children: ReactNode }) {
  return <td style={{ padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,.06)', verticalAlign: 'top' }}>{children}</td>
}
