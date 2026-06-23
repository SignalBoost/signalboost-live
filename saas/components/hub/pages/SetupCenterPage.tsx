'use client'

import { PageProps, cardStyle, labelStyle, rowStyle } from '../shared'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

const steps = [
  ['Connect OpenAI', 'Add API key and usage visibility', 'Ready'],
  ['Connect Cloudflare', 'Check DNS, SSL, and proxy status', 'Ready'],
  ['Connect AWS', 'Start read-only IAM and S3 checks', 'Planned'],
  ['Invite team', 'Add admins, editors, or viewers', 'Planned'],
]

export default function SetupCenterPage(_props: PageProps) {
  const { dict } = useI18n()
  return (
    <div className="hub-panel" style={{ height: '100%', overflowY: 'auto', paddingRight: 8 }}>
      <section style={{ marginBottom: 14 }}>
        <div style={labelStyle}>Monitor 9</div>
        <h2 style={{ margin: '4px 0', fontSize: 26 }}>{t(dict, 'console.setup.title', 'Setup Center')}</h2>
        <p style={{ margin: 0, color: 'rgba(255,255,255,.58)', fontSize: 13.5 }}>{t(dict, 'console.setup.subtitle', 'One job: guide non-technical users through provider connection and setup.')}</p>
      </section>
      <section style={{ ...cardStyle, padding: 16 }}>
        <h3 style={{ margin: '0 0 12px' }}>{t(dict, 'console.setup.checklist', 'Setup Checklist')}</h3>
        <div style={{ display: 'grid', gap: 10 }}>
          {steps.map(([task, detail, status]) => <div key={task} style={rowStyle}><strong>{task}</strong><span>{detail}</span><span style={{ color: status === 'Ready' ? '#86efac' : '#ffc300' }}>{status}</span></div>)}
        </div>
      </section>
    </div>
  )
}
