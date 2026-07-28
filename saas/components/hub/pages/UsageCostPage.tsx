// saas/components/hub/pages/UsageCostPage.tsx
'use client'

import { PageProps, cardStyle, labelStyle, rowStyle } from '../shared.tsx'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


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
        <div style={labelStyle}>{uiCopy('u_bcd34e26e1e352dd')}</div>
        <h2 style={{ margin: '4px 0', fontSize: 26 }}>{t(dict, 'console.usageCost.title', uiCopy('u_fc3229874e082776'))}</h2>
        <p style={{ margin: 0, color: 'rgba(255,255,255,.58)', fontSize: 13.5 }}>{t(dict, 'console.usageCost.subtitle', uiCopy('u_019533e76a3eae7d'))}</p>
      </section>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12, marginBottom: 14 }}>
        {[uiCopy('u_c50fb3652fc488f1'), uiCopy('u_f2de157c2baea52a'), uiCopy('u_7822d7dbe9a4d299'), uiCopy('u_403e8195ec706db5')].map((item, index) => <div key={item} style={{ ...cardStyle, padding: 16 }}><div style={labelStyle}>{item}</div><div style={{ fontSize: 24, fontWeight: 950, color: index === 3 ? '#ffc300' : '#1af0ff' }}>{index === 3 ? '2' : uiCopy('u_f1dfe7be5147cafb')}</div></div>)}
      </section>
      <section style={{ ...cardStyle, padding: 16 }}>
        <h3 style={{ margin: '0 0 12px' }}>{t(dict, 'console.usageCost.signals', uiCopy('u_7b1101a2556f933a'))}</h3>
        <div style={{ display: 'grid', gap: 10 }}>
          {rows.map(([provider, metric, change, note]) => <div key={provider} style={rowStyle}><strong>{provider}</strong><span>{metric}</span><span style={{ color: '#ffc300' }}>{change}</span><span style={{ color: 'rgba(255,255,255,.56)' }}>{note}</span></div>)}
        </div>
      </section>
    </div>
  )
}
