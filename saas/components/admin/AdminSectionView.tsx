import { AdminSectionConfig } from '@/lib/admin/sections'
import { COCKPIT_PANELS, CRM_STAGES, EXECUTIVE_RECOMMENDATIONS, FINANCIAL_LEDGER, FORECASTS, KPI_DASHBOARD } from '@/lib/platform/unifiedPlatform'

export default function AdminSectionView({ section }: { section: AdminSectionConfig }) {
  return (
    <div className="sb-cockpit-stack" role="region" aria-label={`${section.title} admin console section`}>
      <header className="sb-cockpit-hero">
        <span className="sb-eyebrow">NASA-style admin console</span>
        <h2>{section.title}</h2>
        <p>{section.description}</p>
      </header>

      <section className="sb-cockpit-grid" aria-label="Dashboard panels">
        {section.metrics.map(metric => (
          <article key={metric.key} className="sb-neon-panel" tabIndex={0}>
            <p>{metric.label}</p>
            <strong>{metric.value ?? 'Not tracked yet'}</strong>
            <span>{metric.helper ?? 'Telemetry-ready signal'}</span>
          </article>
        ))}
      </section>

      <section className="sb-mission-grid" aria-label="Unified operational intelligence">
        <article className="sb-glass-panel">
          <h3>Forecasting</h3>
          {FORECASTS.map(item => <p key={item.horizon}><strong>{item.horizon}</strong> · {item.revenue} · campaign {item.campaignSuccess} · upsell {item.upsellLikelihood}</p>)}
        </article>
        <article className="sb-glass-panel">
          <h3>Financial ledger</h3>
          {Object.entries(FINANCIAL_LEDGER).map(([key, value]) => <p key={key}><strong>{key.replace(/([A-Z])/g, ' $1')}</strong> · {value}</p>)}
        </article>
        <article className="sb-glass-panel">
          <h3>KPI cockpit</h3>
          <p><strong>Marketplace</strong> · {KPI_DASHBOARD.marketplace.join(' · ')}</p>
          <p><strong>SaaS</strong> · {KPI_DASHBOARD.saas.join(' · ')}</p>
          <p><strong>Unified engagement index</strong> · {KPI_DASHBOARD.unifiedEngagementIndex}</p>
        </article>
        <article className="sb-glass-panel">
          <h3>CRM pipeline</h3>
          {CRM_STAGES.map(stage => <p key={stage.stage}><strong>{stage.stage}</strong> · {Math.round(stage.probability * 100)}% · {stage.automation}</p>)}
        </article>
      </section>

      <section className="sb-orbit-table" aria-label={section.tableTitle}>
        <div className="sb-orbit-table__header">
          <h3>{section.tableTitle}</h3>
          <span>Filters: date range • product • country • plan • role</span>
        </div>
        <table>
          <thead><tr>{section.tableColumns.map(c => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            <tr><td colSpan={section.tableColumns.length}>Telemetry-ready. Connect analytics tables/events to activate live records for this cockpit panel.</td></tr>
          </tbody>
        </table>
      </section>

      <section className="sb-mission-grid" aria-label="Executive recommendations">
        {COCKPIT_PANELS.slice(0, 3).map(panel => <article key={panel.title} className="sb-glass-panel"><h3>{panel.title}</h3><p><strong>{panel.value}</strong></p><p>{panel.status}</p></article>)}
        <article className="sb-glass-panel"><h3>Concierge recommendations</h3>{EXECUTIVE_RECOMMENDATIONS.map(item => <p key={item}>• {item}</p>)}</article>
      </section>
    </div>
  )
}
