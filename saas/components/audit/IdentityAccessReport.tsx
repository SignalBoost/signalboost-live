'use client'

// saas/components/audit/IdentityAccessReport.tsx
// Presentational component for the Identity & Access audit report.
// Renders summary stats, readiness score, findings list, and identities table.
// All UI text flows through t() / interpolate() — zero hardcoded English.

import { CSSProperties, ReactNode } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { useTranslation } from '@/components/i18n/useTranslation'
import { interpolate } from '@/lib/i18n/interpolate'
import { resolveFinding } from '@/lib/audit/reportModel'

// ── Types (mirror reportModel / reports shapes) ─────────────────────────────

type MfaState = 'enabled' | 'disabled' | 'unknown'
type IdentityFlag = 'stale' | 'neverUsed' | 'privilegedNoMfa' | 'mfaUnknown'
type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export type IdentityRow = {
  principal: string
  provider: string
  kind: string
  role: string
  mfaState: MfaState
  isPrivileged: boolean
  lastSeenDays: number | null
  flags: IdentityFlag[]
}

export type IdentityFinding = {
  id: string
  category: string
  severity: Severity
  title: string
  description: string
  recommendation?: string
  impact?: string
  [key: string]: unknown
}

export type IdentityReportSummary = {
  total: number
  privileged: number
  stale: number
  privilegedNoMfa: number
  mfaUnknown: number
}

export type IdentityAccessReportData = {
  generatedAt: string
  rows: IdentityRow[]
  findings: IdentityFinding[]
  summary: IdentityReportSummary
  score: number
}

// ── Design tokens (match AuditDashboard.tsx exactly) ────────────────────────

const GOLD = '#ffc300'
const CYAN = '#1af0ff'
const RED = '#fca5a5'
const ORANGE = '#fb923c'
const GREEN = '#4ade80'

const glass: CSSProperties = {
  background: 'linear-gradient(160deg, rgba(15,23,42,.55), rgba(7,11,20,.65))',
  border: '1px solid rgba(255,255,255,.10)',
  borderRadius: 16,
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 80) return GREEN
  if (score >= 50) return ORANGE
  return RED
}

function severityColor(sev: Severity): string {
  switch (sev) {
    case 'critical': return RED
    case 'high': return ORANGE
    case 'medium': return GOLD
    case 'low': return CYAN
    default: return 'rgba(255,255,255,.5)'
  }
}

function Badge({ children, color }: { children: ReactNode; color: string }) {
  return (
    <span style={{
      display: 'inline-block',
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: '.06em',
      textTransform: 'uppercase',
      color: '#0a0e17',
      background: color,
      borderRadius: 999,
      padding: '2px 9px',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  )
}

function FlagPill({ label }: { label: string }) {
  return (
    <span style={{
      display: 'inline-block',
      fontSize: 10,
      fontWeight: 700,
      color: ORANGE,
      border: `1px solid ${ORANGE}66`,
      borderRadius: 999,
      padding: '1px 8px',
      marginRight: 4,
      marginBottom: 2,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div style={{
      ...glass,
      flex: '1 1 140px',
      minWidth: 120,
      padding: '16px 18px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 28, fontWeight: 900, color: accent || '#fff', lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.5)', marginTop: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>
        {label}
      </div>
    </div>
  )
}

function ScoreRing({ score }: { score: number }) {
  const color = scoreColor(score)
  const r = 36
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <svg width={96} height={96} viewBox="0 0 96 96" style={{ flexShrink: 0 }}>
        <circle cx={48} cy={48} r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={8} />
        <circle
          cx={48} cy={48} r={r}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          transform="rotate(-90 48 48)"
          style={{ transition: 'stroke-dasharray .4s ease' }}
        />
        <text x={48} y={53} textAnchor="middle" fill={color} fontSize={20} fontWeight={900} fontFamily="inherit">
          {score}
        </text>
      </svg>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function IdentityAccessReport({ data }: { data: IdentityAccessReportData }) {
  const { lang } = useI18n()
  const { t } = useTranslation()

  const { rows, findings, summary, score, generatedAt } = data

  const generatedDate = generatedAt
    ? new Date(generatedAt).toLocaleString(lang === 'en' ? 'en-US' : lang, { dateStyle: 'medium', timeStyle: 'short' })
    : ''

  return (
    <main style={{ padding: 24, color: '#fff', maxWidth: 1200, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em' }}>
          {t('audit.identity.tableTitle', 'All Identities')}
          <span style={{ color: GOLD }}> ·</span>
        </h1>
        {generatedDate && (
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'rgba(255,255,255,.4)' }}>
            {generatedDate}
          </p>
        )}
      </div>

      {/* ── Summary stats + score ── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'stretch', marginBottom: 24 }}>
        <StatCard label={t('audit.identity.summary.total', 'Identities')} value={summary.total} />
        <StatCard label={t('audit.identity.summary.privileged', 'Privileged')} value={summary.privileged} accent={GOLD} />
        <StatCard label={t('audit.identity.summary.stale', 'Stale')} value={summary.stale} accent={ORANGE} />
        <StatCard label={t('audit.identity.summary.noMfa', 'Priv. no MFA')} value={summary.privilegedNoMfa} accent={RED} />
        <StatCard label={t('audit.identity.summary.mfaUnknown', 'MFA unknown')} value={summary.mfaUnknown} accent={CYAN} />

        {/* Score card */}
        <div style={{
          ...glass,
          flex: '1 1 160px',
          minWidth: 140,
          padding: '16px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}>
          <ScoreRing score={score} />
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
              Score
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: scoreColor(score) }}>
              {score >= 80 ? '✓' : score >= 50 ? '⚠' : '✕'}
            </div>
          </div>
        </div>
      </div>

      {/* ── Findings ── */}
      <section style={{ ...glass, padding: 20, marginBottom: 24 }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 14 }}>
          {t('audit.identity.findingsTitle', 'Access Findings')}
        </div>

        {findings.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,.45)' }}>
            {t('audit.identity.noFindings', 'No access findings.')}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {findings.map((f, i) => {
              const resolved = resolveFinding(f, t, interpolate)
              return (
                <div key={f.id || i} style={{
                  borderRadius: 12,
                  border: `1px solid ${severityColor(f.severity)}33`,
                  background: `${severityColor(f.severity)}08`,
                  padding: '14px 16px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                    <Badge color={severityColor(f.severity)}>
                      {t(`audit.severity.${f.severity}`, f.severity)}
                    </Badge>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{resolved.title}</span>
                  </div>
                  <p style={{ margin: '0 0 8px', fontSize: 12.5, color: 'rgba(255,255,255,.65)', lineHeight: 1.55 }}>
                    {resolved.description}
                  </p>
                  {resolved.recommendation && (
                    <div style={{ fontSize: 12, color: CYAN, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700 }}>{t('audit.common.recommendation', 'Recommendation')}: </span>
                      {resolved.recommendation}
                    </div>
                  )}
                  {resolved.impact && (
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)' }}>
                      <span style={{ fontWeight: 700 }}>{t('audit.common.impact', 'Impact')}: </span>
                      {resolved.impact}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Identities table ── */}
      <section style={{ ...glass, padding: 20 }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 14 }}>
          {t('audit.identity.tableTitle', 'All Identities')}
        </div>

        {rows.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,.45)' }}>
            {t('audit.identity.empty', 'No identities found.')}
          </p>
        ) : (
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 420px)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 700 }}>
              <thead>
                <tr>
                  {[
                    t('audit.identity.col.principal', 'Principal'),
                    t('audit.identity.col.provider', 'Provider'),
                    t('audit.identity.col.kind', 'Type'),
                    t('audit.identity.col.role', 'Role'),
                    t('audit.identity.col.mfa', 'MFA'),
                    t('audit.identity.col.lastSeen', 'Last seen'),
                    t('audit.identity.col.flags', 'Flags'),
                  ].map(h => (
                    <th key={h} style={{
                      textAlign: 'left',
                      padding: '8px 12px',
                      fontSize: 10.5,
                      fontWeight: 800,
                      letterSpacing: '.06em',
                      textTransform: 'uppercase',
                      color: 'rgba(255,255,255,.45)',
                      borderBottom: '1px solid rgba(255,255,255,.08)',
                      whiteSpace: 'nowrap',
                      position: 'sticky',
                      top: 0,
                      background: 'rgba(7,11,20,.95)',
                      backdropFilter: 'blur(8px)',
                      WebkitBackdropFilter: 'blur(8px)',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const lastSeenLabel = row.lastSeenDays === null
                    ? t('audit.identity.never', 'Never')
                    : row.lastSeenDays === 0
                      ? '< 1d'
                      : interpolate(t('audit.identity.daysAgo', '{days}d ago'), { days: String(row.lastSeenDays) })

                  const mfaLabel = t(`audit.identity.mfa.${row.mfaState}`, row.mfaState)
                  const mfaColor = row.mfaState === 'enabled' ? GREEN : row.mfaState === 'disabled' ? RED : 'rgba(255,255,255,.4)'
                  const kindLabel = t(`audit.identity.kind.${row.kind}`, row.kind)

                  return (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,.05)' }}>
                      <td style={{ padding: '10px 12px', color: '#fff', fontWeight: 600, wordBreak: 'break-all', minWidth: 160 }}>
                        {row.principal}
                        {row.isPrivileged && (
                          <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 800, color: GOLD, border: `1px solid ${GOLD}55`, borderRadius: 999, padding: '1px 6px' }}>
                            PRIV
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', color: 'rgba(255,255,255,.65)' }}>{row.provider}</td>
                      <td style={{ padding: '10px 12px', color: 'rgba(255,255,255,.65)' }}>{kindLabel}</td>
                      <td style={{ padding: '10px 12px', color: 'rgba(255,255,255,.65)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11.5 }}>
                        {row.role || '—'}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: mfaColor }}>{mfaLabel}</span>
                      </td>
                      <td style={{ padding: '10px 12px', color: 'rgba(255,255,255,.55)', whiteSpace: 'nowrap' }}>
                        {lastSeenLabel}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {row.flags.length === 0
                          ? <span style={{ color: 'rgba(255,255,255,.25)', fontSize: 11 }}>—</span>
                          : row.flags.map(flag => (
                            <FlagPill key={flag} label={t(`audit.identity.flag.${flag}`, flag)} />
                          ))
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
