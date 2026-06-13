'use client'

import { PageProps, cardStyle, labelStyle, rowStyle } from '../shared'

const events = [
  ['2 min ago', 'Provider Health check completed', 'System'],
  ['9 min ago', 'Cloudflare alert acknowledged', 'Owner'],
  ['18 min ago', 'OpenAI provider enabled', 'Owner'],
  ['31 min ago', 'Vercel environment scan completed', 'System'],
]

export default function AuditLogPage(_props: PageProps) {
  return (
    <div className="hub-panel" style={{ height: '100%', overflowY: 'auto', paddingRight: 8 }}>
      <section style={{ marginBottom: 14 }}>
        <div style={labelStyle}>Monitor 7</div>
        <h2 style={{ margin: '4px 0', fontSize: 26 }}>Audit Log</h2>
        <p style={{ margin: 0, color: 'rgba(255,255,255,.58)', fontSize: 13.5 }}>One job: show what changed, who changed it, and when.</p>
      </section>
      <section style={{ ...cardStyle, padding: 16 }}>
        <h3 style={{ margin: '0 0 12px' }}>Recent Activity</h3>
        <div style={{ display: 'grid', gap: 10 }}>
          {events.map(([time, action, actor]) => <div key={action} style={rowStyle}><span style={{ color: '#1af0ff' }}>{time}</span><strong>{action}</strong><span style={{ color: 'rgba(255,255,255,.56)' }}>{actor}</span></div>)}
        </div>
      </section>
    </div>
  )
}
