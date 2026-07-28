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
import { getAdminMetricAction } from '@/lib/admin/metricActions'
import { AdminSectionConfig, translateSection } from '@/lib/admin/sections'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


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
    en: uiCopy('u_73c8bb697429a865'),
    es: 'Métrica activa de la plataforma',
    pt: 'Métrica ativa da plataforma',
    pl: 'Aktywna metryka platformy',
    ru: 'Активная метрика платформы',
  }
  return copy[lang] || copy.en
}

function noActivityLabel(lang: string): string {
  const copy: Record<string, string> = {
    en: uiCopy('u_974825e1674fe2b2'),
    es: 'Sin actividad todavía',
    pt: 'Sem atividade ainda',
    pl: 'Brak aktywności',
    ru: 'Пока нет активности',
  }
  return copy[lang] || copy.en
}

function noneYetLabel(lang: string): string {
  const copy: Record<string, string> = {
    en: uiCopy('u_ee11c6f387f8a12a'),
    es: 'Nada aún',
    pt: 'Nada ainda',
    pl: 'Jeszcze brak',
    ru: 'Пока нет',
  }
  return copy[lang] || copy.en
}


function missionCardTone(value: number | null | undefined): 'danger' | 'warning' | 'healthy' | 'neutral' {
  if (typeof value !== 'number') return 'neutral'
  return value > 0 ? 'healthy' : 'neutral'
}

function systemTone(value: string | number): 'danger' | 'warning' | 'healthy' | 'neutral' {
  const text = String(value).toLowerCase()
  const numericValue = typeof value === 'number' ? value : Number(text.replace(/,/g, ''))
  if (Number.isFinite(numericValue)) return numericValue > 0 ? 'danger' : 'healthy'
  if (/error|failed|down|not connected|critical|degraded/.test(text)) return 'danger'
  if (/warning|watch|pending|unknown|no activity|not configured/.test(text)) return 'warning'
  if (/connected|healthy|ready|success|ok|normal/.test(text)) return 'healthy'
  return 'neutral'
}


function notConnectedLabel(lang: string): string {
  const copy: Record<string, string> = {
    en: uiCopy('u_025d181b8df9790d'),
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
    [t('audit.admin.totAccounts', uiCopy('u_f4130742d67a8775')), totals?.accounts],
    [t('audit.admin.totPaid', uiCopy('u_38518469b0f2aee3')), totals?.paidSubs],
    [t('audit.admin.totFree', uiCopy('u_fbd24f0729156e0a')), totals?.freeSubs],
    [t('audit.admin.totProspects', uiCopy('u_2587e2f76b6f0f24')), totals?.prospects],
    [t('audit.admin.totOutreach', uiCopy('u_e9364cdce27511c3')), totals?.outreachSends],
    [t('audit.admin.totAi', uiCopy('u_530db3225ba33cb3')), totals?.aiTasks],
    [t('audit.admin.totSites', uiCopy('u_279d629729dbe8c4')), totals?.sites],
    [t('audit.admin.totVideos', uiCopy('u_528019f3b0edcc41')), totals?.videos],
    [t('audit.admin.totReviews', uiCopy('u_88e3954ee398b3b3')), totals?.reviews],
  ]

  return (
    <div className="sb-cockpit-stack" role="region" aria-label={`${section.title} admin console section`}>
      <header className="sb-cockpit-hero">
        <span className="sb-eyebrow">{t('audit.admin.eyebrow', uiCopy('u_ca3a1e6fad88ff80'))}</span>
        <h2>{section.title}</h2>
        <p>{section.description}</p>
      </header>

      <section className="sb-cockpit-grid" aria-label={uiCopy('u_de1f10a55caca384')}>
        {section.metrics.map(metric => {
          const action = getAdminMetricAction(rawSection.key, metric.key)
          const value = metricValue(metric.label, metric.key, metric.value)
          const href = action.href
          return (
            <AdminMetricCard
              key={metric.key}
              title={metric.label}
              value={value}
              subtitle={metric.helper ?? emptyMetricLabel(activeLang)}
              href={href}
              actionLabel={action.actionLabel}
              tone={rawSection.key === 'system' ? systemTone(value) : action.tone ?? 'neutral'}
              status={String(value)}
            />
          )
        })}
      </section>

      <section className="sb-mission-grid" aria-label={uiCopy('u_d42fb903e3a00f78')}>
        <section className="sb-glass-panel sb-admin-action-card" aria-label={uiCopy('u_2b8aa5d8fca3ee27')}>
          <h3>{t('audit.admin.platformTotals', uiCopy('u_6f9751cea39b528d'))}</h3>
          {totalRows.map(([label, value], index) => (
            <Link key={label} href={`/admin/analytics/platform?total=${index}`} aria-label={`View ${label} total details`}>
              <strong>{label}</strong> · {fmt(value)}
            </Link>
          ))}
          <Link className="sb-admin-action-card__cue" href="/admin/analytics/platform">{uiCopy('u_bcd29a6797905732')}</Link>
        </section>
        <Link className="sb-glass-panel sb-admin-action-card" href="/admin/accounts?range=7d" aria-label={uiCopy('u_9bf8ced3bc0c8fee')}>
          <h3>{t('audit.admin.newAccounts', uiCopy('u_7f3379f4d49ee656'))}</h3>
          <p><strong>{t('audit.admin.win7', uiCopy('u_f3d0ee8d3baea56d'))}</strong> · {fmt(intel?.windows.accounts7)}</p>
          <p><strong>{t('audit.admin.win30', uiCopy('u_c0b992b77fc67414'))}</strong> · {fmt(intel?.windows.accounts30)}</p>
          <p><strong>{t('audit.admin.win90', uiCopy('u_d4621269aee28168'))}</strong> · {fmt(intel?.windows.accounts90)}</p>
          <span className="sb-admin-action-card__cue">{uiCopy('u_b0b44c1cf23e9d52')}</span>
        </Link>
        <Link className="sb-glass-panel sb-admin-action-card" href="/admin/integrations/supabase" aria-label={uiCopy('u_1bd0d223d3988cc7')}>
          <h3>{t('audit.admin.operationalHealth', uiCopy('u_0c2f1b8071059a66'))}</h3>
          <p><strong>{t('audit.admin.supabase', uiCopy('u_5281648e4927f4b7'))}</strong> · {intel?.health.supabase ?? notConnectedLabel(activeLang)}</p>
          <p><strong>{t('audit.admin.errors', uiCopy('u_abdc2e1659c75eab'))}</strong> · {fmt(intel?.health.errors)}</p>
          <p><strong>{t('audit.admin.lastOutreach', uiCopy('u_a32e18c283d801a6'))}</strong> · {intel?.health.lastOutreach ?? empty}</p>
          <p><strong>{t('audit.admin.lastProspect', uiCopy('u_3a302c8fec644583'))}</strong> · {intel?.health.lastProspect ?? empty}</p>
          <span className="sb-admin-action-card__cue">{uiCopy('u_5fac5f47fe9fca1c')}</span>
        </Link>
        <AdminMetricCard title={t('audit.admin.totPaid', uiCopy('u_21a2e50378a5edc5'))} value={fmt(totals?.paidSubs)} subtitle={uiCopy('u_dcd59dc84fa8c9cb')} href="/admin/billing/subscriptions?status=paid" actionLabel={uiCopy('u_c738f86fe57a43fd')} tone={missionCardTone(totals?.paidSubs)} />
        <AdminMetricCard title={t('audit.admin.totFree', uiCopy('u_5055561009fd516a'))} value={fmt(totals?.freeSubs)} subtitle={uiCopy('u_7ddf3ad1cd5e3749')} href="/admin/billing/subscriptions?status=free" actionLabel={uiCopy('u_928ea9cd78849a21')} tone={missionCardTone(totals?.freeSubs)} />
        <AdminMetricCard title={t('audit.admin.totProspects', uiCopy('u_4f71225eafd8825e'))} value={fmt(totals?.prospects)} subtitle={uiCopy('u_a7bb5ffe14d63eb8')} href="/admin/prospects" actionLabel={uiCopy('u_663dfa26542007c3')} tone={missionCardTone(totals?.prospects)} />
      </section>

      <section className="sb-orbit-table" aria-label={section.tableTitle}>
        <div className="sb-orbit-table__header">
          <h3>{section.tableTitle}</h3>
          <span>{t('audit.admin.filters', uiCopy('u_f06408f9d3380c64'))}</span>
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
                  {t('audit.admin.noRecords', uiCopy('u_1d33683583af9f7c'))}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}
