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
  const pipelines = Array.isArray(data?.pipelines) ? data.pipelines : []
  const timeline = Array.isArray(data?.timeline) ? data.timeline.slice(0, 8) : []
  return (
    <div className="sb-cockpit-stack">
      <header className="sb-cockpit-hero">
        <span className="sb-eyebrow">Owner/Admin Governance</span>
        <h2>COS governance telemetry</h2>
        <p>Live where connected to COS campaign queue and decision logs. Any fallback or empty-state figures are marked as examples until telemetry is available.</p>
      </header>
      <section className="sb-cockpit-grid" aria-label="Governance pipelines">
        {pipelines.length ? pipelines.map((p: any) => (
          <article className="sb-neon-panel" key={p.id}>
            <p>{p.name}</p>
            <strong>{p.healthScore ?? '—'}%</strong>
            <span>Status: {p.status || 'unknown'} · Source: {p.telemetry?.source || 'live/default mix'}</span>
          </article>
        )) : (
          <article className="sb-neon-panel"><p>Example governance pipeline</p><strong>Demo</strong><span>No live governance telemetry returned yet.</span></article>
        )}
      </section>
      <section className="sb-orbit-table" aria-label="Governance timeline">
        <div className="sb-orbit-table__header"><h3>Recent governance events</h3><Link href="/admin/timeline">Open full timeline →</Link></div>
        <table><thead><tr><th>Time</th><th>Event</th><th>Status</th><th>Source</th></tr></thead><tbody>
          {timeline.length ? timeline.map((e: any) => <tr key={e.id}><td>{e.timestamp ? new Date(e.timestamp).toLocaleString() : '—'}</td><td>{e.title}</td><td>{e.status}</td><td>{e.telemetry?.row ? 'cos_decisions live log' : 'derived telemetry/example'}</td></tr>) : <tr><td colSpan={4}>No live governance events yet. Demo examples are intentionally not shown as live activity.</td></tr>}
        </tbody></table>
      </section>
    </div>
  )
}
