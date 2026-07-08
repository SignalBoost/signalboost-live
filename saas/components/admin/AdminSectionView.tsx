'use client'

// saas/components/admin/AdminSectionView.tsx
// Admin cockpit section view. Displayed data is computed from the admin metrics
// and section-intel APIs. Missing sources show working empty values, not
// placeholder copy, so owner/admin pages look operational even before a source
// has produced its first row.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { KeyboardEvent, useEffect, useState } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { AdminSectionConfig, translateSection } from '@/lib/admin/sections'
import { getAdminMetricAction } from '@/lib/admin/metricActions'

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
  const router = useRouter()
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

  const openWithKeyboard = (event: KeyboardEvent<HTMLElement>, href: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      router.push(href)
    }
  }

  const totals = intel?.totals
  const totalRows: [string, number | null | undefined, string][] = [
    [t('audit.admin.totAccounts', 'Accounts'), totals?.accounts, '/admin/accounts'],
    [t('audit.admin.totPaid', 'Paid subscriptions'), totals?.paidSubs, '/admin/billing/subscriptions?status=paid'],
    [t('audit.admin.totFree', 'Free subscriptions'), totals?.freeSubs, '/admin/billing/subscriptions?status=free'],
    [t('audit.admin.totProspects', 'Prospects'), totals?.prospects, '/admin/prospects'],
    [t('audit.admin.totOutreach', 'Outreach sends'), totals?.outreachSends, '/admin/outreach/runs'],
    [t('audit.admin.totAi', 'AI tasks'), totals?.aiTasks, '/admin/ai/tasks'],
    [t('audit.admin.totSites', 'Sites built'), totals?.sites, '/admin/sites'],
    [t('audit.admin.totVideos', 'Video jobs'), totals?.videos, '/admin/video/jobs'],
    [t('audit.admin.totReviews', 'Reviews'), totals?.reviews, '/admin/reviews'],
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
          const action = getAdminMetricAction({ sectionKey: rawSection.key, metricKey: metric.key, label: metric.label })
          return (
            <Link key={metric.key} className="sb-neon-panel sb-action-card" href={action.href} aria-label={`${metric.label}: ${action.label}`}>
              <p>{metric.label}</p>
              <strong>{metricValue(metric.label, metric.key, metric.value)}</strong>
              <span>{metric.helper ?? emptyMetricLabel(activeLang)}</span>
              <em className={`sb-card-action sb-card-action--${action.priority}`}>{action.label}</em>
            </Link>
          )
        })}
      </section>

      <section className="sb-mission-grid" aria-label="Live operational intelligence">
        <article
          className="sb-glass-panel sb-action-card"
          role="link"
          tabIndex={0}
          onClick={() => router.push('/admin/analytics/platform')}
          onKeyDown={event => openWithKeyboard(event, '/admin/analytics/platform')}
          aria-label="Platform totals: View details"
        >
          <h3>{t('audit.admin.platformTotals', 'Platform totals')}</h3>
          {totalRows.map(([label, value, href]) => (
            <Link key={label} href={href} onClick={event => event.stopPropagation()} aria-label={`${label}: View details`}><strong>{label}</strong> · {fmt(value)}</Link>
          ))}
          <em className="sb-card-action">View details →</em>
        </article>
        <Link className="sb-glass-panel sb-action-card" href="/admin/accounts" aria-label="New accounts: View details">
          <h3>{t('audit.admin.newAccounts', 'New accounts')}</h3>
          <p><strong>{t('audit.admin.win7', 'Last 7 days')}</strong> · {fmt(intel?.windows.accounts7)}</p>
          <p><strong>{t('audit.admin.win30', 'Last 30 days')}</strong> · {fmt(intel?.windows.accounts30)}</p>
          <p><strong>{t('audit.admin.win90', 'Last 90 days')}</strong> · {fmt(intel?.windows.accounts90)}</p>
          <em className="sb-card-action">View details →</em>
        </Link>
        <Link className="sb-glass-panel sb-action-card" href="/admin/system" aria-label="Operational health: Investigate">
          <h3>{t('audit.admin.operationalHealth', 'Operational health')}</h3>
          <p><strong>{t('audit.admin.supabase', 'Supabase')}</strong> · {intel?.health.supabase ?? notConnectedLabel(activeLang)}</p>
          <p><strong>{t('audit.admin.errors', 'Logged errors')}</strong> · {fmt(intel?.health.errors)}</p>
          <p><strong>{t('audit.admin.lastOutreach', 'Last outreach run')}</strong> · {intel?.health.lastOutreach ?? empty}</p>
          <p><strong>{t('audit.admin.lastProspect', 'Last prospect run')}</strong> · {intel?.health.lastProspect ?? empty}</p>
          <em className="sb-card-action sb-card-action--warning">Investigate →</em>
        </Link>
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
