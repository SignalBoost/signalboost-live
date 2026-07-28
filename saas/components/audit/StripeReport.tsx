'use client'

// saas/components/audit/StripeReport.tsx
// Stripe / Payments Configuration report — read-only. Live vs test mode,
// price tiers, webhook endpoints, env→price mismatches, and findings. Remediation
// is handled only by the Audit Console's single run-level approval.

import type { CSSProperties, ReactNode } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { interpolate } from '@/lib/i18n/interpolate'
import { resolveFinding, type Finding, type AuditScore, type Severity } from '@/lib/audit/reportModel'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


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
          {t('audit.stripe.title', uiCopy('u_fcbec6881437e835'))} <span style={{ color: GOLD }}>·</span>
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'rgba(255,255,255,.62)', maxWidth: 640, lineHeight: 1.5 }}>
          {t('audit.stripe.subtitle', uiCopy('u_7d9a58392d77f08b'))}
        </p>
      </div>

      {!data.configured && (
        <section style={{ ...glass, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: GOLD }}>
            {t('audit.stripe.notConfigured', uiCopy('u_0c6d1bead6fda4b2'))}
          </div>
        </section>
      )}

      <section style={{ ...glass, padding: 20, marginBottom: 16, display: 'flex', gap: 22, flexWrap: 'wrap' }}>
        <Stat label={t('audit.common.overallScore', uiCopy('u_e4172e5fcbe42b30'))} value={data.score.score} color={data.score.score >= 80 ? GREEN : data.score.score >= 60 ? GOLD : RED} />
        <Stat label={t('audit.stripe.summary.tiers', uiCopy('u_1a60d9bcb18891e9'))} value={s.tiers} />
        <Stat label={t('audit.stripe.summary.webhooks', uiCopy('u_e06ac6f5266c77c1'))} value={s.webhooks} color={s.webhooks ? undefined : ORANGE} />
        <Stat label={t('audit.stripe.summary.mismatches', uiCopy('u_458862f0fbdfaff3'))} value={s.mismatches} color={s.mismatches ? RED : GREEN} />
      </section>

      <section style={{ ...glass, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 10 }}>
          {t('audit.stripe.mode.title', uiCopy('u_e79da0142e4451dd'))}
        </div>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: '#0a0e17', background: data.liveMode ? GREEN : GOLD, borderRadius: 999, padding: '3px 11px' }}>
          {data.liveMode ? t('audit.stripe.mode.live', uiCopy('u_68d3a0e5746c5447')) : t('audit.stripe.mode.test', uiCopy('u_7ce500d8220c5004'))}
        </span>
      </section>

      <section style={{ ...glass, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 10 }}>
          {t('audit.stripe.tiers.title', uiCopy('u_420e545ffec33ef5'))}
        </div>
        {data.tiers.length === 0 ? (
          <div style={{ fontSize: 13, color: GREY }}>{t('audit.stripe.tiers.empty', uiCopy('u_5402e4e41ea34621'))}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'rgba(255,255,255,.5)' }}>
                  <Th>{t('audit.stripe.col.name', uiCopy('u_af1c25e607fbb9c2'))}</Th>
                  <Th>{t('audit.stripe.col.price', uiCopy('u_043a57f4db9bcf72'))}</Th>
                  <Th>{t('audit.stripe.col.interval', uiCopy('u_8ad85b2c071af911'))}</Th>
                  <Th>{t('audit.stripe.col.priceId', uiCopy('u_4effe25237192168'))}</Th>
                  <Th>{t('audit.stripe.col.status', uiCopy('u_813844918480a81d'))}</Th>
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
                        {tr.mismatch ? t('audit.stripe.status.mismatch', uiCopy('u_d384644897b998b0')) : t('audit.stripe.status.ok', uiCopy('u_9ea92d829e041333'))}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={{ ...glass, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 10 }}>
          {t('audit.stripe.webhooks.title', uiCopy('u_eb27951af3d77118'))}
        </div>
        {data.webhooks.length === 0 ? (
          <div style={{ fontSize: 13, color: ORANGE }}>{t('audit.stripe.webhooks.empty', uiCopy('u_8074476fc09262df'))}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'rgba(255,255,255,.5)' }}>
                  <Th>{t('audit.stripe.col.endpoint', uiCopy('u_a759f8a619b22005'))}</Th>
                  <Th>{t('audit.stripe.col.whStatus', uiCopy('u_c8b75de188a42435'))}</Th>
                  <Th>{t('audit.stripe.col.events', uiCopy('u_aa387ca778df3445'))}</Th>
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

      <section style={{ ...glass, padding: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 12 }}>
          {tt(uiCopy('u_ba745f823e78cdd4'), uiCopy('u_0e944dbd577771a9'), { n: data.findings.length })}
        </div>
        {data.findings.length === 0 ? (
          <div style={{ fontSize: 13, color: GREEN }}>{t('audit.stripe.findings.empty', uiCopy('u_ea27b756c5e9897e'))}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {data.findings.map((finding, i) => <FindingCard key={finding.id || i} finding={finding} />)}
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
        <strong>{t('audit.common.recommendation', uiCopy('u_b39d98fe99af7b5a'))}:</strong>{' '}
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
