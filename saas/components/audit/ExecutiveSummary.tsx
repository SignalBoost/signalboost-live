'use client'

// saas/components/audit/ExecutiveSummary.tsx
// Executive Risk Summary — presentational. Renders the deterministic readiness
// score, severity breakdown, top risks, provider status, and the optional LLM
// narrative. Every visible label resolves through t('audit.*'); the narrative is
// dynamic model prose (already generated in the active language by the route).
// Styling: inline fathom-glass, matching components/audit/IdentityAccessReport.tsx.

import type { CSSProperties, ReactNode } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { interpolate } from '@/lib/i18n/interpolate'
import { resolveFinding, type Finding, type AuditScore, type Severity } from '@/lib/audit/reportModel'

const GOLD = '#ffc300'
const CYAN = '#1af0ff'
const RED = '#fca5a5'
const ORANGE = '#fb923c'
const GREEN = '#86efac'

const glass: CSSProperties = {
  background: 'linear-gradient(160deg, rgba(15,23,42,.55), rgba(7,11,20,.65))',
  border: '1px solid rgba(255,255,255,.10)', borderRadius: 16,
  backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
}

const SEV_COLOR: Record<Severity, string> = {
  critical: RED, high: ORANGE, medium: GOLD, low: CYAN, info: 'rgba(255,255,255,.5)',
}

export type ExecutiveSummaryView = {
  generatedAt: string
  score: AuditScore
  topRisks: Finding[]
  evidenceRequired: number
  findings: Finding[]
  providers: { id: string; status: string }[]
  narrative?: string | null
}

export default function ExecutiveSummary({ data }: { data: ExecutiveSummaryView }) {
  const { t } = useTranslation()
  const tt = (key: string, fallback: string, params?: Record<string, string | number>) =>
    interpolate(t(key, fallback), params)

  const s = data.score

  return (
    <main style={{ padding: 24, color: '#fff', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em' }}>
          {t('audit.exec.title', 'Executive Risk Summary')} <span style={{ color: GOLD }}>·</span>
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'rgba(255,255,255,.62)', maxWidth: 640, lineHeight: 1.5 }}>
          {t('audit.exec.subtitle', 'Overall readiness score, finding counts, and top risks.')}
        </p>
      </div>

      {/* Score + breakdown */}
      <section style={{ ...glass, padding: 20, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)' }}>
            {t('audit.common.overallScore', 'Overall Readiness Score')}
          </div>
          <div style={{ fontSize: 44, fontWeight: 800, color: scoreColor(s.score), fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', lineHeight: 1.1 }}>
            {s.score}<span style={{ fontSize: 18, color: 'rgba(255,255,255,.4)' }}>/100</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <Sev label={t('audit.severity.critical', 'Critical')} n={s.critical} color={RED} />
          <Sev label={t('audit.severity.high', 'High')} n={s.high} color={ORANGE} />
          <Sev label={t('audit.severity.medium', 'Medium')} n={s.medium} color={GOLD} />
          <Sev label={t('audit.severity.low', 'Low')} n={s.low} color={CYAN} />
          <Sev label={t('audit.common.evidenceRequired', 'Evidence required')} n={data.evidenceRequired} color={'rgba(255,255,255,.6)'} />
        </div>
      </section>

      {/* Narrative (only when the model produced one) */}
      {data.narrative ? (
        <section style={{ ...glass, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 10 }}>
            {t('audit.exec.narrativeTitle', 'Summary')}
          </div>
          {data.narrative.split('\n').filter(Boolean).map((para, i) => (
            <p key={i} style={{ margin: '0 0 10px', fontSize: 13.5, color: 'rgba(255,255,255,.78)', lineHeight: 1.6 }}>{para}</p>
          ))}
        </section>
      ) : null}

      {/* Top risks */}
      <section style={{ ...glass, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 12 }}>
          {t('audit.exec.topRisksTitle', 'Top Risks')}
        </div>
        {data.topRisks.length === 0 ? (
          <div style={{ fontSize: 13, color: GREEN }}>{t('audit.exec.noRisks', 'No risks above the reporting threshold.')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.topRisks.map(f => <RiskCard key={f.id} finding={f} t={t} />)}
          </div>
        )}
      </section>

      {/* Provider status */}
      {data.providers.length > 0 && (
        <section style={{ ...glass, padding: 20 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 12 }}>
            {t('audit.exec.providersTitle', 'Providers')}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {data.providers.map(p => {
              const c = p.status === 'connected' ? GREEN : p.status === 'error' ? RED : 'rgba(255,255,255,.45)'
              return (
                <span key={p.id} style={{ fontSize: 12, fontWeight: 600, color: '#fff', border: `1px solid ${c}55`, borderRadius: 999, padding: '3px 11px' }}>
                  {p.id} <span style={{ color: c }}>· {t(`audit.exec.status.${p.status}`, p.status)}</span>
                </span>
              )
            })}
          </div>
        </section>
      )}
    </main>
  )
}

function scoreColor(score: number): string {
  if (score >= 85) return GREEN
  if (score >= 60) return GOLD
  if (score >= 40) return ORANGE
  return RED
}

function Sev({ label, n, color }: { label: string; n: number; color: string }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 64 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{n}</div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,.55)' }}>{label}</div>
    </div>
  )
}

type TFn = (key: string, fallback: string) => string

function RiskCard({ finding, t }: { finding: Finding; t: TFn }) {
  const text = resolveFinding(finding, t, interpolate)
  const color = SEV_COLOR[finding.severity]
  return (
    <div style={{ border: `1px solid ${color}33`, borderLeft: `3px solid ${color}`, borderRadius: 12, padding: '12px 14px', background: 'rgba(255,255,255,.02)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: '#0a0e17', background: color, borderRadius: 999, padding: '2px 9px' }}>
          {t(`audit.severity.${finding.severity}`, finding.severity)}
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 700 }}>{text.title}</span>
      </div>
      <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.72)', lineHeight: 1.5 }}>{text.detail}</div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)', marginTop: 6 }}>
        <strong style={{ color: 'rgba(255,255,255,.8)' }}>{t('audit.common.recommendation', 'Recommendation')}:</strong> {text.recommendation}
      </div>
    </div>
  )
}
