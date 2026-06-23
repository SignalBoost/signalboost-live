'use client'

import { PageProps, cardStyle, labelStyle, rowStyle } from '../shared'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

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
        <div style={labelStyle}>Monitor 6</div>
        <h2 style={{ margin: '4px 0', fontSize: 26 }}>{t(dict, 'console.usageCost.title', 'Usage & Cost')}</h2>
        <p style={{ margin: 0, color: 'rgba(255,255,255,.58)', fontSize: 13.5 }}>{t(dict, 'console.usageCost.subtitle', 'One job: show spend, usage increases, and cost risks before invoices surprise the owner.')}</p>
      </section>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12, marginBottom: 14 }}>
        {['Today', 'This Week', 'This Month', 'Threshold Alerts'].map((item, index) => <div key={item} style={{ ...cardStyle, padding: 16 }}><div style={labelStyle}>{item}</div><div style={{ fontSize: 24, fontWeight: 950, color: index === 3 ? '#ffc300' : '#1af0ff' }}>{index === 3 ? '2' : 'Ready'}</div></div>)}
      </section>
      <section style={{ ...cardStyle, padding: 16 }}>
        <h3 style={{ margin: '0 0 12px' }}>{t(dict, 'console.usageCost.signals', 'Provider Usage Signals')}</h3>
        <div style={{ display: 'grid', gap: 10 }}>
          {rows.map(([provider, metric, change, note]) => <div key={provider} style={rowStyle}><strong>{provider}</strong><span>{metric}</span><span style={{ color: '#ffc300' }}>{change}</span><span style={{ color: 'rgba(255,255,255,.56)' }}>{note}</span></div>)}
        </div>
      </section>
    </div>
  )
}
