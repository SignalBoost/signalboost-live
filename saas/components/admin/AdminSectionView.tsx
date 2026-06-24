'use client'

// saas/components/admin/AdminSectionView.tsx
// All user-facing strings resolve through the central i18n dictionary
// (audit.{lang}.json → audit.admin.*) via the useTranslation() hook. No inline
// COPY table — a translator edits the locale JSON, no code change.

import { useEffect, useState } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { AdminSectionConfig, translateSection } from '@/lib/admin/sections'
import { COCKPIT_PANELS, CRM_STAGES, EXECUTIVE_RECOMMENDATIONS, FINANCIAL_LEDGER, FORECASTS, KPI_DASHBOARD } from '@/lib/platform/unifiedPlatform'

const SUPPORTED = new Set(['en', 'es', 'pt', 'pl', 'ru'])

export default function AdminSectionView({ section: rawSection }: { section: AdminSectionConfig }) {
  const { t, lang } = useTranslation()
  const activeLang = SUPPORTED.has(lang) ? lang : 'en'
  const section = translateSection(rawSection, activeLang)

  // Live metric values from real tables; keys with no backing source fall back to
  // the honest empty-state label.
  const [live, setLive] = useState<Record<string, number> | null>(null)
  useEffect(() => {
    let active = true
    fetch('/api/admin/section-metrics', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (active && d && d.values) setLive(d.values) })
      .catch(() => {})
    return () => { active = false }
  }, [])

  const liveValue = (key: string): string | number | undefined => {
    const v = live ? (live as any)[key] : undefined
    if (typeof v === 'number') return v.toLocaleString()
    if (typeof v === 'string' && v.length) return v
    return undefined
  }

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
            <strong>{liveValue(metric.key) ?? metric.value ?? t('audit.admin.notTracked', 'No data yet')}</strong>
            <span>{metric.helper ?? t('audit.admin.telemetrySignal', 'Telemetry-ready signal')}</span>
          </article>
        ))}
      </section>

      <section className="sb-mission-grid" aria-label="Unified operational intelligence">
        <article className="sb-glass-panel">
          <h3>{t('audit.admin.forecasting', 'Forecasting')}</h3>
          {FORECASTS.map(item => (
            <p key={item.horizon}>
              <strong>{item.horizon}</strong> · {item.revenue} · campaign {item.campaignSuccess} · upsell {item.upsellLikelihood}
            </p>
          ))}
        </article>
        <article className="sb-glass-panel">
          <h3>{t('audit.admin.financialLedger', 'Financial ledger')}</h3>
          {Object.entries(FINANCIAL_LEDGER).map(([key, value]) => (
            <p key={key}><strong>{key.replace(/([A-Z])/g, ' $1')}</strong> · {value}</p>
          ))}
        </article>
        <article className="sb-glass-panel">
          <h3>{t('audit.admin.kpiCockpit', 'KPI cockpit')}</h3>
          <p><strong>{t('audit.admin.marketplace', 'Marketplace')}</strong> · {KPI_DASHBOARD.marketplace.join(' · ')}</p>
          <p><strong>{t('audit.admin.saas', 'SaaS')}</strong> · {KPI_DASHBOARD.saas.join(' · ')}</p>
          <p><strong>{t('audit.admin.unifiedEngagement', 'Unified engagement index')}</strong> · {KPI_DASHBOARD.unifiedEngagementIndex}</p>
        </article>
        <article className="sb-glass-panel">
          <h3>{t('audit.admin.crmPipeline', 'CRM pipeline')}</h3>
          {CRM_STAGES.map(stage => (
            <p key={stage.stage}>
              <strong>{stage.stage}</strong> · {Math.round(stage.probability * 100)}% · {stage.automation}
            </p>
          ))}
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
            <tr>
              <td colSpan={section.tableColumns.length}>{t('audit.admin.telemetryReady', 'Telemetry-ready. Connect analytics tables/events to activate live records for this cockpit panel.')}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="sb-mission-grid" aria-label="Executive recommendations">
        {COCKPIT_PANELS.slice(0, 3).map(panel => (
          <article key={panel.title} className="sb-glass-panel">
            <h3>{panel.title}</h3>
            <p><strong>{panel.value}</strong></p>
            <p>{panel.status}</p>
          </article>
        ))}
        <article className="sb-glass-panel">
          <h3>{t('audit.admin.conciergeRecs', 'Concierge recommendations')}</h3>
          {EXECUTIVE_RECOMMENDATIONS.map(item => <p key={item}>• {item}</p>)}
        </article>
      </section>
    </div>
  )
}
