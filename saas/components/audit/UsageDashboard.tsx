'use client'

// saas/components/audit/UsageDashboard.tsx
// AI Usage dashboard — presentational. Totals, cache efficiency, per-feature
// breakdown, and top consumers. Labels resolve through t('audit.usage.*').

import type { CSSProperties, ReactNode } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { interpolate } from '@/lib/i18n/interpolate'

const GOLD = '#ffc300'
const CYAN = '#1af0ff'
const GREEN = '#86efac'
const GREY = 'rgba(255,255,255,.45)'

const glass: CSSProperties = {
  background: 'linear-gradient(160deg, rgba(15,23,42,.55), rgba(7,11,20,.65))',
  border: '1px solid rgba(255,255,255,.10)', borderRadius: 16,
  backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
}

type Group = { key: string; calls: number; tokens: number; costUsd: number }
export type UsageDashboardView = {
  windowDays: number
  totals: { calls: number; inputTokens: number; outputTokens: number; cacheCreationTokens: number; cacheReadTokens: number; costUsd: number }
  cacheReadPct: number
  byFeature: Group[]
  byUser: Group[]
}

const FEATURE_LABEL: Record<string, string> = {
  'support.chief-of-staff': 'Chief of Staff',
  'support.concierge': 'Concierge (external)',
  'audit.executive-summary': 'Audit · Executive Summary',
}

function fmtInt(n: number): string { return (n || 0).toLocaleString('en-US') }
function fmtUsd(n: number): string { return '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function shortId(id: string): string { return id === 'anonymous' ? id : id.length > 12 ? id.slice(0, 8) + '…' : id }

export default function UsageDashboard({ data }: { data: UsageDashboardView }) {
  const { t } = useTranslation()
  const tt = (k: string, f: string, p?: Record<string, string | number>) => interpolate(t(k, f), p)
  const tot = data.totals
  const totalTokens = tot.inputTokens + tot.outputTokens + tot.cacheCreationTokens + tot.cacheReadTokens

  return (
    <main style={{ padding: 24, color: '#fff', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em' }}>
          {t('audit.usage.title', 'AI Usage & Cost')} <span style={{ color: GOLD }}>·</span>
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'rgba(255,255,255,.62)', maxWidth: 680, lineHeight: 1.5 }}>
          {tt('audit.usage.subtitle', 'Token consumption and estimated cost across AI features over the last {n} days. Cost is an estimate; token counts are exact.', { n: data.windowDays })}
        </p>
      </div>

      <section style={{ ...glass, padding: 20, marginBottom: 16, display: 'flex', gap: 26, flexWrap: 'wrap' }}>
        <Stat label={t('audit.usage.totalCost', 'Est. cost')} value={fmtUsd(tot.costUsd)} color={GOLD} />
        <Stat label={t('audit.usage.calls', 'Calls')} value={fmtInt(tot.calls)} />
        <Stat label={t('audit.usage.totalTokens', 'Total tokens')} value={fmtInt(totalTokens)} />
        <Stat label={t('audit.usage.cacheHit', 'Input from cache')} value={data.cacheReadPct + '%'} color={data.cacheReadPct > 0 ? GREEN : undefined} />
      </section>

      <section style={{ ...glass, padding: 20, marginBottom: 16 }}>
        <SectionTitle>{t('audit.usage.byFeature', 'By Feature')}</SectionTitle>
        {data.byFeature.length === 0 ? <Empty t={t} /> : (
          <Table
            cols={[t('audit.usage.col.feature', 'Feature'), t('audit.usage.col.calls', 'Calls'), t('audit.usage.col.tokens', 'Tokens'), t('audit.usage.col.cost', 'Est. cost')]}
            rows={data.byFeature.map(g => [FEATURE_LABEL[g.key] || g.key, fmtInt(g.calls), fmtInt(g.tokens), fmtUsd(g.costUsd)])}
          />
        )}
      </section>

      <section style={{ ...glass, padding: 20 }}>
        <SectionTitle>{t('audit.usage.byUser', 'Top Consumers')}</SectionTitle>
        <p style={{ margin: '0 0 12px', fontSize: 11.5, color: GREY }}>{t('audit.usage.byUserHint', 'Highest estimated cost first — the basis for per-user billing or throttling.')}</p>
        {data.byUser.length === 0 ? <Empty t={t} /> : (
          <Table
            cols={[t('audit.usage.col.user', 'User'), t('audit.usage.col.calls', 'Calls'), t('audit.usage.col.tokens', 'Tokens'), t('audit.usage.col.cost', 'Est. cost')]}
            rows={data.byUser.map(g => [shortId(g.key), fmtInt(g.calls), fmtInt(g.tokens), fmtUsd(g.costUsd)])}
            mono0
          />
        )}
      </section>
    </main>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || '#fff', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,.55)' }}>{label}</div>
    </div>
  )
}
function SectionTitle({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 12 }}>{children}</div>
}
function Empty({ t }: { t: (k: string, f: string) => string }) {
  return <div style={{ fontSize: 13, color: GREY }}>{t('audit.usage.empty', 'No usage recorded yet.')}</div>
}
function Table({ cols, rows, mono0 }: { cols: string[]; rows: string[][]; mono0?: boolean }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'rgba(255,255,255,.5)' }}>
            {cols.map((c, i) => <th key={i} style={{ padding: '8px 10px', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,.12)', textAlign: i === 0 ? 'left' : 'right' }}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((cell, ci) => (
                <td key={ci} style={{ padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,.06)', textAlign: ci === 0 ? 'left' : 'right', fontFamily: (ci > 0 || mono0) ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined, fontWeight: ci === 0 ? 600 : 400 }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
