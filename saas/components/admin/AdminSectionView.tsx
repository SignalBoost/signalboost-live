import { AdminSectionConfig } from '@/lib/admin/sections'

const partnerGroups = [
  ['Flights', 'High-intent travel searches, routes, baggage, and timing friction.'],
  ['Hotels', 'Stay recommendations, location fit, comfort, and booking confidence.'],
  ['SIM Cards', 'Connectivity before arrival, roaming avoidance, and local data needs.'],
  ['Insurance', 'Trip protection, medical confidence, and cancellation concerns.'],
  ['Activities', 'Tours, events, local experiences, and last-mile conversion moments.'],
]

export default function AdminSectionView({ section }: { section: AdminSectionConfig }) {
  const isPartners = section.title === 'Partners'

  return (
    <div className="sb-stack">
      <section className="sb-glass sb-stack" style={{ padding: 28 }}>
        <p className="sb-eyebrow">{isPartners ? 'Human intent map' : 'Admin dashboard'}</p>
        <h2 className="sb-h2">{section.title}</h2>
        <p className="sb-body">{section.description}</p>
        {isPartners && <p className="sb-ai-prompt">“Group partner decisions by what the traveler is trying to solve, not by internal vendor lists.”</p>}
      </section>

      {isPartners && (
        <section className="sb-grid-3" aria-label="Partner categories by intent">
          {partnerGroups.map(([title, body]) => (
            <article key={title} className="sb-glass-soft sb-stack" style={{ padding: 20 }}>
              <h3 className="sb-h3">{title}</h3>
              <p className="sb-body" style={{ fontSize: 14 }}>{body}</p>
            </article>
          ))}
        </section>
      )}

      <section className="sb-grid-4">
        {section.metrics.map(metric => (
          <div key={metric.key} className="sb-glass-soft" style={{ padding: 18 }}>
            <p className="sb-caption" style={{ textTransform: 'uppercase', letterSpacing: '0.12em' }}>{metric.label}</p>
            <p className="sb-h3" style={{ marginTop: 8 }}>{metric.value ?? 'Awaiting data'}</p>
          </div>
        ))}
      </section>

      <section className="sb-glass-soft" style={{ overflow: 'hidden' }}>
        <div className="sb-row" style={{ justifyContent: 'space-between', padding: 18, borderBottom: '1px solid var(--border-soft)' }}>
          <h3 className="sb-h3">{section.tableTitle}</h3>
          <span className="sb-caption">Filters: date range • product • country • plan</span>
        </div>
        <div className="sb-table-wrap">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead style={{ background: 'rgba(34,211,238,0.08)', color: 'var(--text-secondary)' }}>
              <tr>{section.tableColumns.map(c => <th key={c} style={{ textAlign: 'left', padding: 14 }}>{c}</th>)}</tr>
            </thead>
            <tbody>
              <tr><td colSpan={section.tableColumns.length} style={{ padding: 28, color: 'var(--text-muted)' }}>Live analytics will appear here as soon as the connected events begin reporting.</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
