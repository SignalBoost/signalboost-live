'use client'

import { PageProps, cardStyle, labelStyle, rowStyle } from '../shared'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

const alerts = [
  ['Critical', 'AWS', 'Public S3 bucket', 'Block public access and review bucket policy.'],
  ['High', 'Cloudflare', 'Origin IP exposed', 'Enable proxy or move origin behind protection.'],
  ['High', 'Firebase', 'Public rule risk', 'Review Firestore and Storage rules.'],
  ['Medium', 'Auth0', 'Old client secret', 'Rotate secret and record audit event.'],
]

export default function SecurityAlertsPage(_props: PageProps) {
  const { dict } = useI18n()
  return (
    <div className="hub-panel" style={{ height: '100%', overflowY: 'auto', paddingRight: 8 }}>
      <section style={{ marginBottom: 14 }}>
        <div style={labelStyle}>Monitor 5</div>
        <h2 style={{ margin: '4px 0', fontSize: 26 }}>{t(dict, 'console.securityAlerts.title', 'Security Alerts')}</h2>
        <p style={{ margin: 0, color: 'rgba(255,255,255,.58)', fontSize: 13.5 }}>{t(dict, 'console.securityAlerts.subtitle', 'One job: show what is dangerous and what should be fixed first.')}</p>
      </section>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12, marginBottom: 14 }}>
        {['Critical', 'High', 'Medium', 'Resolved'].map((item, index) => <div key={item} style={{ ...cardStyle, padding: 16 }}><div style={labelStyle}>{item}</div><div style={{ fontSize: 28, fontWeight: 950, color: index === 0 ? '#fca5a5' : index === 1 ? '#ffc300' : '#1af0ff' }}>{index === 3 ? 0 : index + 1}</div></div>)}
      </section>
      <section style={{ ...cardStyle, padding: 16 }}>
        <h3 style={{ margin: '0 0 12px' }}>{t(dict, 'console.securityAlerts.findings', 'Open Security Findings')}</h3>
        <div style={{ display: 'grid', gap: 10 }}>
          {alerts.map(([severity, provider, title, fix]) => <div key={title} style={rowStyle}><strong style={{ color: severity === 'Critical' ? '#fca5a5' : '#ffc300' }}>{severity}</strong><span>{provider}</span><span>{title}</span><span style={{ color: 'rgba(255,255,255,.56)' }}>{fix}</span></div>)}
        </div>
      </section>
    </div>
  )
}
