// saas/components/hub/pages/AIOperationsPage.tsx
'use client'

import { PageProps, cardStyle, labelStyle, rowStyle } from '../shared.tsx'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


const actions = [
  ['Critical', 'Fix public AWS storage exposure', 'Security Alerts'],
  ['High', 'Review OpenAI cost increase', 'Usage & Cost'],
  ['Medium', 'Rotate old Auth0 client secret', 'Keys & Secrets'],
  ['Low', 'Complete Cloudflare setup checklist', 'Setup Center'],
]

export default function AIOperationsPage(_props: PageProps) {
  const { dict } = useI18n()
  return (
    <div className="hub-panel" style={{ height: '100%', overflowY: 'auto', paddingRight: 8 }}>
      <section style={{ marginBottom: 14 }}>
        <div style={labelStyle}>{uiCopy('u_e6a620c688b7c34a')}</div>
        <h2 style={{ margin: '4px 0', fontSize: 26 }}>{t(dict, 'console.aiOps.title', uiCopy('u_4e753c5a93de3e60'))}</h2>
        <p style={{ margin: 0, color: 'rgba(255,255,255,.58)', fontSize: 13.5 }}>{t(dict, 'console.aiOps.subtitle', uiCopy('u_91299343187f8527'))}</p>
      </section>
      <section style={{ ...cardStyle, padding: 16 }}>
        <h3 style={{ margin: '0 0 12px' }}>{t(dict, 'console.aiOps.recommended', uiCopy('u_6fde3a7c0c30ffa8'))}</h3>
        <div style={{ display: 'grid', gap: 10 }}>
          {actions.map(([severity, action, workspace]) => <div key={action} style={rowStyle}><strong style={{ color: severity === 'Critical' ? '#fca5a5' : severity === 'High' ? '#ffc300' : '#1af0ff' }}>{severity}</strong><span>{action}</span><span style={{ color: 'rgba(255,255,255,.56)' }}>{workspace}</span></div>)}
        </div>
      </section>
    </div>
  )
}
