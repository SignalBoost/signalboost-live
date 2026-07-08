'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function Page() {
  const [data, setData] = useState<any>(null)
  useEffect(() => {
    let active = true
    fetch('/api/cos/governance-router', { cache: 'no-store' })
      .then(res => res.ok ? res.json() : null)
      .then(json => { if (active) setData(json) })
      .catch(() => { if (active) setData(null) })
    return () => { active = false }
  }, [])
  const timeline = Array.isArray(data?.timeline) ? data.timeline : []
  return (
    <div className="sb-cockpit-stack">
      <header className="sb-cockpit-hero">
        <span className="sb-eyebrow">Owner/Admin Timeline</span>
        <h2>Governance and operational timeline</h2>
        <p>Events are loaded from COS decision logs and governance telemetry when available; derived/demo rows are labelled by source.</p>
      </header>
      <section className="sb-orbit-table" aria-label="Governance timeline events">
        <div className="sb-orbit-table__header"><h3>Timeline</h3><Link href="/admin/governance">Governance dashboard →</Link></div>
        <table><thead><tr><th>Time</th><th>Type</th><th>Event</th><th>Status</th><th>Source</th></tr></thead><tbody>
          {timeline.length ? timeline.map((e: any) => <tr key={e.id}><td>{e.timestamp ? new Date(e.timestamp).toLocaleString() : '—'}</td><td>{e.type}</td><td>{e.title}</td><td>{e.status}</td><td>{e.telemetry?.row ? 'cos_decisions live log' : 'derived telemetry/example'}</td></tr>) : <tr><td colSpan={5}>No live timeline events yet.</td></tr>}
        </tbody></table>
      </section>
    </div>
  )
}
