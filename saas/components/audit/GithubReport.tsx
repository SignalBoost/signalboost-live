'use client'

// saas/components/audit/GithubReport.tsx
// GitHub / Software Development report — presentational. Branch-protection
// posture, collaborators (admins flagged), stale branches, open PRs, and the
// github-category findings. Every label resolves through t('audit.github.*').
// Styling: inline fathom-glass, matching the other audit reports.

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
const PROT_COLOR: Record<string, string> = { enforced: GREEN, missing: RED, unverified: GOLD }

export type GithubReportView = {
  generatedAt: string
  configured: boolean
  defaultBranch: string
  branchProtection: 'enforced' | 'missing' | 'unverified'
  openPRs: number
  collaborators: { login: string; role: string; isAdmin: boolean }[]
  staleBranches: { name: string; ageDays: number }[]
  findings: Finding[]
  score: AuditScore
  summary: { collaborators: number; admins: number; staleBranches: number; openPRs: number; branchProtected: boolean }
}

export default function GithubReport({ data }: { data: GithubReportView }) {
  const { t } = useTranslation()
  const tt = (key: string, fallback: string, params?: Record<string, string | number>) =>
    interpolate(t(key, fallback), params)

  const s = data.summary
  const protColor = PROT_COLOR[data.branchProtection] || GREY

  return (
    <main style={{ padding: 24, color: '#fff', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em' }}>
          {t('audit.github.title', uiCopy('u_e75330ef26a910da'))} <span style={{ color: GOLD }}>·</span>
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'rgba(255,255,255,.62)', maxWidth: 640, lineHeight: 1.5 }}>
          {t('audit.github.subtitle', uiCopy('u_95203055971301bd'))}
        </p>
      </div>

      {!data.configured && (
        <section style={{ ...glass, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: GOLD }}>
            {t('audit.github.notConfigured', uiCopy('u_850e01ec53d070b1'))}
          </div>
        </section>
      )}

      {/* Summary stats */}
      <section style={{ ...glass, padding: 20, marginBottom: 16, display: 'flex', gap: 22, flexWrap: 'wrap' }}>
        <Stat label={t('audit.common.overallScore', uiCopy('u_29cc406d29ab2fb8'))} value={data.score.score} color={data.score.score >= 80 ? GREEN : data.score.score >= 60 ? GOLD : RED} />
        <Stat label={t('audit.github.summary.collaborators', uiCopy('u_d8c6ef2a03b50a76'))} value={s.collaborators} />
        <Stat label={t('audit.github.summary.admins', uiCopy('u_e7d210fcf9d8cf48'))} value={s.admins} color={s.admins ? GOLD : undefined} />
        <Stat label={t('audit.github.summary.stale', uiCopy('u_7c399002a6ad7251'))} value={s.staleBranches} color={s.staleBranches ? ORANGE : undefined} />
        <Stat label={t('audit.github.summary.openPRs', uiCopy('u_fa474eb90acbc3f5'))} value={s.openPRs} />
      </section>

      {/* Branch protection */}
      <section style={{ ...glass, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 10 }}>
          {t('audit.github.protection.title', uiCopy('u_b760cea372ce7d93'))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, color: '#fff' }}>{data.defaultBranch}</span>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: '#0a0e17', background: protColor, borderRadius: 999, padding: '3px 11px' }}>
            {t(`audit.github.protection.${data.branchProtection}`, data.branchProtection)}
          </span>
        </div>
      </section>

      {/* Collaborators */}
      <section style={{ ...glass, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 10 }}>
          {t('audit.github.collab.title', uiCopy('u_4990655afc7e613d'))}
        </div>
        {data.collaborators.length === 0 ? (
          <div style={{ fontSize: 13, color: GREY }}>{t('audit.github.collab.empty', uiCopy('u_e22977ba2f55d579'))}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'rgba(255,255,255,.5)' }}>
                  <Th>{t('audit.github.col.login', uiCopy('u_3b57ffb738cd5ab6'))}</Th>
                  <Th>{t('audit.github.col.role', uiCopy('u_e8f582ce8f619643'))}</Th>
                  <Th>{t('audit.github.col.access', uiCopy('u_ac80393aad2cfde3'))}</Th>
                </tr>
              </thead>
              <tbody>
                {data.collaborators.map((c, i) => (
                  <tr key={`${c.login}:${i}`}>
                    <Td><span style={{ fontWeight: 600, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{c.login}</span></Td>
                    <Td><span style={{ color: 'rgba(255,255,255,.65)', textTransform: 'capitalize' }}>{c.role}</span></Td>
                    <Td>
                      {c.isAdmin ? (
                        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: '#0a0e17', background: GOLD, borderRadius: 999, padding: '2px 9px' }}>
                          {t('audit.github.admin', uiCopy('u_4d688b8288479f10'))}
                        </span>
                      ) : (
                        <span style={{ color: GREY }}>{t('audit.github.member', uiCopy('u_2ec5cf53afd98529'))}</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Stale branches */}
      <section style={{ ...glass, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 10 }}>
          {t('audit.github.stale.title', uiCopy('u_d4918805caa0fa6c'))}
        </div>
        {data.staleBranches.length === 0 ? (
          <div style={{ fontSize: 13, color: GREEN }}>{t('audit.github.stale.empty', uiCopy('u_d6fe60ed13e2262e'))}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'rgba(255,255,255,.5)' }}>
                  <Th>{t('audit.github.col.branch', uiCopy('u_dbc493889d6b4735'))}</Th>
                  <Th>{t('audit.github.col.age', uiCopy('u_4d7c84f019c1bc78'))}</Th>
                </tr>
              </thead>
              <tbody>
                {data.staleBranches.map((b, i) => (
                  <tr key={`${b.name}:${i}`}>
                    <Td><span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{b.name}</span></Td>
                    <Td><span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: b.ageDays >= 90 ? ORANGE : 'rgba(255,255,255,.7)' }}>{b.ageDays}</span></Td>
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
          {tt(uiCopy('u_dfd38eb552d8cf03'), uiCopy('u_54e372362fa82e3a'), { n: data.findings.length })}
        </div>
        {data.findings.length === 0 ? (
          <div style={{ fontSize: 13, color: GREEN }}>{t('audit.github.findings.empty', uiCopy('u_8bd8b083f206b6be'))}</div>
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
        <strong>{t('audit.common.recommendation', uiCopy('u_c68b7b004c5337a3'))}:</strong>{' '}
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
