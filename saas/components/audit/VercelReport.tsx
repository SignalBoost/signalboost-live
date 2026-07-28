'use client'

// saas/components/audit/VercelReport.tsx
// Cloud / Deployment Configuration report (Vercel) — presentational. Env-var
// scopes (names only, never values), public sensitive-var exposure, prod↔preview
// drift, and vercel-category findings. Labels resolve through t('audit.vercel.*').
// Styling: inline fathom-glass, matching the other audit reports.

import type { CSSProperties } from 'react'
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

export type VercelReportView = {
  generatedAt: string
  configured: boolean
  scopes: { scope: string; names: string[] }[]
  findings: Finding[]
  score: AuditScore
  summary: { scopes: number; totalVars: number; publicSensitive: number; driftFlagged: boolean }
}

function isPublic(name: string): boolean {
  return /^NEXT_PUBLIC_/i.test(name)
}

export default function VercelReport({ data }: { data: VercelReportView }) {
  const { t } = useTranslation()
  const tt = (key: string, fallback: string, params?: Record<string, string | number>) =>
    interpolate(t(key, fallback), params)

  const s = data.summary

  return (
    <main style={{ padding: 24, color: '#fff', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em' }}>
          {t('audit.vercel.title', uiCopy('u_e9c65f07a7adb098'))} <span style={{ color: GOLD }}>·</span>
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'rgba(255,255,255,.62)', maxWidth: 640, lineHeight: 1.5 }}>
          {t('audit.vercel.subtitle', uiCopy('u_40916d11eab2a067'))}
        </p>
      </div>

      {!data.configured && (
        <section style={{ ...glass, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: GOLD }}>
            {t('audit.vercel.notConfigured', uiCopy('u_a2f41e877c504777'))}
          </div>
        </section>
      )}

      {/* Summary stats */}
      <section style={{ ...glass, padding: 20, marginBottom: 16, display: 'flex', gap: 22, flexWrap: 'wrap' }}>
        <Stat label={t('audit.common.overallScore', uiCopy('u_a3b966e51b61ed37'))} value={data.score.score} color={data.score.score >= 80 ? GREEN : data.score.score >= 60 ? GOLD : RED} />
        <Stat label={t('audit.vercel.summary.scopes', uiCopy('u_6f63e0de84ee05cd'))} value={s.scopes} />
        <Stat label={t('audit.vercel.summary.vars', uiCopy('u_ddc7b5ba957cd29e'))} value={s.totalVars} />
        <Stat label={t('audit.vercel.summary.publicSensitive', uiCopy('u_6fbddf0a7b591d7f'))} value={s.publicSensitive} color={s.publicSensitive ? RED : GREEN} />
      </section>

      {/* Drift callout */}
      <section style={{ ...glass, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 10 }}>
          {t('audit.vercel.drift.title', uiCopy('u_69b6ba37744063f3'))}
        </div>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: '#0a0e17', background: s.driftFlagged ? ORANGE : GREEN, borderRadius: 999, padding: '3px 11px' }}>
          {s.driftFlagged ? t('audit.vercel.drift.drift', uiCopy('u_63a591374034c73e')) : t('audit.vercel.drift.aligned', uiCopy('u_21df74c1c2cedfe2'))}
        </span>
      </section>

      {/* Env scopes */}
      <section style={{ ...glass, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 12 }}>
          {t('audit.vercel.scopes.title', uiCopy('u_5cab0e3929f4c419'))}
        </div>
        <div style={{ fontSize: 11, color: GREY, marginBottom: 14 }}>
          {t('audit.vercel.metadataNote', uiCopy('u_624aa076c3096e5b'))}
        </div>
        {data.scopes.length === 0 ? (
          <div style={{ fontSize: 13, color: GREY }}>{t('audit.vercel.scopes.empty', uiCopy('u_02555f4f66a99917'))}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {data.scopes.map((sc, i) => (
              <div key={`${sc.scope}:${i}`}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: CYAN, marginBottom: 8, textTransform: 'capitalize' }}>
                  {t(`audit.vercel.scope.${sc.scope}`, sc.scope)} <span style={{ color: GREY, fontWeight: 500 }}>· {sc.names.length}</span>
                </div>
                {sc.names.length === 0 ? (
                  <div style={{ fontSize: 12, color: GREY }}>{t('audit.vercel.scope.none', uiCopy('u_a3099dfbb18feb5a'))}</div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                    {sc.names.map((n, j) => {
                      const pub = isPublic(n)
                      return (
                        <span key={`${n}:${j}`} style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11, color: pub ? GOLD : 'rgba(255,255,255,.75)', border: `1px solid ${pub ? GOLD + '55' : 'rgba(255,255,255,.14)'}`, borderRadius: 7, padding: '3px 8px' }}>
                          {n}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Findings */}
      <section style={{ ...glass, padding: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 12 }}>
          {tt(uiCopy('u_d72feee7adfe2c86'), uiCopy('u_1c3a20efd61fca0b'), { n: data.findings.length })}
        </div>
        {data.findings.length === 0 ? (
          <div style={{ fontSize: 13, color: GREEN }}>{t('audit.vercel.findings.empty', uiCopy('u_124a6fac90365060'))}</div>
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
        <strong>{t('audit.common.recommendation', uiCopy('u_5d463c4a8f7038dc'))}:</strong>{' '}
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
