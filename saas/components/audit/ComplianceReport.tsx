'use client'

// saas/components/audit/ComplianceReport.tsx
// Compliance Readiness Matrix — presentational. Per-framework readiness and a
// control-family crosswalk to SOC 2 / ISO 27001 / NIST CSF / CIS. Readiness
// indication only — NOT a certification or audit. Labels via t('audit.compliance.*').
// Styling: inline fathom-glass, matching the other audit reports.

import type { CSSProperties, ReactNode } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { interpolate } from '@/lib/i18n/interpolate'
import type { Severity } from '@/lib/audit/reportModel'

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

const STATUS_COLOR: Record<string, string> = { ready: GREEN, attention: GOLD, gap: RED }
const FRAMEWORKS = ['soc2', 'iso27001', 'nist', 'cis'] as const

export type ComplianceReportView = {
  generatedAt: string
  overallPct: number
  frameworks: { id: string; ready: number; total: number; pct: number }[]
  families: { id: string; status: string; findingCount: number; worst: Severity | null; refs: Record<string, string> }[]
  summary: { families: number; ready: number; attention: number; gaps: number; openFindings: number }
}

function pctColor(p: number): string {
  return p >= 80 ? GREEN : p >= 50 ? GOLD : RED
}

export default function ComplianceReport({ data }: { data: ComplianceReportView }) {
  const { t } = useTranslation()
  const tt = (key: string, fallback: string, params?: Record<string, string | number>) =>
    interpolate(t(key, fallback), params)

  const s = data.summary

  return (
    <main style={{ padding: 24, color: '#fff', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em' }}>
          {t('audit.compliance.title', 'Compliance Readiness Matrix')} <span style={{ color: GOLD }}>·</span>
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'rgba(255,255,255,.62)', maxWidth: 680, lineHeight: 1.5 }}>
          {t('audit.compliance.subtitle', 'Readiness against SOC 2, ISO 27001, NIST CSF, and CIS — mapped from your current findings.')}
        </p>
      </div>

      {/* Disclaimer */}
      <section style={{ ...glass, padding: 14, marginBottom: 16, borderColor: 'rgba(255,195,0,.25)' }}>
        <div style={{ fontSize: 12, color: GOLD }}>
          {t('audit.compliance.disclaimer', 'Readiness indication only — this is not a certification, attestation, or formal audit. Reference codes are indicative.')}
        </div>
      </section>

      {/* Overall + summary */}
      <section style={{ ...glass, padding: 20, marginBottom: 16, display: 'flex', gap: 26, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 34, fontWeight: 800, color: pctColor(data.overallPct), fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{data.overallPct}%</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.55)' }}>{t('audit.compliance.overall', 'Overall readiness')}</div>
        </div>
        <Stat label={t('audit.compliance.summary.families', 'Control families')} value={s.families} />
        <Stat label={t('audit.compliance.summary.ready', 'Ready')} value={s.ready} color={s.ready ? GREEN : undefined} />
        <Stat label={t('audit.compliance.summary.attention', 'Needs attention')} value={s.attention} color={s.attention ? GOLD : undefined} />
        <Stat label={t('audit.compliance.summary.gaps', 'Gaps')} value={s.gaps} color={s.gaps ? RED : undefined} />
      </section>

      {/* Per-framework cards */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        {data.frameworks.map(fw => (
          <div key={fw.id} style={{ ...glass, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{t(`audit.compliance.fw.${fw.id}`, fw.id)}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: pctColor(fw.pct), fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{fw.pct}%</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)' }}>
              {tt('audit.compliance.readyOf', '{ready} of {total} ready', { ready: fw.ready, total: fw.total })}
            </div>
          </div>
        ))}
      </section>

      {/* Family crosswalk matrix */}
      <section style={{ ...glass, padding: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 12 }}>
          {t('audit.compliance.matrix.title', 'Control families')}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'rgba(255,255,255,.5)' }}>
                <Th>{t('audit.compliance.col.family', 'Control family')}</Th>
                <Th>{t('audit.compliance.col.status', 'Status')}</Th>
                <Th>{t('audit.compliance.col.findings', 'Findings')}</Th>
                {FRAMEWORKS.map(fw => <Th key={fw}>{t(`audit.compliance.fw.${fw}`, fw)}</Th>)}
              </tr>
            </thead>
            <tbody>
              {data.families.map((f, i) => {
                const c = STATUS_COLOR[f.status] || GREY
                return (
                  <tr key={`${f.id}:${i}`}>
                    <Td><span style={{ fontWeight: 600 }}>{t(`audit.compliance.family.${f.id}`, f.id)}</span></Td>
                    <Td>
                      <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: '#0a0e17', background: c, borderRadius: 999, padding: '2px 9px', whiteSpace: 'nowrap' }}>
                        {t(`audit.compliance.status.${f.status}`, f.status)}
                      </span>
                    </Td>
                    <Td><span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{f.findingCount}</span></Td>
                    {FRAMEWORKS.map(fw => (
                      <Td key={fw}><span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11, color: (f.refs[fw] && f.refs[fw] !== '—') ? 'rgba(255,255,255,.75)' : GREY }}>{f.refs[fw] || '—'}</span></Td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
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
