'use client'

// saas/components/audit/EmailHealthReport.tsx
// Email Deliverability & DNS Health report — presentational. Per-domain
// MX/SPF/DKIM/DMARC/Resend status matrix plus severity-ranked findings.
// Labels resolve through t('audit.email.*'). Styling: inline fathom-glass,
// matching the other audit reports.

import type { CSSProperties } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { interpolate } from '@/lib/i18n/interpolate'
import { resolveFinding, type Finding, type AuditScore, type Severity } from '@/lib/audit/reportModel'
import type { EmailHealthReportView, EmailDomainView } from '@/lib/audit/emailHealthReport'
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

export type { EmailHealthReportView }

function Cell({ ok, label }: { ok: boolean; label: string }) {
  return <td style={{ padding: '10px 12px', fontSize: 13 }}>
    <span style={{ color: ok ? GREEN : RED, fontWeight: 900 }}>{ok ? '✓' : '✗'}</span>
    <span style={{ color: 'rgba(255,255,255,.7)', marginLeft: 8 }}>{label}</span>
  </td>
}

function DomainRow({ d }: { d: EmailDomainView }) {
  const { t } = useTranslation()
  const resendLabel: Record<EmailDomainView['resend'], string> = {
    verified: t("audit.email.resend.verified", "verified"),
    unverified: t("audit.email.resend.unverified", "NOT verified"),
    not_found: t("audit.email.resend.notFound", "not in Resend account"),
    no_api_key: t("audit.email.resend.noKey", "no API key"),
    api_error: t("audit.email.resend.apiError", "API error"),
  }
  return <tr style={{ borderTop: '1px solid rgba(255,255,255,.08)' }}>
    <td style={{ padding: '10px 12px' }}>
      <strong style={{ color: '#fff', fontSize: 13 }}>{d.domain}</strong>
      <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,.45)', fontSize: 11 }}>{d.senders.join(', ')}</p>
    </td>
    <Cell ok={d.mx.length > 0} label={d.mx.length ? d.mx.map(m => m.host).join(', ') : t('audit.email.noMx', "none — cannot receive")} />
    <Cell ok={d.spfCount === 1} label={d.spfCount === 0 ? t('audit.email.noSpf', "missing") : d.spfCount > 1 ? t('audit.email.multiSpf', "multiple (invalid)") : 'v=spf1 …'} />
    <Cell ok={d.dkim} label={d.dkim ? 'resend._domainkey' : t('audit.email.noDkim', "missing")} />
    <Cell ok={Boolean(d.dmarc)} label={d.dmarc ? (d.dmarc.match(/p=([a-z]+)/i)?.[1] || 'set') : t('audit.email.noDmarc', "missing")} />
    <Cell ok={d.resend === 'verified'} label={resendLabel[d.resend]} />
  </tr>
}

export default function EmailHealthReport({ data }: { data: EmailHealthReportView }) {
  const { t } = useTranslation()
  const tt = (key: string, fallback: string, params?: Record<string, string | number>) =>
    interpolate(t(key, fallback), params)

  const s = data.summary
  const score: AuditScore = data.score
  const scoreColor = score.score >= 90 ? GREEN : score.score >= 70 ? GOLD : score.score >= 50 ? ORANGE : RED

  return (
    <main style={{ padding: 24, color: '#fff', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em' }}>
          {t('audit.email.title', "Email Deliverability & DNS Health")} <span style={{ color: GOLD }}>·</span>
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'rgba(255,255,255,.62)', maxWidth: 680, lineHeight: 1.5 }}>
          {t('audit.email.subtitle', "Live MX / SPF / DKIM / DMARC checks for every platform sender domain, plus Resend verification. A missing MX means all customer replies bounce.")}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 18 }}>
        <div style={{ ...glass, padding: 14 }}>
          <p style={{ margin: 0, fontSize: 11, color: GREY, textTransform: 'uppercase', letterSpacing: '.08em' }}>{t('audit.email.score', "Score")}</p>
          <p style={{ margin: '6px 0 0', fontSize: 26, fontWeight: 900, color: scoreColor }}>{score.score}</p>
        </div>
        <div style={{ ...glass, padding: 14 }}>
          <p style={{ margin: 0, fontSize: 11, color: GREY, textTransform: 'uppercase', letterSpacing: '.08em' }}>{t('audit.email.canReceive', "Can receive mail")}</p>
          <p style={{ margin: '6px 0 0', fontSize: 26, fontWeight: 900, color: s.canReceive === s.domains ? GREEN : RED }}>{s.canReceive}/{s.domains}</p>
        </div>
        <div style={{ ...glass, padding: 14 }}>
          <p style={{ margin: 0, fontSize: 11, color: GREY, textTransform: 'uppercase', letterSpacing: '.08em' }}>{t('audit.email.canAuthSend', "SPF + DKIM ready")}</p>
          <p style={{ margin: '6px 0 0', fontSize: 26, fontWeight: 900, color: s.canAuthSend === s.domains ? GREEN : ORANGE }}>{s.canAuthSend}/{s.domains}</p>
        </div>
        <div style={{ ...glass, padding: 14 }}>
          <p style={{ margin: 0, fontSize: 11, color: GREY, textTransform: 'uppercase', letterSpacing: '.08em' }}>{t('audit.email.resendVerified', "Resend verified")}</p>
          <p style={{ margin: '6px 0 0', fontSize: 26, fontWeight: 900, color: s.resendVerified === s.domains ? GREEN : ORANGE }}>{s.resendVerified}/{s.domains}</p>
        </div>
      </div>

      <section style={{ ...glass, padding: 16, marginBottom: 18, overflowX: 'auto' }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 800 }}>{t('audit.email.domainsTitle', "Sender domains")}</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr>
              {[t('audit.email.colDomain', "Domain"), "MX", "SPF", "DKIM", "DMARC", "Resend"].map(h =>
                <th key={h} style={{ textAlign: 'left', padding: '6px 12px', fontSize: 11, color: GREY, textTransform: 'uppercase', letterSpacing: '.08em' }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.domains.map(d => <DomainRow key={d.domain} d={d} />)}
          </tbody>
        </table>
      </section>

      <section style={{ ...glass, padding: 16 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800 }}>
          {tt("audit.email.findingsTitle", "Findings ({count})", { count: data.findings.length })}
        </h2>
        {data.findings.length === 0 && <p style={{ color: GREEN, fontWeight: 700, fontSize: 14 }}>{t('audit.email.allClear', "All clear — every sender domain can receive mail and is authenticated for sending.")}</p>}
        <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
          {data.findings.map((f: Finding) => {
            const text = resolveFinding(f, t, interpolate)
            return <article key={f.id} style={{ border: `1px solid ${SEV_COLOR[f.severity]}44`, borderRadius: 12, padding: 12, background: 'rgba(0,0,0,.22)' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{ color: SEV_COLOR[f.severity], fontSize: 11, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '.08em' }}>{f.severity}</span>
                <strong style={{ color: '#fff', fontSize: 14 }}>{text.title}</strong>
              </div>
              <p style={{ margin: '8px 0 0', color: 'rgba(255,255,255,.72)', fontSize: 13, lineHeight: 1.6 }}>{text.detail}</p>
              {text.impact && <p style={{ margin: '6px 0 0', color: ORANGE, fontSize: 12, lineHeight: 1.5 }}>{text.impact}</p>}
              <p style={{ margin: '8px 0 0', color: CYAN, fontSize: 13, lineHeight: 1.6 }}>{t('audit.email.fixLabel', "Fix:")} {text.recommendation}</p>
            </article>
          })}
        </div>
      </section>

      <p style={{ margin: '14px 0 0', color: GREY, fontSize: 11 }}>
        {tt("audit.email.generatedAt", "Generated {time} · checks run live against public DNS on every load.", { time: new Date(data.generatedAt).toLocaleString() })}
      </p>
    </main>
  )
}
