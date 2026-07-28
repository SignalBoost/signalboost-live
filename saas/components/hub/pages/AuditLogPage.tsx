// saas/components/hub/pages/AuditLogPage.tsx
'use client'

import { PageProps, cardStyle, labelStyle, rowStyle } from '../shared.tsx'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import { uiText } from '@/lib/i18n/uiText'

const events = [
  ['2 min ago', 'Provider Health check completed', 'System'],
  ['9 min ago', 'Cloudflare alert acknowledged', 'Owner'],
  ['18 min ago', 'OpenAI provider enabled', 'Owner'],
  ['31 min ago', 'Vercel environment scan completed', 'System'],
]

export default function AuditLogPage(_props: PageProps) {
  const { dict } = useI18n()
  return (
    <div className="hub-panel" style={{ height: '100%', overflowY: 'auto', paddingRight: 8 }}>
      <section style={{ marginBottom: 14 }}>
        <div style={labelStyle}>{uiText('generatedUi.u_93bd0e1631bfc950')}</div>
        <h2 style={{ margin: '4px 0', fontSize: 26 }}>{t(dict, 'console.auditLog.title')}</h2>
        <p style={{ margin: 0, color: 'rgba(255,255,255,.58)', fontSize: 13.5 }}>{t(dict, 'console.auditLog.subtitle')}</p>
      </section>
      <section style={{ ...cardStyle, padding: 16 }}>
        <h3 style={{ margin: '0 0 12px' }}>{t(dict, 'console.auditLog.recent')}</h3>
        <div style={{ display: 'grid', gap: 10 }}>
          {events.map(([time, action, actor]) => <div key={action} style={rowStyle}><span style={{ color: '#1af0ff' }}>{time}</span><strong>{action}</strong><span style={{ color: 'rgba(255,255,255,.56)' }}>{actor}</span></div>)}
        </div>
      </section>
    </div>
  )
}
