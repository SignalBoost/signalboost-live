import Link from 'next/link'

type EventRow = { label: string; status: string; detail: string }

type Props = {
  title: string
  status: string
  timestamp?: string
  action: string
  events?: EventRow[]
  externalUrl?: string
  externalLabel?: string
}

export default function AdminDrilldownPage({ title, status, timestamp, action, events = [], externalUrl, externalLabel }: Props) {
  const checkedAt = timestamp ?? new Date().toISOString()
  const rows = events.length ? events : [
    { label: title, status, detail: 'No related events have been recorded yet. Live logs will appear here when available.' },
  ]

  return (
    <div className="sb-cockpit-stack" role="region" aria-label={`${title} drill-down`}>
      <header className="sb-cockpit-hero">
        <span className="sb-eyebrow">Owner/admin investigation</span>
        <h2>{title}</h2>
        <p>Current status: <strong>{status}</strong></p>
        <p>Timestamp: <time dateTime={checkedAt}>{checkedAt}</time></p>
        <p>Recommended action: {action}</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 18 }}>
          <Link className="sb-service-pill" href="/admin/system">← System Health</Link>
          {externalUrl ? (
            <a className="sb-service-pill" href={externalUrl} target="_blank" rel="noopener noreferrer">
              {externalLabel ?? 'Open external dashboard'} →
            </a>
          ) : null}
        </div>
      </header>

      <section className="sb-orbit-table" aria-label="Latest related logs or events">
        <div className="sb-orbit-table__header">
          <h3>Latest related logs or events</h3>
          <span>{checkedAt}</span>
        </div>
        <table>
          <thead><tr><th>Event</th><th>Status</th><th>Details</th></tr></thead>
          <tbody>
            {rows.map((event) => (
              <tr key={`${event.label}-${event.detail}`}>
                <td>{event.label}</td>
                <td>{event.status}</td>
                <td>{event.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
