import Link from 'next/link'

export default function AssistantWireframePage() {
  return (
    <main className="sb-hmi-shell">
      <section className="sb-hmi-hero" aria-labelledby="module-title">
        <p className="sb-hmi-kicker">SaaS module wireframe</p>
        <h1 id="module-title">🛰️ Personal Assistant</h1>
        <p>Preview personal task command, reminder timelines, and productivity telemetry before production build.</p>
        <div className="sb-hmi-cta-row">
          <Link className="sb-button-secondary" href="/dashboard/wireframes">Back to unified wireframes</Link>
          <Link className="sb-button-primary" href="/pricing#saas-modules">View pricing</Link>
        </div>
      </section>
      <section className="sb-hmi-module" style={{ marginTop: 24 }} tabIndex={0}>
        <div className="sb-hmi-module__top">
          <span className="sb-hmi-icon">🛰️</span>
          <div>
            <p className="sb-hmi-kicker">Approval preview</p>
            <h2>Personal Assistant cockpit layout</h2>
          </div>
          <strong>01</strong>
        </div>
        <div className="sb-hmi-module__grid">
          <div className="sb-hmi-panel sb-hmi-panel--primary"><span>Task list panel</span><div className="sb-hmi-form-lines"><i /><i /><i /></div></div>
          <div className="sb-hmi-panel"><span>Reminder timeline</span><div className="sb-hmi-chart"><span style={{ height: '36%', background: 'linear-gradient(180deg, #1af0ff, rgba(26,240,255,.18))' }} /><span style={{ height: '70%', background: 'linear-gradient(180deg, #1af0ff, rgba(26,240,255,.18))' }} /><span style={{ height: '52%', background: 'linear-gradient(180deg, #1af0ff, rgba(26,240,255,.18))' }} /><span style={{ height: '86%', background: 'linear-gradient(180deg, #1af0ff, rgba(26,240,255,.18))' }} /></div></div>
          <div className="sb-hmi-panel"><span>Productivity insights chart</span><div className="sb-hmi-feed"><i /><i /><i /></div></div>
        </div>
      </section>
    </main>
  )
}
