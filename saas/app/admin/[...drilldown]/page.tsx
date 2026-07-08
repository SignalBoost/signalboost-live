import Link from 'next/link'

type Props = { params: Promise<{ drilldown?: string[] }> }

export default async function AdminDrilldownFallbackPage({ params }: Props) {
  const { drilldown = [] } = await params
  const path = `/admin/${drilldown.join('/')}`

  return (
    <div className="sb-cockpit-stack">
      <header className="sb-cockpit-hero">
        <span className="sb-eyebrow">Protected admin drilldown</span>
        <h2>Admin metric detail</h2>
        <p>This protected catch-all keeps admin metric cards inside the owner/admin cockpit while a more specific drilldown is being prepared.</p>
      </header>
      <section className="sb-glass-panel sb-admin-action-card" aria-label="Admin metric fallback details">
        <h3>{path}</h3>
        <p>No dedicated admin drilldown exists for this route yet. Use the admin console to continue investigating related platform telemetry.</p>
        <Link className="sb-admin-action-card__cue" href="/admin">Back to admin overview →</Link>
      </section>
    </div>
  )
}
