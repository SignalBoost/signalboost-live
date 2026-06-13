'use client'

import { PageProps, cardStyle, labelStyle, rowStyle } from '../shared'

const actions = [
  ['Critical', 'Fix public AWS storage exposure', 'Security Alerts'],
  ['High', 'Review OpenAI cost increase', 'Usage & Cost'],
  ['Medium', 'Rotate old Auth0 client secret', 'Keys & Secrets'],
  ['Low', 'Complete Cloudflare setup checklist', 'Setup Center'],
]

export default function AIOperationsPage(_props: PageProps) {
  return (
    <div className="hub-panel" style={{ height: '100%', overflowY: 'auto', paddingRight: 8 }}>
      <section style={{ marginBottom: 14 }}>
        <div style={labelStyle}>Monitor 10</div>
        <h2 style={{ margin: '4px 0', fontSize: 26 }}>AI Operations Center</h2>
        <p style={{ margin: 0, color: 'rgba(255,255,255,.58)', fontSize: 13.5 }}>One job: tell the owner what to fix first across health, security, cost, and setup.</p>
      </section>
      <section style={{ ...cardStyle, padding: 16 }}>
        <h3 style={{ margin: '0 0 12px' }}>Recommended Actions</h3>
        <div style={{ display: 'grid', gap: 10 }}>
          {actions.map(([severity, action, workspace]) => <div key={action} style={rowStyle}><strong style={{ color: severity === 'Critical' ? '#fca5a5' : severity === 'High' ? '#ffc300' : '#1af0ff' }}>{severity}</strong><span>{action}</span><span style={{ color: 'rgba(255,255,255,.56)' }}>{workspace}</span></div>)}
        </div>
      </section>
    </div>
  )
}
