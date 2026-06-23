'use client'

import { useTranslation } from '@/components/i18n/useTranslation'

export type OperatorJobView = {
  state: string
  publishMessage: string
}

export default function OperatorStatus({ job }: { job: OperatorJobView }) {
  const { t } = useTranslation()
  return (
    <section className="hero-panel" style={{ marginTop: 16, padding: 20 }}>
      <h3 style={{ color: '#fff' }}>{t('operator.status.title', 'Publish status')}</h3>
      <p style={{ color: 'var(--text-secondary)' }}>{t('operator.status.state', 'State:')} <strong>{job.state}</strong></p>
      <p style={{ color: 'var(--text-secondary)' }}>{job.publishMessage}</p>
    </section>
  )
}
