'use client'

import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

export type OperatorJobView = {
  state: string
  publishMessage: string
}

export default function OperatorStatus({ job }: { job: OperatorJobView }) {
  const { dict } = useI18n()

  return (
    <section className="hero-panel" style={{ marginTop: 16, padding: 20 }}>
      <h3 style={{ color: '#fff' }}>{t(dict, 'operator.publish_status.title', 'Publish status')}</h3>
      <p style={{ color: 'var(--text-secondary)' }}>{t(dict, 'operator.publish_status.state_label', 'State:')} <strong>{job.state}</strong></p>
      <p style={{ color: 'var(--text-secondary)' }}>{job.publishMessage}</p>
    </section>
  )
}
