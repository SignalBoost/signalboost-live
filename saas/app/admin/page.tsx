import { ADMIN_SIDEBAR, COCKPIT_PANELS, CRM_STAGES, EXECUTIVE_RECOMMENDATIONS, FINANCIAL_LEDGER, FORECASTS, KPI_DASHBOARD } from '@/lib/platform/unifiedPlatform'

export default function AdminOverviewPage() {
  return (
    <div className="sb-cockpit-stack">
      <section className="sb-admin-topbar" role="banner" aria-label="Executive Dashboard">
        <div>
          <p className="sb-eyebrow">Executive Dashboard</p>
          <h1>Unified SignalBoost mission control</h1>
          <p className="sb-body">Financial, KPI, CRM, Outreach, Forecasting, Marketplace, SaaS, and Concierge telemetry consolidated into one owner/admin cockpit.</p>
        </div>
        <span className="sb-role-pill">Restricted: Owner/Admin</span>
      </section>

      <section className="sb-cockpit-grid" aria-label="Admin Console sidebar sections">
        {ADMIN_SIDEBAR.map(item => (
          <a key={item.href} className="sb-neon-panel" href={item.href} aria-label={`Open ${item.label}`}>
            <p><span aria-hidden="true">{item.icon}</span> {item.label}</p>
            <strong>Open panel</strong>
            <span>Keyboard-focusable NASA glass navigation with hover glow.</span>
          </a>
        ))}
      </section>

      <section className="sb-mission-grid" aria-label="Cockpit panels">
        {COCKPIT_PANELS.map(panel => (
          <article key={panel.title} className="sb-glass-panel" tabIndex={0}>
            <h3>{panel.title}</h3>
            <p><strong>{panel.value}</strong></p>
            <p>{panel.status}</p>
          </article>
        ))}
      </section>

      <section className="sb-wireframe" aria-label="Wireframe preview for pull request">
        <div className="sb-wireframe__markers">
          <span>▣ Desktop: sidebar + master cockpit</span>
          <span>▤ Mobile: stacked neon cards</span>
          <span>⌨ ARIA regions + keyboard focus</span>
        </div>
        <div className="sb-wireframe__canvas">
          <aside className="sb-wireframe__sidebar">
            <span className="sb-wireframe__label">Sidebar</span>
            {ADMIN_SIDEBAR.slice(0, 5).map(item => <div key={item.label} className="sb-wireframe__box">{item.icon} {item.label}</div>)}
          </aside>
          <div className="sb-wireframe__flow" aria-hidden="true"><span>→</span><span>→</span><span>→</span></div>
          <main className="sb-wireframe__main">
            <div className="sb-wireframe__topbar">Executive Cockpit <span>Owner/Admin</span></div>
            <div className="sb-wireframe__grid">
              {['Financial', 'KPI', 'CRM', 'Outreach', 'Forecasting', 'Concierge'].map(card => <div key={card} className="sb-wireframe__box sb-wireframe__box--main">{card}</div>)}
            </div>
          </main>
        </div>
      </section>

      <section className="sb-mission-grid" aria-label="Executive intelligence">
        <article className="sb-glass-panel"><h3>Financial dashboard</h3>{Object.entries(FINANCIAL_LEDGER).map(([key, value]) => <p key={key}><strong>{key.replace(/([A-Z])/g, ' $1')}</strong> · {value}</p>)}</article>
        <article className="sb-glass-panel"><h3>KPI dashboard</h3><p><strong>Marketplace</strong> · {KPI_DASHBOARD.marketplace.join(' · ')}</p><p><strong>SaaS</strong> · {KPI_DASHBOARD.saas.join(' · ')}</p><p><strong>Unified engagement index</strong> · {KPI_DASHBOARD.unifiedEngagementIndex}</p></article>
        <article className="sb-glass-panel"><h3>Forecasting</h3>{FORECASTS.map(item => <p key={item.horizon}><strong>{item.horizon}</strong> · {item.revenue} · campaign {item.campaignSuccess} · churn {item.churnRisk}</p>)}</article>
        <article className="sb-glass-panel"><h3>CRM + Outreach</h3>{CRM_STAGES.map(stage => <p key={stage.stage}><strong>{stage.stage}</strong> · {stage.automation}</p>)}</article>
        <article className="sb-glass-panel sb-glass-panel--wide"><h3>Concierge executive insights</h3>{EXECUTIVE_RECOMMENDATIONS.map(item => <p key={item}>• {item}</p>)}</article>
      </section>
    </div>
  )
}
