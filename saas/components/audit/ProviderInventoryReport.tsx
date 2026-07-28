'use client'

// saas/components/audit/ProviderInventoryReport.tsx
// Provider Inventory — presentational. Renders connection status, derived risk,
// and finding counts per provider. Every label resolves through t('audit.*').
// Styling: inline fathom-glass, matching the other audit reports.

import type { CSSProperties, ReactNode } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { interpolate } from '@/lib/i18n/interpolate'
import type { Severity } from '@/lib/audit/reportModel'
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

const RISK_COLOR: Record<string, string> = {
  critical: RED, high: ORANGE, medium: GOLD, low: CYAN, info: GREY, unknown: GREY,
}
const STATUS_COLOR: Record<string, string> = {
  connected: GREEN, error: RED, not_configured: GREY, missing: GREY,
}

export type ProviderEntry = {
  provider: string
  status: string
  risk: Severity | 'unknown'
  category: string
  lastCheckedAt?: string
  findingCount: number
  evidenceRequired: number
  topSeverity?: Severity
}

export type ProviderInventoryView = {
  generatedAt: string
  rows: ProviderEntry[]
  summary: { total: number; connected: number; error: number; notConfigured: number }
}

export default function ProviderInventoryReport({ data }: { data: ProviderInventoryView }) {
  const { t } = useTranslation()
  const tt = (key: string, fallback: string, params?: Record<string, string | number>) =>
    interpolate(t(key, fallback), params)

  const s = data.summary
  const riskLabel = (r: string) =>
    r === 'unknown' ? t('audit.provider.risk.unknown', uiCopy('u_5e223902d3b46dc6')) : t(`audit.severity.${r}`, r)

  return (
    <main style={{ padding: 24, color: '#fff', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em' }}>
          {t('audit.provider.title', uiCopy('u_cb2bcd8367b51905'))} <span style={{ color: GOLD }}>·</span>
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'rgba(255,255,255,.62)', maxWidth: 640, lineHeight: 1.5 }}>
          {t('audit.provider.subtitle', uiCopy('u_005ffba13b165656'))}
        </p>
      </div>

      <section style={{ ...glass, padding: 20, marginBottom: 16, display: 'flex', gap: 22, flexWrap: 'wrap' }}>
        <Stat label={t('audit.provider.summary.total', uiCopy('u_3af7790cf6feb8b7'))} value={s.total} />
        <Stat label={t('audit.provider.summary.connected', uiCopy('u_60fea481caff96fc'))} value={s.connected} color={s.connected ? GREEN : undefined} />
        <Stat label={t('audit.provider.summary.error', uiCopy('u_c99ade8c870f580e'))} value={s.error} color={s.error ? RED : undefined} />
        <Stat label={t('audit.provider.summary.notConfigured', uiCopy('u_37682b085b345bd5'))} value={s.notConfigured} />
      </section>

      <section style={{ ...glass, padding: 20 }}>
        {data.rows.length === 0 ? (
          <div style={{ fontSize: 13, color: GREY }}>{t('audit.provider.empty', uiCopy('u_d9ad3fdc2d9b5d6b'))}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'rgba(255,255,255,.5)' }}>
                  <Th>{t('audit.provider.col.provider', uiCopy('u_1756f2be905f0628'))}</Th>
                  <Th>{t('audit.provider.col.category', uiCopy('u_83f6213f289d95b4'))}</Th>
                  <Th>{t('audit.provider.col.status', uiCopy('u_775070f8c704a59f'))}</Th>
                  <Th>{t('audit.provider.col.risk', uiCopy('u_c3c0564ceb4a38ef'))}</Th>
                  <Th>{t('audit.provider.col.findings', uiCopy('u_686e2bd8409cdfe3'))}</Th>
                  <Th>{t('audit.provider.col.lastChecked', uiCopy('u_eeaae9f036621bac'))}</Th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => {
                  const rc = RISK_COLOR[r.risk] || GREY
                  const sc = STATUS_COLOR[r.status] || GREY
                  return (
                    <tr key={`${r.provider}:${i}`}>
                      <Td><span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{r.provider}</span></Td>
                      <Td><span style={{ color: 'rgba(255,255,255,.65)' }}>{t(`audit.provider.category.${r.category}`, r.category)}</span></Td>
                      <Td><span style={{ color: sc, fontWeight: 600 }}>{t(`audit.provider.status.${r.status}`, r.status)}</span></Td>
                      <Td>
                        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: '#0a0e17', background: rc, borderRadius: 999, padding: '2px 9px' }}>
                          {riskLabel(r.risk)}
                        </span>
                      </Td>
                      <Td>
                        <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{r.findingCount}</span>
                        {r.evidenceRequired > 0 && (
                          <span style={{ marginLeft: 6, fontSize: 10, color: CYAN }}>
                            {tt(uiCopy('u_afd1e3715aca5d3c'), uiCopy('u_acddf6b3725ca248'), { n: r.evidenceRequired })}
                          </span>
                        )}
                      </Td>
                      <Td><span style={{ color: 'rgba(255,255,255,.55)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11 }}>{fmt(r.lastCheckedAt)}</span></Td>
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

function fmt(iso?: string): string {
  if (!iso) return '—'
  try { return new Date(iso).toISOString().slice(0, 16).replace('T', ' ') } catch { return '—' }
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
