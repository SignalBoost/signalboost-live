'use client'

// saas/components/audit/ActivityReport.tsx
// Audit Log & Activity Timeline — presentational. Recorded actions, actors, and
// results from the Hub audit log. Informational (no readiness score). Labels
// resolve through t('audit.activity.*').
// Styling: inline fathom-glass, matching the other audit reports.

import type { CSSProperties, ReactNode } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { interpolate } from '@/lib/i18n/interpolate'
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

const STATUS_COLOR: Record<string, string> = {
  success: GREEN, failure: RED, error: RED, config_error: RED, blocked: ORANGE, denied: ORANGE,
}

export type ActivityReportView = {
  generatedAt: string
  events: { id: string; createdAt: string; actor: string; action: string; status: string; target: string; message: string }[]
  summary: {
    total: number; success: number; failure: number; blocked: number
    denied: number; error: number; configError: number; actors: number
    since: string; until: string
  }
}

function fmt(iso: string): string {
  if (!iso) return '—'
  try { return new Date(iso).toISOString().slice(0, 16).replace('T', ' ') } catch { return '—' }
}

export default function ActivityReport({ data }: { data: ActivityReportView }) {
  const { t } = useTranslation()
  const tt = (key: string, fallback: string, params?: Record<string, string | number>) =>
    interpolate(t(key, fallback), params)

  const s = data.summary
  const failures = s.failure + s.error + s.configError
  const denials = s.blocked + s.denied

  return (
    <main style={{ padding: 24, color: '#fff', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em' }}>
          {t('audit.activity.title', uiCopy('u_de96f165204fff63'))} <span style={{ color: GOLD }}>·</span>
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'rgba(255,255,255,.62)', maxWidth: 640, lineHeight: 1.5 }}>
          {t('audit.activity.subtitle', uiCopy('u_e446c21e063ee27d'))}
        </p>
      </div>

      {/* Summary stats */}
      <section style={{ ...glass, padding: 20, marginBottom: 16, display: 'flex', gap: 22, flexWrap: 'wrap' }}>
        <Stat label={t('audit.activity.summary.total', uiCopy('u_ee24cafee11e442b'))} value={s.total} />
        <Stat label={t('audit.activity.summary.success', uiCopy('u_e172025aba9425bf'))} value={s.success} color={s.success ? GREEN : undefined} />
        <Stat label={t('audit.activity.summary.failures', uiCopy('u_ff803688bf0b7910'))} value={failures} color={failures ? RED : undefined} />
        <Stat label={t('audit.activity.summary.denials', uiCopy('u_5baee64ba104bc41'))} value={denials} color={denials ? ORANGE : undefined} />
        <Stat label={t('audit.activity.summary.actors', uiCopy('u_d8a44386fa638efa'))} value={s.actors} />
      </section>

      {/* Window */}
      <section style={{ ...glass, padding: 16, marginBottom: 16 }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,.6)' }}>
          {tt(uiCopy('u_4c1e4f159ac7d03c'), uiCopy('u_e9e2fc3bd1efd234'), {
            n: s.total, since: fmt(s.since), until: fmt(s.until),
          })}
        </span>
      </section>

      {/* Timeline table */}
      <section style={{ ...glass, padding: 20 }}>
        {data.events.length === 0 ? (
          <div style={{ fontSize: 13, color: GREY }}>{t('audit.activity.empty', uiCopy('u_73f23cb7d0adffd7'))}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'rgba(255,255,255,.5)' }}>
                  <Th>{t('audit.activity.col.time', uiCopy('u_2e26e00befe3e63b'))}</Th>
                  <Th>{t('audit.activity.col.actor', uiCopy('u_a37a1075455ddc5b'))}</Th>
                  <Th>{t('audit.activity.col.action', uiCopy('u_d2f2b99cbefb7cf1'))}</Th>
                  <Th>{t('audit.activity.col.target', uiCopy('u_bd02bc466c41c4ca'))}</Th>
                  <Th>{t('audit.activity.col.status', uiCopy('u_db1de718dcf1145c'))}</Th>
                  <Th>{t('audit.activity.col.message', uiCopy('u_4627d1ac98099851'))}</Th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((e, i) => {
                  const c = STATUS_COLOR[e.status] || GREY
                  return (
                    <tr key={`${e.id}:${i}`}>
                      <Td><span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11, color: 'rgba(255,255,255,.6)', whiteSpace: 'nowrap' }}>{fmt(e.createdAt)}</span></Td>
                      <Td><span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11 }}>{e.actor}</span></Td>
                      <Td><span style={{ fontWeight: 600 }}>{e.action}</span></Td>
                      <Td><span style={{ color: 'rgba(255,255,255,.6)' }}>{e.target || '—'}</span></Td>
                      <Td>
                        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: '#0a0e17', background: c, borderRadius: 999, padding: '2px 9px', whiteSpace: 'nowrap' }}>
                          {t(`audit.activity.status.${e.status}`, e.status)}
                        </span>
                      </Td>
                      <Td><span style={{ color: 'rgba(255,255,255,.7)' }}>{e.message || '—'}</span></Td>
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
