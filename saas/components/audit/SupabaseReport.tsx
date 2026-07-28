'use client'

// saas/components/audit/SupabaseReport.tsx
// Supabase / Database Security report — presentational. Per-table RLS status,
// public storage buckets, service-role client exposure, and supabase-category
// findings. Every label resolves through t('audit.supabase.*').
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

export type SupabaseReportView = {
  generatedAt: string
  configured: boolean
  projectHost?: string
  latencyMs?: number
  serviceRoleInClient: boolean
  tables: { name: string; rlsEnabled: boolean }[]
  publicBuckets: string[]
  findings: Finding[]
  score: AuditScore
  summary: { tables: number; rlsDisabled: number; publicBuckets: number; serviceRoleInClient: boolean }
}

export default function SupabaseReport({ data }: { data: SupabaseReportView }) {
  const { t } = useTranslation()
  const tt = (key: string, fallback: string, params?: Record<string, string | number>) =>
    interpolate(t(key, fallback), params)

  const s = data.summary

  return (
    <main style={{ padding: 24, color: '#fff', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em' }}>
          {t('audit.supabase.title', uiCopy('u_33956d2ee5f33337'))} <span style={{ color: GOLD }}>·</span>
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'rgba(255,255,255,.62)', maxWidth: 640, lineHeight: 1.5 }}>
          {t('audit.supabase.subtitle', uiCopy('u_b2ce87aef9673c0b'))}
        </p>
      </div>

      {!data.configured && (
        <section style={{ ...glass, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: GOLD }}>
            {t('audit.supabase.notConfigured', uiCopy('u_5b073a8b7e1c66d4'))}
          </div>
        </section>
      )}

      {/* Summary stats */}
      <section style={{ ...glass, padding: 20, marginBottom: 16, display: 'flex', gap: 22, flexWrap: 'wrap' }}>
        <Stat label={t('audit.common.overallScore', uiCopy('u_c07e7000dbe8f769'))} value={data.score.score} color={data.score.score >= 80 ? GREEN : data.score.score >= 60 ? GOLD : RED} />
        <Stat label={t('audit.supabase.summary.tables', uiCopy('u_ffa28aea9dd0830e'))} value={s.tables} />
        <Stat label={t('audit.supabase.summary.rlsDisabled', uiCopy('u_501b294afbba17fe'))} value={s.rlsDisabled} color={s.rlsDisabled ? RED : GREEN} />
        <Stat label={t('audit.supabase.summary.publicBuckets', uiCopy('u_42350b2df3a4acc7'))} value={s.publicBuckets} color={s.publicBuckets ? ORANGE : undefined} />
      </section>

      {/* Service-role exposure callout */}
      <section style={{ ...glass, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 10 }}>
          {t('audit.supabase.serviceRole.title', uiCopy('u_46da3ad1edf9df0e'))}
        </div>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: '#0a0e17', background: data.serviceRoleInClient ? RED : GREEN, borderRadius: 999, padding: '3px 11px' }}>
          {data.serviceRoleInClient ? t('audit.supabase.serviceRole.exposed', uiCopy('u_e4f8b41ab68570f5')) : t('audit.supabase.serviceRole.serverOnly', uiCopy('u_fbfd467c5b229fc5'))}
        </span>
      </section>

      {/* Tables / RLS */}
      <section style={{ ...glass, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 10 }}>
          {t('audit.supabase.tables.title', uiCopy('u_52737c729c8d394a'))}
        </div>
        {data.tables.length === 0 ? (
          <div style={{ fontSize: 13, color: GREY }}>{t('audit.supabase.tables.empty', uiCopy('u_ca1a7c02f0d1ba3d'))}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'rgba(255,255,255,.5)' }}>
                  <Th>{t('audit.supabase.col.table', uiCopy('u_86b027c50e5f66f9'))}</Th>
                  <Th>{t('audit.supabase.col.rls', uiCopy('u_8c86abd75b696207'))}</Th>
                </tr>
              </thead>
              <tbody>
                {data.tables.map((tb, i) => (
                  <tr key={`${tb.name}:${i}`}>
                    <Td><span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{tb.name}</span></Td>
                    <Td>
                      <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: '#0a0e17', background: tb.rlsEnabled ? GREEN : RED, borderRadius: 999, padding: '2px 9px' }}>
                        {tb.rlsEnabled ? t('audit.supabase.rls.on', uiCopy('u_eb58714c156e7da7')) : t('audit.supabase.rls.off', uiCopy('u_3dc613f520651f18'))}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Public buckets */}
      <section style={{ ...glass, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 10 }}>
          {t('audit.supabase.buckets.title', uiCopy('u_a5fa821ab4fe8908'))}
        </div>
        {data.publicBuckets.length === 0 ? (
          <div style={{ fontSize: 13, color: GREEN }}>{t('audit.supabase.buckets.empty', uiCopy('u_d61e08806600ffa0'))}</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {data.publicBuckets.map((b, i) => (
              <span key={`${b}:${i}`} style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, color: ORANGE, border: `1px solid ${ORANGE}55`, borderRadius: 8, padding: '4px 10px' }}>{b}</span>
            ))}
          </div>
        )}
      </section>

      {/* Findings */}
      <section style={{ ...glass, padding: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 12 }}>
          {tt(uiCopy('u_11ce36758857ea6c'), uiCopy('u_f84e8b02a11aacf6'), { n: data.findings.length })}
        </div>
        {data.findings.length === 0 ? (
          <div style={{ fontSize: 13, color: GREEN }}>{t('audit.supabase.findings.empty', uiCopy('u_774d9f09815d4f0b'))}</div>
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
        <strong>{t('audit.common.recommendation', uiCopy('u_9f86eb5b354b1a16'))}:</strong>{' '}
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
