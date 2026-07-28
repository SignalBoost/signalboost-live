'use client'

import { useTranslation } from '@/components/i18n/useTranslation'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


export type OperatorJobView = {
  state: string
  publishMessage: string
}

export default function OperatorStatus({ job }: { job: OperatorJobView }) {
  const { t } = useTranslation()
  return (
    <section className="hero-panel" style={{ marginTop: 16, padding: 20 }}>
      <h3 style={{ color: '#fff' }}>{t('operator.status.title', uiCopy('u_29cba21ea6d83e67'))}</h3>
      <p style={{ color: 'var(--text-secondary)' }}>{t('operator.status.state', uiCopy('u_7b00908cfac87a4f'))} <strong>{job.state}</strong></p>
      <p style={{ color: 'var(--text-secondary)' }}>{job.publishMessage}</p>
    </section>
  )
}
