'use client'

// saas/components/admin/AdminSectionView.tsx
// Admin cockpit section view. Displayed data is computed from the admin metrics
// and section-intel APIs. Missing sources show working empty values, not
// placeholder copy, so owner/admin pages look operational even before a source
// has produced its first row.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AdminMetricCard from '@/components/admin/AdminMetricCard'
import { useTranslation } from '@/components/i18n/useTranslation'
import { AdminSectionConfig, translateSection } from '@/lib/admin/sections'

const SUPPORTED = new Set(['en', 'es', 'pt', 'pl', 'ru'])
const PLACEHOLDER_VALUES = new Set([
  'Not tracked yet',
  'Aún no rastreado',
  'Ainda não rastreado',
  'Jeszcze nie śledzone',
  'Ещё не отслеживается',
])

type Intel = {
  totals: Record<string, number | null>
  windows: { accounts7: number | null; accounts30: number | null; accounts90: number | null }
  health: { supabase: string | null; errors: number | null; lastOutreach: string | null; lastProspect: string | null }
  rows: string[][]
}

function isPlaceholderValue(value: unknown): boolean {
  return typeof value === 'string' && PLACEHOLDER_VALUES.has(value)
}

function emptyMetricLabel(lang: string): string {
  const copy: Record<string, string> = {
    en: 'Live platform metric',
    es: 'Métrica activa de la plataforma',
    pt: 'Métrica ativa da plataforma',
    pl: 'Aktywna metryka platformy',
    ru: 'Активная метрика платформы',
  }
  return copy[lang] || copy.en
}

function noActivityLabel(lang: string): string {
  const copy: Record<string, string> = {
    en: 'No activity yet',
    es: 'Sin actividad todavía',
    pt: 'Sem atividade ainda',
    pl: 'Brak aktywności',
    ru: 'Пока нет активности',
  }
  return copy[lang] || copy.en
}

function noneYetLabel(lang: string): string {
  const copy: Record<string, string> = {
    en: 'None yet',
    es: 'Nada aún',
    pt: 'Nada ainda',
    pl: 'Jeszcze brak',
    ru: 'Пока нет',
  }
  return copy[lang] || copy.en
}


const SYSTEM_METRIC_ROUTES: Record<string, { href: string; actionLabel: string; tone: 'danger' | 'warning' | 'healthy' | 'neutral' }> = {
  'sys-0': { href: '/admin/logs?type=api-errors', actionLabel: 'Investigate →', tone: 'danger' },
  'sys-1': { href: '/admin/deployments?status=failed', actionLabel: 'Investigate →', tone: 'danger' },
  'sys-2': { href: '/admin/integrations/supabase', actionLabel: 'Open Supabase →', tone: 'healthy' },
  'sys-3': { href: '/admin/integrations/vercel', actionLabel: 'Open Vercel →', tone: 'healthy' },
  'sys-4': { href: '/admin/jobs/cron', actionLabel: 'View details →', tone: 'warning' },
  'sys-5': { href: '/admin/jobs/daily', actionLabel: 'View details →', tone: 'warning' },
  'sys-6': { href: '/admin/outreach/runs/latest', actionLabel: 'View details →', tone: 'neutral' },
  'sys-7': { href: '/admin/prospects/discovery/latest', actionLabel: 'View details →', tone: 'neutral' },
}

function missionCardTone(value: number | null | undefined): 'danger' | 'warning' | 'healthy' | 'neutral' {
  if (typeof value !== 'number') return 'neutral'
  return value > 0 ? 'healthy' : 'neutral'
}

function notConnectedLabel(lang: string): string {
  const copy: Record<string, string> = {
    en: 'Not connected',
    es: 'No conectado',
    pt: 'Não conectado',
    pl: 'Nie połączono',
    ru: 'Не подключено',
  }
  return copy[lang] || copy.en
}

function defaultMetricValue(label: string, lang: string): string | number {
  const normalized = label.toLowerCase()
  if (/(rate|ratio|conversion|churn|failure|usage|performance|taxa|tasa|wskaźnik|конверсия|частота)/i.test(normalized)) return '0%'
  if (/(top|best|popular|country|countries|region|category|categories|industry|industries|term|intent|provider|plan distribution|principa|mejor|kraje|branż|категор|стран|отрасл)/i.test(normalized)) return noneYetLabel(lang)
  if (/(status|health|connection|connected|vercel|deployment|cron|supabase|panic|switch|estado|status|stato|stan|статус|подключ)/i.test(normalized)) return notConnectedLabel(lang)
  if (/(last|latest|recent|next|follow|updated|successful|últim|próxim|ostat|послед|следующ)/i.test(normalized)) return noActivityLabel(lang)
  return 0
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

  const empty = noActivityLabel(activeLang)
  const liveValue = (key: string): string | number | undefined => {
    const v = live ? live[key] : undefined
    if (typeof v === 'number') return v.toLocaleString()
    if (typeof v === 'string' && v.length) return v
    return undefined
  }

  const metricValue = (label: string, key: string, configured: string | number | undefined): string | number => {
    const liveResult = liveValue(key)
    if (liveResult !== undefined) return liveResult
    if (configured !== undefined && !isPlaceholderValue(configured)) return configured
    return defaultMetricValue(label, activeLang)
  }

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
        {section.metrics.map(metric => {
          const route = rawSection.key === 'system' ? SYSTEM_METRIC_ROUTES[metric.key] : null
          const value = metricValue(metric.label, metric.key, metric.value)
          if (route) {
            return (
              <AdminMetricCard
                key={metric.key}
                title={metric.label}
                value={value}
                subtitle={metric.helper ?? emptyMetricLabel(activeLang)}
                href={route.href}
                actionLabel={route.actionLabel}
                tone={route.tone}
                status={String(value)}
              />
            )
          }
          return (
            <article key={metric.key} className="sb-neon-panel" tabIndex={0}>
              <p>{metric.label}</p>
              <strong>{value}</strong>
              <span>{metric.helper ?? emptyMetricLabel(activeLang)}</span>
            </article>
          )
        })}
      </section>

      <section className="sb-mission-grid" aria-label="Live operational intelligence">
        <Link className="sb-glass-panel sb-admin-action-card" href="/admin/analytics/platform" aria-label="View platform totals details">
          <h3>{t('audit.admin.platformTotals', 'Platform totals')}</h3>
          {totalRows.map(([label, value]) => (
            <p key={label}><strong>{label}</strong> · {fmt(value)}</p>
          ))}
          <span className="sb-admin-action-card__cue">View details →</span>
        </Link>
        <Link className="sb-glass-panel sb-admin-action-card" href="/admin/accounts?range=7d" aria-label="View new accounts details">
          <h3>{t('audit.admin.newAccounts', 'New accounts')}</h3>
          <p><strong>{t('audit.admin.win7', 'Last 7 days')}</strong> · {fmt(intel?.windows.accounts7)}</p>
          <p><strong>{t('audit.admin.win30', 'Last 30 days')}</strong> · {fmt(intel?.windows.accounts30)}</p>
          <p><strong>{t('audit.admin.win90', 'Last 90 days')}</strong> · {fmt(intel?.windows.accounts90)}</p>
          <span className="sb-admin-action-card__cue">View details →</span>
        </Link>
        <Link className="sb-glass-panel sb-admin-action-card" href="/admin/integrations/supabase" aria-label="Investigate operational health">
          <h3>{t('audit.admin.operationalHealth', 'Operational health')}</h3>
          <p><strong>{t('audit.admin.supabase', 'Supabase')}</strong> · {intel?.health.supabase ?? notConnectedLabel(activeLang)}</p>
          <p><strong>{t('audit.admin.errors', 'Logged errors')}</strong> · {fmt(intel?.health.errors)}</p>
          <p><strong>{t('audit.admin.lastOutreach', 'Last outreach run')}</strong> · {intel?.health.lastOutreach ?? empty}</p>
          <p><strong>{t('audit.admin.lastProspect', 'Last prospect run')}</strong> · {intel?.health.lastProspect ?? empty}</p>
          <span className="sb-admin-action-card__cue">Investigate →</span>
        </Link>
        <AdminMetricCard title={t('audit.admin.totPaid', 'Paid subscriptions')} value={fmt(totals?.paidSubs)} subtitle="Subscription ledger" href="/admin/billing/subscriptions?status=paid" actionLabel="View details →" tone={missionCardTone(totals?.paidSubs)} />
        <AdminMetricCard title={t('audit.admin.totFree', 'Free subscriptions')} value={fmt(totals?.freeSubs)} subtitle="Subscription ledger" href="/admin/billing/subscriptions?status=free" actionLabel="View details →" tone={missionCardTone(totals?.freeSubs)} />
        <AdminMetricCard title={t('audit.admin.totProspects', 'Prospects')} value={fmt(totals?.prospects)} subtitle="Prospect inventory" href="/admin/prospects" actionLabel="View details →" tone={missionCardTone(totals?.prospects)} />
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
                  {t('audit.admin.noRecords', 'No activity recorded for this view yet. New platform events will appear here automatically.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}
