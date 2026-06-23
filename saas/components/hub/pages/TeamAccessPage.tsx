'use client'

import { PageProps, cardStyle, labelStyle, rowStyle } from '../shared'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

const roles = [
  ['Owner', 'Full command authority', '1 user'],
  ['Admin', 'Manage providers and alerts', '0 users'],
  ['Editor', 'Acknowledge and resolve alerts', '0 users'],
  ['Viewer', 'Read-only visibility', '0 users'],
]

export default function TeamAccessPage(_props: PageProps) {
  const { dict } = useI18n()
  return (
    <div className="hub-panel" style={{ height: '100%', overflowY: 'auto', paddingRight: 8 }}>
      <section style={{ marginBottom: 14 }}>
        <div style={labelStyle}>Monitor 8</div>
        <h2 style={{ margin: '4px 0', fontSize: 26 }}>{t(dict, 'console.team.title', 'Team & Access')}</h2>
        <p style={{ margin: 0, color: 'rgba(255,255,255,.58)', fontSize: 13.5 }}>{t(dict, 'console.team.subtitle', 'One job: show who can see or change the command center.')}</p>
      </section>
      <section style={{ ...cardStyle, padding: 16 }}>
        <h3 style={{ margin: '0 0 12px' }}>{t(dict, 'console.team.roles', 'Access Roles')}</h3>
        <div style={{ display: 'grid', gap: 10 }}>
          {roles.map(([role, permission, count]) => <div key={role} style={rowStyle}><strong>{role}</strong><span>{permission}</span><span style={{ color: '#1af0ff' }}>{count}</span></div>)}
        </div>
      </section>
    </div>
  )
}
