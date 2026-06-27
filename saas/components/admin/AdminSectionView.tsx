'use client'

// saas/components/admin/AdminSectionView.tsx
// Admin cockpit section view. Displayed data is computed from the admin metrics
// and section-intel APIs. Missing non-sales sources still show an honest empty
// state. Sales cards use zero/none defaults so the owner console never looks like
// a placeholder while live telemetry is loading.

import { useEffect, useState } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { AdminSectionConfig, translateSection } from '@/lib/admin/sections'

const SUPPORTED = new Set(['en', 'es', 'pt', 'pl', 'ru'])

type Intel = {
  totals: Record<string, number | null>
  windows: { accounts7: number | null; accounts30: number | null; accounts90: number | null }
  health: { supabase: string | null; errors: number | null; lastOutreach: string | null; lastProspect: string | null }
  rows: string[][]
}

export default function AdminSectionView({ section: rawSection }: { section: AdminSectionConfig }) {
  const { t, lang } = useTranslation()
  const activeLang = SUPPORTED.has(lang) ? lang : 'en'
  const section = translateSection(rawSection, activeLang)

  const [live, setLive] = useState<Record<string, number | string> | null>(null)
  useEffect(() => {
    let active = true
    fetch('/api/admin/section-metrics', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (active && d && d.values) setLive(d.values) })
      .catch(() => {})
    return () => { active = false }
  }, [])

  const [intel, setIntel] = useState<Intel | null>(null)
  useEffect(() => {
    let active = true
    fetch(`/api/admin/section-intel?section=${encodeURIComponent(rawSection.key)}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (active && d && d.ok) setIntel(d as Intel) })
      .catch(() => {})
    return () => { active = false }
  }, [rawSection.key])

  const empty = t('audit.admin.notTracked', 'No data yet')
  const liveValue = (key: string): string | number | undefined => {
    const v = live ? live[key] : undefined
    if (typeof v === 'number') return v.toLocaleString()
    if (typeof v === 'string' && v.length) return v
    return undefined
  }

  const salesFallback = (key: string): string | number | undefined => {
    if (rawSection.key !== 'sales') return undefined
    if (key === 'sales-9' || key === 'sales-10') return '0%'
    if (key === 'sales-11' || key === 'sales-12') return 'None yet'
    return 0
  }

  const metricValue = (key: string, configured: string | number | undefined): string | number =>
    liveValue(key) ?? salesFallback(key) ?? configured ?? empty

  const fmt = (n: number | null | undefined): string =>
    typeof n === 'number' ? n.toLocaleString() : empty

  const totals = intel?.totals
  const totalRows: [string, number | null | undefined][] = [
    [t('audit.admin.totAccounts', 'Accounts'), totals?.accounts],
    [t('audit.admin.totPaid', 'Paid subscriptions'), totals?.paidSubs],
    [t('audit.admin.totFree', 'Free subscriptions'), totals?.freeSubs],
    [t('audit.admin.totProspects', 'Prospects'), totals?.prospects],
    [t('audit.admin.totOutreach', 'Outreach sends'), totals?.outreachSends],
    [t('audit.admin.totAi', 'AI tasks'), totals?.aiTasks],
    [t('audit.admin.totSites', 'Sites built'), totals?.sites],
    [t('audit.admin.totVideos', 'Video jobs'), totals?.videos],
    [t('audit.admin.totReviews', 'Reviews'), totals?.reviews],
  ]

  return (
    <div className="sb-cockpit-stack" role="region" aria-label={`${section.title} admin console section`}>
      <header className="sb-cockpit-hero">
        <span className="sb-eyebrow">{t('audit.admin.eyebrow', 'NASA-style admin console')}</span>
        <h2>{section.title}</h2>
        <p>{section.description}</p>
      </header>

      <section className="sb-cockpit-grid" aria-label="Dashboard panels">
        {section.metrics.map(metric => (
          <article key={metric.key} className="sb-neon-panel" tabIndex={0}>
            <p>{metric.label}</p>
            <strong>{metricValue(metric.key, metric.value)}</strong>
            <span>{metric.helper ?? t('audit.admin.telemetrySignal', 'Telemetry-ready signal')}</span>
          </article>
        ))}
      </section>

      <section className="sb-mission-grid" aria-label="Live operational intelligence">
        <article className="sb-glass-panel">
          <h3>{t('audit.admin.platformTotals', 'Platform totals')}</h3>
          {totalRows.map(([label, value]) => (
            <p key={label}><strong>{label}</strong> · {fmt(value)}</p>
          ))}
        </article>
        <article className="sb-glass-panel">
          <h3>{t('audit.admin.newAccounts', 'New accounts')}</h3>
          <p><strong>{t('audit.admin.win7', 'Last 7 days')}</strong> · {fmt(intel?.windows.accounts7)}</p>
          <p><strong>{t('audit.admin.win30', 'Last 30 days')}</strong> · {fmt(intel?.windows.accounts30)}</p>
          <p><strong>{t('audit.admin.win90', 'Last 90 days')}</strong> · {fmt(intel?.windows.accounts90)}</p>
        </article>
        <article className="sb-glass-panel">
          <h3>{t('audit.admin.operationalHealth', 'Operational health')}</h3>
          <p><strong>{t('audit.admin.supabase', 'Supabase')}</strong> · {intel?.health.supabase ?? empty}</p>
          <p><strong>{t('audit.admin.errors', 'Logged errors')}</strong> · {fmt(intel?.health.errors)}</p>
          <p><strong>{t('audit.admin.lastOutreach', 'Last outreach run')}</strong> · {intel?.health.lastOutreach ?? empty}</p>
          <p><strong>{t('audit.admin.lastProspect', 'Last prospect run')}</strong> · {intel?.health.lastProspect ?? empty}</p>
        </article>
      </section>

      <section className="sb-orbit-table" aria-label={section.tableTitle}>
        <div className="sb-orbit-table__header">
          <h3>{section.tableTitle}</h3>
          <span>{t('audit.admin.filters', 'Filters: date range • product • country • plan • role')}</span>
        </div>
        <table>
          <thead>
            <tr>{section.tableColumns.map(c => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {intel?.rows && intel.rows.length > 0 ? (
              intel.rows.map((cells, i) => (
                <tr key={i}>
                  {section.tableColumns.map((_, j) => <td key={j}>{cells[j] ?? '—'}</td>)}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={section.tableColumns.length}>
                  {t('audit.admin.noRecords', 'No records yet — activity for this view will appear here as it is generated.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}
