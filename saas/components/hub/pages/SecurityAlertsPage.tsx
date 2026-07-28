// saas/components/hub/pages/SecurityAlertsPage.tsx
'use client'

import { PageProps, cardStyle, labelStyle, rowStyle } from '../shared.tsx'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


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
        <div style={labelStyle}>{uiCopy('u_1f35fff3759ad204')}</div>
        <h2 style={{ margin: '4px 0', fontSize: 26 }}>{t(dict, 'console.securityAlerts.title', uiCopy('u_870b126030e4971d'))}</h2>
        <p style={{ margin: 0, color: 'rgba(255,255,255,.58)', fontSize: 13.5 }}>{t(dict, 'console.securityAlerts.subtitle', uiCopy('u_8d8ca4f2645023f3'))}</p>
      </section>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12, marginBottom: 14 }}>
        {[uiCopy('u_fa2624a09f7fe82e'), uiCopy('u_63377dbc513ce317'), uiCopy('u_5224e9b5db7ac61c'), uiCopy('u_c155a5d86e42442b')].map((item, index) => <div key={item} style={{ ...cardStyle, padding: 16 }}><div style={labelStyle}>{item}</div><div style={{ fontSize: 28, fontWeight: 950, color: index === 0 ? '#fca5a5' : index === 1 ? '#ffc300' : '#1af0ff' }}>{index === 3 ? 0 : index + 1}</div></div>)}
      </section>
      <section style={{ ...cardStyle, padding: 16 }}>
        <h3 style={{ margin: '0 0 12px' }}>{t(dict, 'console.securityAlerts.findings', uiCopy('u_3fb0161862c255db'))}</h3>
        <div style={{ display: 'grid', gap: 10 }}>
          {alerts.map(([severity, provider, title, fix]) => <div key={title} style={rowStyle}><strong style={{ color: severity === 'Critical' ? '#fca5a5' : '#ffc300' }}>{severity}</strong><span>{provider}</span><span>{title}</span><span style={{ color: 'rgba(255,255,255,.56)' }}>{fix}</span></div>)}
        </div>
      </section>
    </div>
  )
}
