'use client'

// saas/components/audit/SecretsReport.tsx
// Secrets & API Key Exposure — presentational. METADATA ONLY: shows credential
// names, environment, rotation posture, client-exposure risk — never a value.
// Every label resolves through t('audit.*'). Inline fathom-glass styling.

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
const SEV_COLOR: Record<Severity, string> = { critical: RED, high: ORANGE, medium: GOLD, low: CYAN, info: GREY }

export type SecretRowView = {
  name: string
  provider: string
  environment: string
  present: boolean
  publicExposed: boolean
  rotationKnown: boolean
  lastRotatedAt?: string
  maskedHint: string
  risk: Severity
}

export type SecretsReportView = {
  generatedAt: string
  rows: SecretRowView[]
  findings: Finding[]
  score: AuditScore
  summary: { total: number; clientExposed: number; rotationUnknown: number }
}

export default function SecretsReport({ data }: { data: SecretsReportView }) {
  const { t } = useTranslation()
  const s = data.summary

  return (
    <main style={{ padding: 24, color: '#fff', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em' }}>
          {t('audit.secret.title', uiCopy('u_50973a82c39a7a45'))} <span style={{ color: GOLD }}>·</span>
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'rgba(255,255,255,.62)', maxWidth: 660, lineHeight: 1.5 }}>
          {t('audit.secret.subtitle', uiCopy('u_85b2f20e6e0e0149'))}
        </p>
      </div>

      <section style={{ ...glass, padding: 20, marginBottom: 16, display: 'flex', gap: 22, flexWrap: 'wrap' }}>
        <Stat label={t('audit.secret.summary.total', uiCopy('u_ace911aeaa1f1926'))} value={s.total} />
        <Stat label={t('audit.secret.summary.clientExposed', uiCopy('u_4f18a5adae0b36d9'))} value={s.clientExposed} color={s.clientExposed ? RED : undefined} />
        <Stat label={t('audit.secret.summary.rotationUnknown', uiCopy('u_1f50c66c88eb6770'))} value={s.rotationUnknown} color={s.rotationUnknown ? GOLD : undefined} />
      </section>

      <section style={{ ...glass, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 12 }}>
          {t('audit.secret.findingsTitle', uiCopy('u_dbc8e7ff6a7d2749'))}
        </div>
        {data.findings.length === 0 ? (
          <div style={{ fontSize: 13, color: GREEN }}>{t('audit.secret.noFindings', uiCopy('u_3573d2d32e2c6a16'))}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.findings.map(f => <FindingCard key={f.id} finding={f} t={t} />)}
          </div>
        )}
      </section>

      <section style={{ ...glass, padding: 20 }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 12 }}>
          {t('audit.secret.tableTitle', uiCopy('u_1ca67bdd91d9f345'))}
        </div>
        {data.rows.length === 0 ? (
          <div style={{ fontSize: 13, color: GREY }}>{t('audit.secret.empty', uiCopy('u_b7e0f23bb5485e4a'))}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'rgba(255,255,255,.5)' }}>
                  <Th>{t('audit.secret.col.name', uiCopy('u_57e3497846683099'))}</Th>
                  <Th>{t('audit.secret.col.provider', uiCopy('u_583ce93dbe08d4d4'))}</Th>
                  <Th>{t('audit.secret.col.environment', uiCopy('u_daedf291932e2365'))}</Th>
                  <Th>{t('audit.secret.col.exposure', uiCopy('u_82613a3f9c44f18b'))}</Th>
                  <Th>{t('audit.secret.col.rotation', uiCopy('u_fdbf76d80cf89e47'))}</Th>
                  <Th>{t('audit.secret.col.risk', uiCopy('u_0dfa57760e5bd71a'))}</Th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => {
                  const rc = SEV_COLOR[r.risk] || GREY
                  return (
                    <tr key={`${r.name}:${i}`}>
                      <Td><span style={{ fontWeight: 600, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11.5 }}>{r.name}</span></Td>
                      <Td><span style={{ color: 'rgba(255,255,255,.65)' }}>{r.provider}</span></Td>
                      <Td>{t(`audit.secret.env.${r.environment}`, r.environment)}</Td>
                      <Td>
                        {r.publicExposed
                          ? <span style={{ color: RED, fontWeight: 600 }}>{t('audit.secret.exposure.client', uiCopy('u_a915d65885ae295b'))}</span>
                          : <span style={{ color: GREEN }}>{t('audit.secret.exposure.server', uiCopy('u_0ef24e64d746c4c1'))}</span>}
                      </Td>
                      <Td>
                        {r.rotationKnown
                          ? <span style={{ color: 'rgba(255,255,255,.7)' }}>{t('audit.secret.rotation.known', uiCopy('u_91da881549a481c3'))}</span>
                          : <span style={{ color: GOLD }}>{t('audit.secret.rotation.unknown', uiCopy('u_40de0d7c0ec1b0fb'))}</span>}
                      </Td>
                      <Td>
                        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: '#0a0e17', background: rc, borderRadius: 999, padding: '2px 9px' }}>
                          {t(`audit.severity.${r.risk}`, r.risk)}
                        </span>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p style={{ marginTop: 12, fontSize: 11, color: GREY }}>{t('audit.secret.metadataNote', uiCopy('u_ee267bd6dae38a8a'))}</p>
          </div>
        )}
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

type TFn = (key: string, fallback: string) => string
function FindingCard({ finding, t }: { finding: Finding; t: TFn }) {
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
        <strong style={{ color: 'rgba(255,255,255,.8)' }}>{t('audit.common.recommendation', uiCopy('u_3f0515e8610e818d'))}:</strong> {text.recommendation}
      </div>
    </div>
  )
}
