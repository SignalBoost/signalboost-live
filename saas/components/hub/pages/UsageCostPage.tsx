// saas/components/hub/pages/UsageCostPage.tsx
'use client'

import { PageProps, cardStyle, labelStyle, rowStyle } from '../shared.tsx'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import { uiText } from '@/lib/i18n/uiText'

const rows = [
  ['OpenAI', 'AI tokens', '+18%', 'Watch usage and model mix.'],
  ['Twilio', 'SMS verification', '+7%', 'Normal weekly growth.'],
  ['SendGrid', 'Email volume', '+3%', 'Healthy delivery pattern.'],
  ['Vercel', 'Build minutes', '+11%', 'Review failed build loops.'],
]

export default function UsageCostPage(_props: PageProps) {
  const { dict } = useI18n()
  return (
    <div className="hub-panel" style={{ height: '100%', overflowY: 'auto', paddingRight: 8 }}>
      <section style={{ marginBottom: 14 }}>
        <div style={labelStyle}>{uiText('generatedUi.u_79480913f3e63c40')}</div>
        <h2 style={{ margin: '4px 0', fontSize: 26 }}>{t(dict, 'console.usageCost.title')}</h2>
        <p style={{ margin: 0, color: 'rgba(255,255,255,.58)', fontSize: 13.5 }}>{t(dict, 'console.usageCost.subtitle')}</p>
      </section>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12, marginBottom: 14 }}>
        {["Today", "This Week", "This Month", "Threshold Alerts"].map((item, index) => <div key={item} style={{ ...cardStyle, padding: 16 }}><div style={labelStyle}>{item}</div><div style={{ fontSize: 24, fontWeight: 950, color: index === 3 ? '#ffc300' : '#1af0ff' }}>{index === 3 ? '2' : uiText('generatedUi.u_5fa7aac5375c5815')}</div></div>)}
      </section>
      <section style={{ ...cardStyle, padding: 16 }}>
        <h3 style={{ margin: '0 0 12px' }}>{t(dict, 'console.usageCost.signals')}</h3>
        <div style={{ display: 'grid', gap: 10 }}>
          {rows.map(([provider, metric, change, note]) => <div key={provider} style={rowStyle}><strong>{provider}</strong><span>{metric}</span><span style={{ color: '#ffc300' }}>{change}</span><span style={{ color: 'rgba(255,255,255,.56)' }}>{note}</span></div>)}
        </div>
      </section>
    </div>
  )
}
